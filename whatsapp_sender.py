"""WhatsApp Web Automation Module for Cause List Bot.

Automates sending generated cause list PDFs to multiple subscribed lawyers
via WhatsApp Web using Selenium with a persistent Chrome profile so QR code
authorization is only scanned once.
"""

import logging
import os
import time
from pathlib import Path
from typing import Optional

import config

logger = logging.getLogger("cause_list_bot")

# Global driver cache to reuse active WhatsApp Web session across multiple subscriber sends
_DRIVER_INSTANCE = None


def get_whatsapp_driver(user_data_dir: Optional[Path] = None):
    """Initialize or retrieve an active Selenium Chrome WebDriver with persistent user profile.

    Reusing the driver across multiple sends prevents re-loading WhatsApp Web
    and preserves session cookies/tokens.
    """
    global _DRIVER_INSTANCE
    if _DRIVER_INSTANCE is not None:
        try:
            # Quick ping to verify browser session is alive
            _DRIVER_INSTANCE.title
            return _DRIVER_INSTANCE
        except Exception:
            logger.warning("Existing WebDriver session was closed or unresponsive. Re-creating...")
            _DRIVER_INSTANCE = None

    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service
        try:
            from webdriver_manager.chrome import ChromeDriverManager
            has_manager = True
        except ImportError:
            has_manager = False
    except ImportError:
        logger.error("Selenium is not installed. Run 'pip install selenium webdriver-manager'.")
        raise

    profile_dir = user_data_dir or config.CHROME_PROFILE_DIR
    profile_dir.mkdir(parents=True, exist_ok=True)

    chrome_options = Options()
    chrome_options.add_argument(f"--user-data-dir={profile_dir.resolve()}")
    chrome_options.add_argument("--profile-directory=Default")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option("useAutomationExtension", False)

    # Note: Headless mode can prevent WhatsApp Web QR code scan on first run
    if getattr(config, "CHROME_HEADLESS", False):
        chrome_options.add_argument("--headless=new")

    logger.info(f"Launching Chrome with persistent WhatsApp profile at: {profile_dir}")
    try:
        if has_manager:
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=chrome_options)
        else:
            driver = webdriver.Chrome(options=chrome_options)
        
        driver.maximize_window()
        _DRIVER_INSTANCE = driver
        return _DRIVER_INSTANCE
    except Exception as e:
        logger.error(f"Failed to launch Chrome WebDriver: {e}")
        raise


def normalize_phone_number(raw_number: str) -> str:
    """Strip spaces, dashes, parentheses and ensure international digits for WhatsApp Web API."""
    cleaned = "".join(ch for ch in str(raw_number) if ch.isdigit())
    return cleaned


def send_pdf(pdf_path: str, whatsapp_number: str, custom_caption: Optional[str] = None) -> bool:
    """Send a generated case list PDF to a subscriber's WhatsApp number.

    Args:
        pdf_path: Absolute or relative file path to the PDF document.
        whatsapp_number: International mobile number (e.g. +919820123456).
        custom_caption: Optional text note sent alongside the document.

    Returns:
        bool: True if document was sent successfully, False otherwise.
    """
    resolved_pdf = Path(pdf_path).resolve()
    if not resolved_pdf.exists():
        logger.error(f"PDF file does not exist at: {resolved_pdf}")
        return False

    clean_phone = normalize_phone_number(whatsapp_number)
    if not clean_phone:
        logger.error(f"Invalid recipient WhatsApp number: '{whatsapp_number}'")
        return False

    logger.info(f"Initiating WhatsApp document dispatch to {whatsapp_number} ({resolved_pdf.name})")

    # In environments without desktop GUI / Chrome installed, allow graceful fallback logging
    dry_run = os.environ.get("CAUSE_LIST_DRY_RUN", "").lower() in ("true", "1", "yes")
    if dry_run:
        logger.info(f"[DRY-RUN SIMULATION] Document {resolved_pdf.name} sent to {whatsapp_number} successfully.")
        time.sleep(1)
        return True

    try:
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC

        driver = get_whatsapp_driver()
        timeout = getattr(config, "WHATSAPP_SEND_TIMEOUT", 60)

        # Direct deep-link to chat
        chat_url = f"https://web.whatsapp.com/send?phone={clean_phone}&type=phone_number&app_absent=0"
        driver.get(chat_url)

        # Wait for chat to load (either chat input or invalid phone number popup)
        wait = WebDriverWait(driver, timeout)
        
        # Check for invalid number alert
        time.sleep(4)
        page_source = driver.page_source.lower()
        if "phone number shared via url is invalid" in page_source:
            logger.error(f"WhatsApp reported invalid phone number for: {whatsapp_number}")
            return False

        # Find file input directly to avoid flaky menu clicks
        # WhatsApp Web maintains hidden file inputs in the DOM:
        # accept="*/*" or accept="image/*,video/mp4..."
        logger.info(f"Chat loaded for {whatsapp_number}. Locating document upload element...")
        
        # Click the paperclip / plus attach icon
        attach_btn = wait.until(
            EC.presence_of_element_located((By.XPATH, '//div[@title="Attach" or @aria-label="Attach" or @data-testid="attach-menu-plus" or @data-testid="clip"]'))
        )
        attach_btn.click()
        time.sleep(1)

        # Document input element
        file_input = wait.until(
            EC.presence_of_element_located((By.XPATH, '//input[@type="file" and not(contains(@accept, "image"))] | //input[@type="file"]'))
        )
        file_input.send_keys(str(resolved_pdf))
        logger.info(f"Attached document: {resolved_pdf.name}")

        # Wait for preview modal & Send button
        time.sleep(2)
        send_btn = wait.until(
            EC.element_to_be_clickable((By.XPATH, '//span[@data-testid="send" or @data-icon="send"]/parent::button | //div[@aria-label="Send" or @data-testid="send"]'))
        )
        send_btn.click()
        logger.info(f"Clicked Send. Awaiting delivery confirmation for {whatsapp_number}...")

        # Brief delay to allow upload completion before switching chats
        delay = getattr(config, "WHATSAPP_BETWEEN_SENDS_DELAY", 4)
        time.sleep(delay)

        logger.info(f"Successfully dispatched PDF to {whatsapp_number}")
        return True

    except Exception as e:
        logger.error(f"WhatsApp sending failed for {whatsapp_number}: {e}", exc_info=True)
        return False


def close_whatsapp_driver():
    """Safely terminate the background Chrome browser session."""
    global _DRIVER_INSTANCE
    if _DRIVER_INSTANCE is not None:
        try:
            logger.info("Closing WhatsApp WebDriver session.")
            _DRIVER_INSTANCE.quit()
        except Exception as e:
            logger.warning(f"Error while quitting WebDriver: {e}")
        finally:
            _DRIVER_INSTANCE = None
