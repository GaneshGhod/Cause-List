# ⚖️ Cause List Bot

> Automated High Court cause list parser, per-advocate case matching engine, and WhatsApp dispatch system.

**Cause List Bot** is built for legal tech service providers who run a paid daily cause list delivery service for advocates and law firms. It parses daily tabular High Court cause lists once, matches all matters against registered subscribers via case-insensitive name variations, generates an executive-quality PDF containing only each lawyer's matters, and dispatches the document straight to their WhatsApp account.

---

## 🏛️ System Architecture & Workflow

```
[Operator Downloads Daily PDF from High Court Portal]
                           │
                           ▼
             [Drop into data/inbox/ folder]
                           │
                           ▼
                  [watcher.py Loop]
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
   [pdf_parser.py]               [Load subscribers.json]
(Parse Table ONCE via pdfplumber)   (Filter active subscribers)
            │                             │
            └──────────────┬──────────────┘
                           ▼
              [Case-Insensitive Match]
       (Check name variants across all cells)
                           │
                           ▼
                   [pdf_builder.py]
      (Generate clean per-advocate PDF via reportlab)
                           │
                           ▼
                 [whatsapp_sender.py]
        (Selenium WhatsApp Web with Chrome profile)
                           │
                           ▼
         [Archive to data/archive/ & Log Trace]
```

---

## 📁 Repository Structure

```
├── config.py              # Directory paths, poll intervals, WhatsApp & logging configuration
├── subscribers.json       # Subscriber registry: id, display_name, name_variants[], phone, active
├── pdf_parser.py          # Table extractor (pdfplumber) & per-subscriber variant matcher
├── pdf_builder.py         # Formatted PDF generator using ReportLab
├── whatsapp_sender.py     # Selenium WhatsApp Web automator using persistent Chrome profile
├── watcher.py             # Inbox directory watcher and end-to-end pipeline orchestrator
├── main.py                # CLI runner: continuous inbox watcher or single-file test
├── admin_app.py           # Interactive Streamlit admin dashboard
├── requirements.txt       # Python package dependencies
├── data/
│   ├── inbox/             # Drop new cause list PDFs here
│   ├── archive/           # Processed PDFs automatically moved here
│   └── output/            # Generated per-subscriber customized PDFs
├── logs/                  # System runtime logs
└── chrome_whatsapp_profile/ # Persistent Chrome session data (QR code scanned once)
```

---

## 🚀 Getting Started

### 1. Requirements
- **Python 3.9+**
- **Google Chrome** installed on the host machine
- An active WhatsApp account on your smartphone

### 2. Installation
Clone or navigate to the project directory:

```bash
# Optional: Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

---

## 📲 First-Run Setup: WhatsApp Web QR Scan

Cause List Bot uses a **persistent Chrome profile** located at `./chrome_whatsapp_profile`. This ensures you only have to scan the WhatsApp Web QR code **once**; subsequent executions reuse the active session.

1. Run the test script or CLI in non-headless mode:
   ```bash
   python main.py once path/to/sample.pdf
   ```
2. Chrome will open WhatsApp Web (`https://web.whatsapp.com`).
3. On your phone: Open WhatsApp &rarr; **Linked Devices** &rarr; **Link a Device**.
4. Scan the QR code displayed in the Chrome window.
5. Once your chats load, the browser profile saves authentication tokens automatically.

> **Tip (Testing without sending live WhatsApp messages):**  
> Use the `--dry-run` flag to simulate sends during development:
> ```bash
> python main.py once sample.pdf --dry-run
> ```

---

## 💻 Running the Application

### Option A: Continuous Inbox Watcher (Automated Daily Mode)
Run the folder watcher:
```bash
python main.py
```
- The watcher polls `data/inbox/` every 5 seconds.
- As soon as the operator saves the day's High Court cause list PDF into `data/inbox/`, the bot extracts tables, matches cases, generates PDFs, dispatches them via WhatsApp, and moves the source file to `data/archive/`.

### Option B: Single File Test Run
Test a specific PDF immediately without moving it to the archive:
```bash
python main.py once /path/to/CauseList_Today.pdf --no-archive --dry-run
```

### Option C: Interactive Admin Dashboard (Streamlit)
Launch the web interface for managing subscribers and running manual dispatches:
```bash
streamlit run admin_app.py
```

Dashboard Features:
- **Subscriber Registry:** Expandable cards with live editing of names, telephone numbers, and name variants.
- **Active / Paused Switch:** One-click toggle that persists to `subscribers.json` immediately.
- **Add Subscriber Form:** With real-time validation preventing duplicate IDs or blank values.
- **Process a PDF Now:** Upload widget with live progress reporting (`Parsing... Matching... Building... Sending...`) and per-subscriber breakdown with direct PDF download links.
- **Real-Time Logs:** Viewer for `cause_list_bot.log` with manual and automated refresh.

---

## 🔍 How Name Variant Matching Works

Court cause lists are notoriously inconsistent with advocate names:
- Listed as *"R. K. Sharma"* in one court hall
- Listed as *"Rajesh Sharma"* in another
- Listed as *"Rajesh Kumar Sharma, Adv"* in a third

Cause List Bot solves this by storing an array of `name_variants` for each subscriber in `subscribers.json`:
```json
{
  "id": "SUB-001",
  "display_name": "Adv. Rajesh K. Sharma",
  "name_variants": [
    "Rajesh Sharma",
    "R. K. Sharma",
    "Rajesh K Sharma",
    "R.Sharma"
  ],
  "whatsapp_number": "+919820123456",
  "active": true
}
```
Matching performs **case-insensitive substring checks** across every cell in each parsed row. If any variant matches, the row is included in the subscriber's custom digest.

---

## 🛡️ Compliance & Best Practices
1. **No Web Scraping:** High Court websites prohibit automated bot scraping in `robots.txt`. The operator downloads the daily cause list manually and drops it into the inbox.
2. **Rate Limiting:** WhatsApp Web automation includes configurable delays (`WHATSAPP_BETWEEN_SENDS_DELAY = 4`) between messages to prevent spam detection.
3. **Audit Logging:** Every match, PDF generation, and dispatch attempt is recorded in `cause_list_bot.log`.
