# MSP_REDIRECT_OVERRIDE_START
import streamlit as st  # ensure available in this scope

st.markdown("""
<style>
/* Hide the old “Redirecting to secure checkout…” info box if it appears */
div:has(> div[data-testid="stAlert"]) p, div[data-testid="stAlert"] p {
  /* fallback hidden via JS below; leave visible if selector not supported */
}
</style>
<script>
(function redirectUpgradeButtons(){
  // Run after the DOM is ready and keep re-checking for Streamlit rerenders
  function hook() {
    try {
      // Map of matchers → destination anchor
      const rules = [
        { test: /pro subscription.*4\.99/i, href: "https://marketscannerpros.app/pricing#pro" },
        { test: /pro trader.*9\.99/i,       href: "https://marketscannerpros.app/pricing#protrader" },
        { test: /complete pro subscription/i, href: "https://marketscannerpros.app/pricing#pro" },
        { test: /complete pro trader subscription/i, href: "https://marketscannerpros.app/pricing#protrader" },
      ];

      // Attach to any visible buttons
      document.querySelectorAll('button').forEach(btn => {
        const txt = (btn.textContent || "").trim();
        const rule = rules.find(r => r.test.test(txt));
        if (rule && !btn.__mspHooked) {
          btn.__mspHooked = true;
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
            window.location.assign(rule.href);
          }, { capture: true });
        }
      });

      // Nuke any “Redirecting to secure checkout…” alerts if they render
      document.querySelectorAll('[data-testid="stAlert"]').forEach(a => {
        const t = (a.textContent || "").toLowerCase();
        if (t.includes("redirecting to secure checkout")) a.remove();
      });
    } catch(e) { console.log("redirect hook error", e); }
  }
  hook();
  setInterval(hook, 400); // Streamlit re-renders often
})();
</script>
""", unsafe_allow_html=True)
# MSP_REDIRECT_OVERRIDE_END
