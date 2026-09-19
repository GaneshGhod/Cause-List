"""Command-Line Interface (CLI) Entry Point for Cause List Bot.

Provides two operational modes:
1. Continuous watcher loop: polls the inbox folder for dropped High Court PDFs:
   $ python main.py
2. Single-run test mode: processes a specific cause list PDF immediately:
   $ python main.py once <path_to_pdf> [--dry-run]
"""

import argparse
import os
import sys
from pathlib import Path

import config
from watcher import process_cause_list_file, start_watcher_loop, logger


def main():
    parser = argparse.ArgumentParser(
        description="Cause List Bot - High Court Daily Cause List Parser & WhatsApp Delivery"
    )
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Command: once
    once_parser = subparsers.add_parser(
        "once",
        help="Process a single cause list PDF file immediately without watching the inbox"
    )
    once_parser.add_argument(
        "pdf_path",
        type=str,
        help="Path to the High Court cause list PDF to parse and dispatch"
    )
    once_parser.add_argument(
        "--no-archive",
        action="store_true",
        help="Keep the original PDF in place rather than moving to data/archive"
    )
    once_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate WhatsApp dispatch without opening Chrome or sending actual messages"
    )

    # Optional flags on root command
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Enable WhatsApp dry-run mode for testing"
    )

    args = parser.parse_args()

    # Set dry-run env var if specified
    if getattr(args, "dry_run", False):
        os.environ["CAUSE_LIST_DRY_RUN"] = "true"
        logger.info("[MODE] Running in DRY-RUN mode (no live WhatsApp messages will be sent).")

    if args.command == "once":
        target_path = Path(args.pdf_path).resolve()
        if not target_path.exists():
            logger.error(f"Target PDF file does not exist: {target_path}")
            sys.exit(1)

        move_archive = not args.no_archive
        logger.info(f"Initiating single-file processing on: {target_path}")
        result = process_cause_list_file(target_path, move_to_archive=move_archive)

        print("\n" + "=" * 60)
        print("SUMMARY OF EXECUTION:")
        print(f"File:               {result.get('file')}")
        print(f"Total Cases:        {result.get('total_rows')}")
        print(f"Active Subscribers: {result.get('total_active_subscribers')}")
        print(f"PDFs Sent:          {result.get('sent_count')}")
        print(f"No Cases Found:     {result.get('no_cases_count')}")
        print(f"Failed Sends:       {result.get('failed_count')}")
        print(f"Elapsed Time:       {result.get('elapsed_seconds')}s")
        print("=" * 60)

        for sub in result.get("subscriber_results", []):
            status_icon = "✓" if sub["status"] == "sent" else ("-" if sub["status"] == "no_cases_found" else "✗")
            print(f"[{status_icon}] {sub['display_name']} ({sub['subscriber_id']}): {sub['message']}")
        print("=" * 60 + "\n")

    else:
        # Default behavior: run watcher loop
        logger.info("Starting continuous inbox watcher. Press Ctrl+C to stop.")
        start_watcher_loop()


if __name__ == "__main__":
    main()
