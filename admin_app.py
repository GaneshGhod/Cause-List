"""Interactive Streamlit Admin Dashboard for Cause List Bot.

Provides operators with:
1. Subscriber Management: View, live-edit, delete, and toggle Active/Paused status
   with immediate persistence to subscribers.json.
2. Add Subscriber Form: With inline validation (duplicate ID check, blank field checks).
3. Manual 'Process a PDF Now' Pipeline: File uploader executing parsing, matching,
   PDF building, and dispatching with live progress steps and per-subscriber breakdown.
4. Live Log Panel: Displays cause_list_bot.log with manual & auto-refresh toggles.
"""

import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import streamlit as st
except ImportError:
    print("Streamlit is not installed. Please run: pip install streamlit")
    sys.exit(1)

import config
from watcher import process_cause_list_file, load_subscribers


# Page Configuration
st.set_page_config(
    page_title="Cause List Bot - Admin Operations",
    page_icon="⚖️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling for polished dashboard
st.markdown("""
<style>
    .main-title {
        font-size: 2.1rem;
        font-weight: 700;
        color: #0F172A;
        margin-bottom: 0.2rem;
    }
    .sub-title {
        font-size: 0.95rem;
        color: #64748B;
        margin-bottom: 1.5rem;
    }
    .metric-card {
        background: #F8FAFC;
        border: 1px solid #E2E8F0;
        border-radius: 8px;
        padding: 1rem;
        text-align: center;
    }
    .metric-value {
        font-size: 1.8rem;
        font-weight: 700;
        color: #0284C7;
    }
    .metric-label {
        font-size: 0.85rem;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .status-badge-active {
        background-color: #DCFCE7;
        color: #166534;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
    }
    .status-badge-paused {
        background-color: #F1F5F9;
        color: #64748B;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
    }
</style>
""", unsafe_allow_html=True)


def save_subscribers_to_file(subscribers_list):
    """Persist subscriber list to subscribers.json immediately."""
    try:
        with open(config.SUBSCRIBERS_FILE, "w", encoding="utf-8") as f:
            json.dump(subscribers_list, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        st.error(f"Failed to persist subscribers.json: {e}")
        return False


def get_log_contents(max_lines=150):
    """Read the tail of cause_list_bot.log."""
    if not config.LOG_FILE.exists():
        return "Log file not created yet. Waiting for first activity."
    try:
        with open(config.LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
            return "".join(lines[-max_lines:])
    except Exception as e:
        return f"Error reading log file: {e}"


# --- Header & Metrics ---
st.markdown("<div class='main-title'>⚖️ Cause List Bot &bull; Admin Console</div>", unsafe_allow_html=True)
st.markdown("<div class='sub-title'>High Court Cause List Table Parser, Per-Advocate Filtering & WhatsApp Delivery Dispatcher</div>", unsafe_allow_html=True)

subscribers = load_subscribers()
total_subs = len(subscribers)
active_subs = len([s for s in subscribers if s.get("active", False)])
paused_subs = total_subs - active_subs

# Quick Stats Row
col1, col2, col3, col4 = st.columns(4)
with col1:
    st.markdown(f"<div class='metric-card'><div class='metric-value'>{total_subs}</div><div class='metric-label'>Total Registered</div></div>", unsafe_allow_html=True)
with col2:
    st.markdown(f"<div class='metric-card'><div class='metric-value' style='color:#16A34A;'>{active_subs}</div><div class='metric-label'>Active Subscriptions</div></div>", unsafe_allow_html=True)
with col3:
    st.markdown(f"<div class='metric-card'><div class='metric-value' style='color:#EAB308;'>{paused_subs}</div><div class='metric-label'>Paused Accounts</div></div>", unsafe_allow_html=True)
with col4:
    dry_mode = os.environ.get("CAUSE_LIST_DRY_RUN", "0") in ("1", "true")
    mode_text = "DRY-RUN SIM" if dry_mode else "LIVE CHROME"
    mode_color = "#EA580C" if dry_mode else "#0284C7"
    st.markdown(f"<div class='metric-card'><div class='metric-value' style='color:{mode_color};'>{mode_text}</div><div class='metric-label'>WhatsApp Dispatch Mode</div></div>", unsafe_allow_html=True)

st.write("")

# Navigation Tabs
tab_subscribers, tab_process_now, tab_logs = st.tabs([
    "👥 Subscriber Management",
    "🚀 Process a PDF Now",
    "📜 System Execution Logs"
])


# ==============================================================================
# TAB 1: SUBSCRIBER MANAGEMENT
# ==============================================================================
with tab_subscribers:
    st.subheader("Advocate Subscriber Registry")
    st.caption("Manage registered advocates, their legal aliases/name variants, and WhatsApp dispatch status.")

    # Search & Filter controls
    search_query = st.text_input("🔍 Search subscriber by name, ID, or variant:", placeholder="e.g. Rajesh, SUB-001, Deshmukh").strip().lower()

    filtered_subscribers = []
    for s in subscribers:
        s_id = s.get("id", "").lower()
        s_name = s.get("display_name", "").lower()
        s_vars = " ".join(s.get("name_variants", [])).lower()
        if not search_query or (search_query in s_id or search_query in s_name or search_query in s_vars):
            filtered_subscribers.append(s)

    # Display expandable cards for each subscriber
    for idx, sub in enumerate(filtered_subscribers):
        sub_id = sub.get("id", f"SUB-{idx}")
        is_active = sub.get("active", False)
        status_tag = "🟢 ACTIVE" if is_active else "⚪ PAUSED"

        expander_title = f"{status_tag} &bull; {sub.get('display_name', 'Unnamed')} ({sub_id}) &bull; {sub.get('whatsapp_number', 'No phone')}"

        with st.expander(expander_title, expanded=False):
            with st.form(key=f"edit_form_{sub_id}"):
                c_name, c_phone = st.columns([3, 2])
                with c_name:
                    edit_name = st.text_input("Full Display Name:", value=sub.get("display_name", ""), key=f"name_{sub_id}")
                with c_phone:
                    edit_phone = st.text_input("WhatsApp Number (with country code):", value=sub.get("whatsapp_number", ""), key=f"phone_{sub_id}")

                variants_str = ", ".join(sub.get("name_variants", []))
                edit_variants = st.text_area(
                    "Name Variants (comma-separated, case-insensitive substring match in cause list):",
                    value=variants_str,
                    key=f"vars_{sub_id}",
                    help="Courts format names differently (e.g. 'R. K. Sharma', 'Rajesh Sharma', 'Rajesh K. Sharma'). Enter each variation separated by commas."
                )

                c_toggle, c_save, c_delete = st.columns([2, 2, 1])
                with c_toggle:
                    edit_active = st.checkbox("Subscription Active (dispatches PDF)", value=is_active, key=f"active_{sub_id}")
                with c_save:
                    submitted = st.form_submit_button("💾 Save Changes", use_container_width=True)
                with c_delete:
                    delete_clicked = st.form_submit_button("🗑️ Delete", use_container_width=True)

                if submitted:
                    if not edit_name.strip():
                        st.error("Display Name cannot be blank.")
                    elif not edit_phone.strip():
                        st.error("WhatsApp Number cannot be blank.")
                    else:
                        # Parse variants list
                        parsed_variants = [v.strip() for v in edit_variants.split(",") if v.strip()]
                        # Update subscriber object
                        sub["display_name"] = edit_name.strip()
                        sub["whatsapp_number"] = edit_phone.strip()
                        sub["name_variants"] = parsed_variants
                        sub["active"] = edit_active

                        if save_subscribers_to_file(subscribers):
                            st.success(f"✓ Changes saved for {edit_name} ({sub_id})!")
                            time.sleep(0.5)
                            st.rerun()

                if delete_clicked:
                    subscribers = [s for s in subscribers if s.get("id") != sub_id]
                    if save_subscribers_to_file(subscribers):
                        st.warning(f"Subscriber {sub_id} removed.")
                        time.sleep(0.5)
                        st.rerun()

    st.divider()

    # Add Subscriber Section with Inline Validation
    st.subheader("➕ Register New Advocate Subscriber")
    with st.form("add_subscriber_form", clear_on_submit=True):
        col_id, col_name, col_phone = st.columns([1, 2, 2])
        with col_id:
            next_num = len(subscribers) + 1
            default_new_id = f"SUB-{str(next_num).zfill(3)}"
            new_id = st.text_input("Subscriber ID *", value=default_new_id)
        with col_name:
            new_name = st.text_input("Advocate Display Name *", placeholder="e.g. Adv. Rohit Deshpande")
        with col_phone:
            new_phone = st.text_input("WhatsApp Number *", placeholder="+919876543210")

        new_variants_input = st.text_input(
            "Name Variants (comma-separated) *",
            placeholder="Rohit Deshpande, R. Deshpande, Rohit D."
        )
        new_active = st.checkbox("Active immediately", value=True)

        submit_new = st.form_submit_button("Register Subscriber", use_container_width=True)

        if submit_new:
            clean_id = new_id.strip().upper()
            existing_ids = [s.get("id", "").upper() for s in subscribers]

            # Inline Validations
            if not clean_id:
                st.error("Validation Error: Subscriber ID is required.")
            elif clean_id in existing_ids:
                st.error(f"Validation Error: Subscriber ID '{clean_id}' already exists. Please pick a unique ID.")
            elif not new_name.strip():
                st.error("Validation Error: Advocate Display Name is required.")
            elif not new_phone.strip():
                st.error("Validation Error: WhatsApp number is required.")
            elif not new_variants_input.strip():
                st.error("Validation Error: At least one name variant is required for matching.")
            else:
                parsed_variants = [v.strip() for v in new_variants_input.split(",") if v.strip()]
                new_sub_obj = {
                    "id": clean_id,
                    "display_name": new_name.strip(),
                    "name_variants": parsed_variants,
                    "whatsapp_number": new_phone.strip(),
                    "active": new_active
                }
                subscribers.append(new_sub_obj)
                if save_subscribers_to_file(subscribers):
                    st.success(f"✓ Successfully registered subscriber: {new_name} ({clean_id})")
                    time.sleep(0.7)
                    st.rerun()


# ==============================================================================
# TAB 2: PROCESS A PDF NOW (MANUAL TRIGGER)
# ==============================================================================
with tab_process_now:
    st.subheader("Manual Cause List Execution Pipeline")
    st.caption("Upload a High Court cause list PDF downloaded from the court website to execute parsing, subscriber matching, PDF compilation, and WhatsApp dispatch on demand.")

    col_upload, col_opts = st.columns([3, 1])
    with col_upload:
        uploaded_file = st.file_uploader(
            "Select Cause List PDF file:",
            type=["pdf"],
            help="High Court daily cause list PDF containing tabular listings of court halls, matter numbers, and advocate names."
        )
    with col_opts:
        st.write("**Execution Options:**")
        dry_run_option = st.checkbox(
            "WhatsApp Dry-Run Mode",
            value=True,
            help="When checked, simulates WhatsApp Web sends without launching Chrome or messaging clients. Ideal for testing parsing & PDF generation."
        )
        archive_option = st.checkbox(
            "Move to archive folder after processing",
            value=True
        )

    if uploaded_file is not None:
        st.info(f"File ready for processing: **{uploaded_file.name}** ({round(uploaded_file.size / 1024, 1)} KB)")

        if st.button("▶ Run Full Processing Pipeline Now", type="primary", use_container_width=True):
            # Save uploaded file temporarily to inbox
            temp_inbox_path = config.INBOX_DIR / uploaded_file.name
            with open(temp_inbox_path, "wb") as f:
                f.write(uploaded_file.getbuffer())

            # Set environment variable for dry-run
            if dry_run_option:
                os.environ["CAUSE_LIST_DRY_RUN"] = "true"
            else:
                os.environ.pop("CAUSE_LIST_DRY_RUN", None)

            # Live Progress Display Area
            progress_bar = st.progress(0)
            status_container = st.empty()

            def ui_progress_callback(stage, message):
                stage_weights = {
                    "parsing": 20,
                    "matching": 40,
                    "subscriber_progress": 60,
                    "building": 75,
                    "sending": 90,
                    "completed": 100,
                    "error": 100
                }
                pct = stage_weights.get(stage, 50)
                progress_bar.progress(pct)
                status_container.info(f"⏳ **Pipeline Status:** {message}")

            # Run execution
            with st.spinner("Processing High Court cause list..."):
                result = process_cause_list_file(
                    pdf_path=temp_inbox_path,
                    move_to_archive=archive_option,
                    progress_callback=ui_progress_callback
                )

            progress_bar.progress(100)

            if result.get("success"):
                st.success(
                    f"🎉 **Pipeline Completed Successfully!** Processed in {result.get('elapsed_seconds')}s. "
                    f"Parsed {result.get('total_rows')} total matters across all benches."
                )

                # Summary metrics
                res_col1, res_col2, res_col3 = st.columns(3)
                with res_col1:
                    st.metric("Dispatched PDFs", f"{result.get('sent_count')} sent")
                with res_col2:
                    st.metric("Subscribers with No Matters", f"{result.get('no_cases_count')}")
                with res_col3:
                    st.metric("Failed Sends", f"{result.get('failed_count')}")

                # Per-Subscriber Breakdown Table
                st.subheader("Per-Subscriber Dispatch Results")
                sub_results = result.get("subscriber_results", [])
                if sub_results:
                    for s_res in sub_results:
                        status = s_res.get("status")
                        if status == "sent":
                            badge = "✅ SENT"
                            msg_color = "#16A34A"
                        elif status == "no_cases_found":
                            badge = "⚪ NO CASES"
                            msg_color = "#64748B"
                        else:
                            badge = "❌ FAILED"
                            msg_color = "#DC2626"

                        with st.container():
                            r_col1, r_col2, r_col3, r_col4 = st.columns([3, 2, 2, 2])
                            with r_col1:
                                st.write(f"**{s_res.get('display_name')}** (`{s_res.get('subscriber_id')}`)")
                            with r_col2:
                                st.write(f"Matches: **{s_res.get('matches_count')} case(s)**")
                            with r_col3:
                                st.write(f"WhatsApp: `{s_res.get('whatsapp_number')}`")
                            with r_col4:
                                st.markdown(f"<span style='color:{msg_color}; font-weight:600;'>{badge}</span>", unsafe_allow_html=True)
                            st.caption(f"Details: {s_res.get('message')}")
                            if s_res.get("pdf_path") and Path(s_res.get("pdf_path")).exists():
                                with open(s_res.get("pdf_path"), "rb") as pdf_f:
                                    st.download_button(
                                        label=f"📥 Download Generated PDF for {s_res.get('subscriber_id')}",
                                        data=pdf_f.read(),
                                        file_name=Path(s_res.get("pdf_path")).name,
                                        mime="application/pdf",
                                        key=f"dl_{s_res.get('subscriber_id')}"
                                    )
                            st.divider()
            else:
                st.error(f"❌ Pipeline encountered an error: {result.get('error')}")


# ==============================================================================
# TAB 3: SYSTEM EXECUTION LOGS
# ==============================================================================
with tab_logs:
    st.subheader("System Logs (cause_list_bot.log)")
    st.caption("Live streaming event trail of folder watching, extraction, matching decisions, and WhatsApp dispatch calls.")

    l_col1, l_col2 = st.columns([4, 1])
    with l_col2:
        if st.button("🔄 Refresh Logs", use_container_width=True):
            st.rerun()

    log_text = get_log_contents(max_lines=200)
    st.code(log_text, language="log")

    st.download_button(
        label="📥 Download Full Log File",
        data=log_text,
        file_name="cause_list_bot.log",
        mime="text/plain"
    )
