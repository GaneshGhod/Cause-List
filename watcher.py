"""Inbox Directory Polling and Pipeline Orchestrator for Cause List Bot.

Polls the data/inbox directory for newly dropped High Court cause list PDFs.
Extracts tabular rows once, filters matches per active subscriber, generates
custom per-advocate PDFs, sends via WhatsApp, logs all actions, and moves
completed PDFs to the archive directory.
"""

import json
import logging
import os
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

import config
from pdf_builder import build_case_pdf
from pdf_parser import extract_all_rows, match_rows_for_subscriber
from whatsapp_sender import send_pdf

# Setup logging to both console and file
logger = logging.getLogger("cause_list_bot")
logger.setLevel(logging.INFO)

# Formatter
formatter = logging.Formatter(
    "[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

# File Handler
if not logger.handlers:
    try:
        fh = logging.FileHandler(config.LOG_FILE, encoding="utf-8")
        fh.setLevel(logging.INFO)
        fh.setFormatter(formatter)
        logger.addHandler(fh)
    except Exception as e:
        print(f"Warning: Could not attach FileHandler to {config.LOG_FILE}: {e}")

    # Console Handler
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(formatter)
    logger.addHandler(ch)


def load_subscribers(filepath: Optional[Path] = None) -> List[Dict[str, Any]]:
    """Load and return the list of subscribers from subscribers.json."""
    sub_path = filepath or config.SUBSCRIBERS_FILE
    if not sub_path.exists():
        logger.warning(f"Subscribers file not found at {sub_path}. Returning empty list.")
        return []

    try:
        with open(sub_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception as e:
        logger.error(f"Error loading subscribers from {sub_path}: {e}")
        return []


def process_cause_list_file(
    pdf_path: Path,
    move_to_archive: bool = True,
    progress_callback: Optional[Any] = None
) -> Dict[str, Any]:
    """Execute the end-to-end processing pipeline on a single cause list PDF.

    1. Parse table once from the PDF using pdfplumber.
    2. Iterate through all ACTIVE subscribers.
    3. Filter rows matching each subscriber's name variants.
    4. Build customized PDF via reportlab if matters are found.
    5. Send via WhatsApp to each subscriber's mobile number.
    6. Move source PDF to data/archive.

    Returns:
        Summary dict containing counts, matched statistics, and per-subscriber results.
    """
    start_time = time.time()
    pdf_path = Path(pdf_path)
    logger.info(f"=== Starting Cause List Pipeline for: {pdf_path.name} ===")

    if progress_callback:
        progress_callback("parsing", f"Parsing tabular cause list from {pdf_path.name}...")

    # Step 1: Parse PDF once
    try:
        headers, all_rows, metadata = extract_all_rows(str(pdf_path))
    except Exception as e:
        logger.error(f"Failed to parse cause list PDF {pdf_path.name}: {e}", exc_info=True)
        if progress_callback:
            progress_callback("error", f"Parsing failed: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "file": pdf_path.name,
            "total_rows": 0,
            "subscriber_results": []
        }

    logger.info(f"Source table parsed: {len(all_rows)} total rows found across {metadata.get('total_pages', '?')} pages.")

    # Step 2: Load Active Subscribers
    all_subscribers = load_subscribers()
    active_subscribers = [s for s in all_subscribers if s.get("active", False)]
    logger.info(f"Loaded {len(all_subscribers)} subscribers ({len(active_subscribers)} active).")

    if progress_callback:
        progress_callback("matching", f"Extracted {len(all_rows)} cases. Matching against {len(active_subscribers)} active subscribers...")

    subscriber_results = []
    sent_count = 0
    no_cases_count = 0
    failed_count = 0

    # Step 3: Filter, Build, Send for each active subscriber
    for idx, sub in enumerate(active_subscribers, start=1):
        sub_id = sub.get("id", f"SUB-{idx}")
        name = sub.get("display_name", "Advocate")
        variants = sub.get("name_variants", [])
        phone = sub.get("whatsapp_number", "")

        logger.info(f"Checking subscriber [{idx}/{len(active_subscribers)}]: {name} ({sub_id})")

        # Match rows
        matches = match_rows_for_subscriber(all_rows, variants)

        if not matches:
            logger.info(f"&bull; {name}: 0 cases listed today.")
            no_cases_count += 1
            subscriber_results.append({
                "subscriber_id": sub_id,
                "display_name": name,
                "whatsapp_number": phone,
                "matches_count": 0,
                "status": "no_cases_found",
                "pdf_path": None,
                "message": "No cases found in today's cause list"
            })
            if progress_callback:
                progress_callback("subscriber_progress", f"[{idx}/{len(active_subscribers)}] {name}: No cases found.")
            continue

        logger.info(f"&bull; {name}: MATCHED {len(matches)} case(s)!")

        if progress_callback:
            progress_callback("building", f"Building custom PDF for {name} ({len(matches)} matters)...")

        # Build custom PDF
        try:
            output_pdf = build_case_pdf(
                header_info=metadata,
                matches=matches,
                subscriber_id=sub_id,
                subscriber_name=name
            )
        except Exception as e:
            logger.error(f"Error building PDF for {name}: {e}")
            failed_count += 1
            subscriber_results.append({
                "subscriber_id": sub_id,
                "display_name": name,
                "whatsapp_number": phone,
                "matches_count": len(matches),
                "status": "pdf_build_failed",
                "pdf_path": None,
                "message": f"PDF build error: {str(e)}"
            })
            continue

        if progress_callback:
            progress_callback("sending", f"Sending PDF to {name} via WhatsApp ({phone})...")

        # Send via WhatsApp Web
        send_success = False
        try:
            send_success = send_pdf(output_pdf, phone)
        except Exception as e:
            logger.error(f"WhatsApp dispatch exception for {name}: {e}")

        if send_success:
            sent_count += 1
            status_text = "sent"
            status_msg = f"Dispatched {len(matches)} case(s) to {phone}"
        else:
            failed_count += 1
            status_text = "send_failed"
            status_msg = f"WhatsApp send failed for {phone}"

        subscriber_results.append({
            "subscriber_id": sub_id,
            "display_name": name,
            "whatsapp_number": phone,
            "matches_count": len(matches),
            "status": status_text,
            "pdf_path": output_pdf,
            "message": status_msg
        })

    # Step 4: Archive processed PDF
    archived_path = None
    if move_to_archive and pdf_path.exists():
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        dest_filename = f"{pdf_path.stem}_{timestamp}{pdf_path.suffix}"
        archived_path = config.ARCHIVE_DIR / dest_filename
        try:
            shutil.move(str(pdf_path), str(archived_path))
            logger.info(f"Moved processed cause list to archive: {archived_path}")
        except Exception as e:
            logger.error(f"Failed to move file to archive: {e}")

    elapsed = round(time.time() - start_time, 2)
    logger.info(
        f"=== Cause List Pipeline Finished in {elapsed}s | Sent: {sent_count} | "
        f"No Cases: {no_cases_count} | Failed: {failed_count} ==="
    )

    if progress_callback:
        progress_callback("completed", f"Pipeline complete: {sent_count} sent, {no_cases_count} no cases, {failed_count} failed in {elapsed}s.")

    return {
        "success": True,
        "file": pdf_path.name,
        "archived_path": str(archived_path) if archived_path else None,
        "total_rows": len(all_rows),
        "total_active_subscribers": len(active_subscribers),
        "sent_count": sent_count,
        "no_cases_count": no_cases_count,
        "failed_count": failed_count,
        "elapsed_seconds": elapsed,
        "subscriber_results": subscriber_results
    }


def start_watcher_loop():
    """Continuously poll data/inbox for new High Court cause list PDFs."""
    inbox = config.INBOX_DIR
    inbox.mkdir(parents=True, exist_ok=True)
    poll_sec = getattr(config, "POLL_INTERVAL_SECONDS", 5)

    logger.info(f"Cause List Watcher started. Polling directory: {inbox.resolve()} every {poll_sec}s")
    logger.info("Drop a High Court cause list PDF into the inbox folder to trigger processing.")

    try:
        while True:
            # Check for candidate PDF files in inbox
            pdf_files = [
                f for f in inbox.iterdir()
                if f.is_file() and f.suffix.lower() in config.ALLOWED_EXTENSIONS
            ]

            for pdf_file in sorted(pdf_files, key=lambda p: p.stat().st_mtime):
                # Verify file is not actively being written
                try:
                    initial_size = pdf_file.stat().st_size
                    time.sleep(1)
                    if pdf_file.stat().st_size != initial_size:
                        logger.info(f"File {pdf_file.name} is still being downloaded/written. Waiting...")
                        continue
                except Exception:
                    continue

                logger.info(f"New cause list detected in inbox: {pdf_file.name}")
                process_cause_list_file(pdf_file, move_to_archive=True)

            time.sleep(poll_sec)
    except KeyboardInterrupt:
        logger.info("Watcher loop stopped by user (SIGINT). Exiting safely.")
    except Exception as e:
        logger.critical(f"Unhandled error in watcher loop: {e}", exc_info=True)
