import re, streamlit as st
from utils.email_client import send_email

st.set_page_config(page_title="Email Alert Test", page_icon="📧")
st.header("📧 MarketScanner Email Test")

email = st.text_input("Your email address")
if st.button("Send test email"):
    if not re.match(r"^[^@]+@[^@]+\.[^@]+$", email or ""):
        st.error("Enter a valid email address.")
    else:
        try:
            data = send_email(
                to=email,
                subject="MarketScanner Test Notification",
                html=("<h3>Hello!</h3>"
                      "<p>This is a test email from your MarketScanner dashboard.</p>"
                      "<p>If you can read this, email alerts are configured correctly ✅</p>")
            )
            st.success(f"Queued OK. Resend ID: {data.get('id','n/a')}")
        except Exception as e:
            st.error(f"Send failed: {e}")
