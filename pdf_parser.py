"""PDF Parsing and Case Matching Module for Cause List Bot.

Responsible for:
1. Parsing daily High Court cause list tables from PDF once using pdfplumber.
2. Filtering the parsed table rows per subscriber using case-insensitive
   substring matching against each subscriber's defined name variants.
"""

import logging
import re
from typing import List, Dict, Any, Tuple, Optional

logger = logging.getLogger("cause_list_bot")

STANDARD_COLUMNS = [
    "Item No",
    "Case Number",
    "Party Details (Petitioner vs Respondent)",
    "Petitioner Advocate",
    "Respondent Advocate",
    "Court Hall / Bench"
]


def clean_cell(cell_value: Any) -> str:
    """Normalize cell text by collapsing multiple whitespace and newline characters."""
    if cell_value is None:
        return ""
    text = str(cell_value)
    # Replace linebreaks and extra spaces
    text = re.sub(r"[\r\n\t]+", " ", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


def extract_all_rows(pdf_path: str) -> Tuple[List[str], List[Dict[str, Any]], Dict[str, str]]:
    """Parse the tabular cause list PDF once and extract all structured case rows.

    Args:
        pdf_path: Absolute or relative path to the cause list PDF file.

    Returns:
        A tuple of:
        - headers: List of string column titles
        - rows: List of dictionaries mapping column title to cell string
        - metadata: Dictionary containing extracted metadata like Court Date, Bench, Total Pages
    """
    try:
        import pdfplumber
    except ImportError:
        logger.error("pdfplumber is not installed. Run 'pip install pdfplumber'.")
        raise

    logger.info(f"Beginning table extraction for source PDF: {pdf_path}")
    headers: List[str] = STANDARD_COLUMNS.copy()
    extracted_rows: List[Dict[str, Any]] = []
    metadata: Dict[str, str] = {
        "source_file": str(pdf_path),
        "court_name": "High Court of Judicature",
        "cause_list_date": "Today",
        "bench_name": "Division / Single Bench",
        "total_pages": "0"
    }

    raw_header_found = False

    with pdfplumber.open(pdf_path) as pdf:
        metadata["total_pages"] = str(len(pdf.pages))

        # First pass: try extracting court date or bench info from page 1 text
        if len(pdf.pages) > 0:
            first_page_text = pdf.pages[0].extract_text() or ""
            date_match = re.search(r"(?:DATE|DATED|CAUSE LIST FOR)\s*[:\-]?\s*([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4}|[0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})", first_page_text, re.IGNORECASE)
            if date_match:
                metadata["cause_list_date"] = date_match.group(1).strip()

            bench_match = re.search(r"(?:COURT NO\.|COURT HALL|BEFORE|HON'BLE)\s*[:\-]?\s*([^\n\r]+)", first_page_text, re.IGNORECASE)
            if bench_match:
                metadata["bench_name"] = bench_match.group(1).strip()[:80]

        for page_num, page in enumerate(pdf.pages, start=1):
            tables = page.extract_tables()
            if not tables:
                # If extract_tables yields nothing, fallback to text line analysis
                text = page.extract_text()
                if text:
                    logger.debug(f"Page {page_num}: No explicit tables found, checking raw lines.")
                continue

            for table in tables:
                if not table:
                    continue

                for row_idx, raw_row in enumerate(table):
                    cleaned_row = [clean_cell(cell) for cell in raw_row]

                    # Skip empty rows
                    if not any(cleaned_row):
                        continue

                    # Header row detection heuristic
                    row_concat = " ".join(cleaned_row).lower()
                    if ("case no" in row_concat or "petitioner" in row_concat or "item" in row_concat or "advocate" in row_concat) and not raw_header_found:
                        # Normalize headers
                        candidate_headers = [c for c in cleaned_row if c]
                        if len(candidate_headers) >= 3:
                            headers = candidate_headers
                            raw_header_found = True
                            continue

                    # Create row dictionary
                    row_dict: Dict[str, Any] = {}
                    for idx, val in enumerate(cleaned_row):
                        col_name = headers[idx] if idx < len(headers) else f"Column {idx + 1}"
                        row_dict[col_name] = val

                    # Always add raw searchable text for full-row fuzzy matching
                    row_dict["_raw_searchable"] = " ".join(cleaned_row).lower()
                    row_dict["_page"] = page_num
                    extracted_rows.append(row_dict)

    logger.info(f"Extraction complete for {pdf_path}: Parsed {len(extracted_rows)} case rows across {metadata['total_pages']} pages.")
    return headers, extracted_rows, metadata


def match_rows_for_subscriber(
    all_rows: List[Dict[str, Any]],
    name_variants: List[str]
) -> List[Dict[str, Any]]:
    """Filter parsed cause list rows down to cases matching a subscriber.

    Performs case-insensitive substring matching across every cell in each row,
    checked against all supplied name variants for the subscriber.

    Args:
        all_rows: Complete list of row dictionaries from extract_all_rows.
        name_variants: List of string name aliases/spellings for this lawyer.

    Returns:
        List of matching case row dictionaries.
    """
    if not name_variants:
        return []

    # Clean and lowercase all name variants
    clean_variants = [v.strip().lower() for v in name_variants if v and v.strip()]
    if not clean_variants:
        return []

    matched_rows: List[Dict[str, Any]] = []

    for row in all_rows:
        # Check against full searchable concatenated string or individual cells
        searchable_text = row.get("_raw_searchable", "")
        if not searchable_text:
            searchable_text = " ".join(str(v).lower() for k, v in row.items() if not k.startswith("_"))

        # Look for any name variant in the row
        match_found = False
        matched_variant = None

        for variant in clean_variants:
            # Word boundary or substring match
            if variant in searchable_text:
                match_found = True
                matched_variant = variant
                break

        if match_found:
            row_copy = dict(row)
            row_copy["_matched_variant"] = matched_variant
            matched_rows.append(row_copy)

    return matched_rows
