"""PDF Generation Module for Cause List Bot.

Builds a clean, executive-quality per-subscriber output PDF using ReportLab
containing only the cases matching an individual advocate. Returns None if
no matches are found.
"""

import logging
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

import config

logger = logging.getLogger("cause_list_bot")


def build_case_pdf(
    header_info: Dict[str, Any],
    matches: List[Dict[str, Any]],
    subscriber_id: str,
    subscriber_name: str = "",
    output_dir: Optional[Path] = None
) -> Optional[str]:
    """Generate a formatted PDF of matched cases for a specific subscriber.

    Args:
        header_info: Metadata dictionary (court_name, cause_list_date, bench_name, source_file).
        matches: Filtered list of matching case row dictionaries.
        subscriber_id: Unique subscriber identifier (e.g. 'SUB-001').
        subscriber_name: Human-friendly name of the advocate.
        output_dir: Optional custom destination folder. Defaults to config.OUTPUT_DIR.

    Returns:
        String path of the generated PDF file, or None if matches is empty.
    """
    if not matches:
        logger.info(f"No cases matched for subscriber {subscriber_id} ({subscriber_name}). Skipping PDF generation.")
        return None

    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter, A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        )
    except ImportError:
        logger.error("reportlab is not installed. Run 'pip install reportlab'.")
        raise

    target_dir = output_dir or config.OUTPUT_DIR
    target_dir.mkdir(parents=True, exist_ok=True)

    date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    clean_id = subscriber_id.replace(" ", "_").replace("/", "-")
    output_filename = f"CauseList_{clean_id}_{date_str}.pdf"
    pdf_path = target_dir / output_filename

    # Document setup with 0.5 inch margins for data density
    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=18,
        textColor=colors.HexColor('#0F172A'),
        alignment=1  # Centered
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=13,
        textColor=colors.HexColor('#475569'),
        alignment=1
    )

    badge_style = ParagraphStyle(
        'AdvocateBadge',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor('#1E293B')
    )

    meta_label_style = ParagraphStyle(
        'MetaLabel',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#64748B')
    )

    meta_val_style = ParagraphStyle(
        'MetaVal',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#0F172A')
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.white,
        alignment=1
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor('#1E293B')
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor('#0F172A')
    )

    disclaimer_style = ParagraphStyle(
        'Disclaimer',
        parent=styles['Italic'],
        fontName='Helvetica-Oblique',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor('#94A3B8'),
        alignment=1
    )

    story = []

    # Court header
    court_title = header_info.get("court_name", config.COURT_TITLE)
    cause_date = header_info.get("cause_list_date", datetime.now().strftime("%d-%B-%Y"))
    bench_info = header_info.get("bench_name", "All Benches")

    story.append(Paragraph(court_title.upper(), title_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph(f"DAILY CAUSE LIST MATTERS &bull; DATE: {cause_date}", subtitle_style))
    story.append(Spacer(1, 10))

    # Subscriber Info Summary Box
    summary_data = [
        [
            Paragraph(f"<b>Subscriber:</b> {subscriber_name or subscriber_id}", badge_style),
            Paragraph(f"<b>Matters Listed:</b> <font color='#0284C7'><b>{len(matches)} Case(s)</b></font>", badge_style)
        ],
        [
            Paragraph(f"<b>Subscriber ID:</b> {subscriber_id}", meta_label_style),
            Paragraph(f"<b>Generated:</b> {datetime.now().strftime('%d-%b-%Y %I:%M %p')}", meta_label_style)
        ]
    ]
    summary_table = Table(summary_data, colWidths=[260, 260])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#E2E8F0')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#F1F5F9')),
        ('PADDING', (0, 0), (-1, -1), 6),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 14))

    # Determine dynamic columns from rows
    # Standard columns order: Item / Case No / Parties / Pet Adv / Resp Adv / Court Hall
    available_cols = [k for k in matches[0].keys() if not k.startswith("_")]
    
    # Pick display headers
    display_headers = available_cols[:5] if len(available_cols) >= 3 else available_cols
    col_count = len(display_headers)
    total_width = 522  # A4 595.27 - 2*36

    # Distribute widths proportionally
    if col_count == 5:
        col_widths = [45, 95, 162, 110, 110]
    elif col_count == 4:
        col_widths = [55, 115, 202, 150]
    else:
        col_widths = [total_width / col_count] * col_count

    table_rows = []
    # Header row
    header_cells = [Paragraph(str(col), table_header_style) for col in display_headers]
    table_rows.append(header_cells)

    # Data rows
    for i, row in enumerate(matches):
        row_cells = []
        matched_term = row.get("_matched_variant", "")
        for idx, col in enumerate(display_headers):
            val = str(row.get(col, ""))
            # Highlight matched term if found in this cell
            if matched_term and matched_term.lower() in val.lower():
                val_highlighted = val.replace(
                    matched_term, f"<b><font color='#0369A1'>{matched_term}</font></b>"
                )
                cell_p = Paragraph(val_highlighted, table_cell_bold)
            else:
                cell_p = Paragraph(val, table_cell_style)
            row_cells.append(cell_p)
        table_rows.append(row_cells)

    case_table = Table(table_rows, colWidths=col_widths, repeatRows=1)
    case_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0F172A')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('PADDING', (0, 0), (-1, -1), 5),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#CBD5E1')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')])
    ]))
    story.append(case_table)
    story.append(Spacer(1, 20))

    # Disclaimer note
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#CBD5E1'), spaceAfter=8))
    story.append(Paragraph(
        "Confidential Notice: This case list extract is prepared automatically by Cause List Bot based on your subscribed name variants. "
        "Please verify with the official High Court Registry for any supplementary or emergent board notices.",
        disclaimer_style
    ))

    # Build document
    doc.build(story)
    logger.info(f"Successfully generated PDF for subscriber {subscriber_id}: {pdf_path}")
    return str(pdf_path)
