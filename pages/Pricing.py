import streamlit as st
st.set_page_config(page_title="Pricing — MarketScanner Pros", page_icon="💳")
st.title("Pricing")
st.markdown("""
| Plan | Best for | What you get | Price |
|---|---|---|---|
| **Free** | Getting started | Limited symbols • Core scanner • 1 timeframe set • Demo mode | $0 |
| **Pro** | Active traders | All Free + multi-TF confluence • squeeze/vol tools • watchlists • export | **$4.99 / month** |
| **Full Pro Trader** | Power users | All Pro + advanced alerts • more symbols • priority support | **$9.99 / month** |

*Prices in USD. Taxes may apply. Manage subscription in your app store account.*
""")
st.link_button("Launch App", "/", type="primary")
