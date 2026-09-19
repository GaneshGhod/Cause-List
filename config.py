"""Configuration module for Cause List Bot.

Defines directory paths (inbox, archive, per-subscriber output),
subscribers registry path, polling intervals, WhatsApp automation settings,
and logging configurations.
"""

import os
from pathlib import Path

# Base workspace directory
BASE_DIR = Path(__file__).resolve().parent

# Directory Paths
DATA_DIR = BASE_DIR / "data"
INBOX_DIR = DATA_DIR / "inbox"
ARCHIVE_DIR = DATA_DIR / "archive"
OUTPUT_DIR = DATA_DIR / "output"
LOG_DIR = BASE_DIR / "logs"

# Ensure essential runtime directories exist
for directory in [INBOX_DIR, ARCHIVE_DIR, OUTPUT_DIR, LOG_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# Subscribers and Logging
SUBSCRIBERS_FILE = BASE_DIR / "subscribers.json"
LOG_FILE = BASE_DIR / "cause_list_bot.log"

# Watcher Settings
POLL_INTERVAL_SECONDS = 5  # Inbox check interval in seconds
ALLOWED_EXTENSIONS = {".pdf"}

# WhatsApp Automation Settings
CHROME_PROFILE_DIR = BASE_DIR / "chrome_whatsapp_profile"
CHROME_HEADLESS = False  # Keep false so user can scan QR code on initial setup
WHATSAPP_WEB_URL = "https://web.whatsapp.com"
WHATSAPP_SEND_TIMEOUT = 60  # seconds to wait for QR scan / element render
WHATSAPP_BETWEEN_SENDS_DELAY = 4  # pause between messages to prevent spam flags

# High Court Cause List defaults
COURT_TITLE = "HIGH COURT OF JUDICATURE"
DEFAULT_BENCH = "DAILY CAUSE LIST"
