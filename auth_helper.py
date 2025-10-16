import streamlit as st
import requests
import os
from typing import Dict, Optional

class SubscriptionAuth:
    """
    Handles subscription authentication for Market Scanner Pro
    Checks user's subscription tier via the entitlements API
    
    FREE_FOR_ALL_MODE: When true, everyone gets Pro access automatically
    """
    
    def __init__(self, api_base_url: str = "https://marketscannerpros.vercel.app"):
        self.api_base_url = api_base_url
        self.entitlements_url = f"{api_base_url}/api/entitlements"
        # FREE_FOR_ALL_MODE defaults to true (everyone gets Pro free)
        self.free_for_all = os.getenv('FREE_FOR_ALL_MODE', 'true').lower() != 'false'
    
    def check_subscription(self) -> Dict[str, any]:
        """
        Check user's subscription status
        Returns: {'tier': 'free'|'pro', 'status': 'active'|'expired', ...}
        """
        # ===== TEMPORARY: EVERYONE GETS PRO FOR FREE =====
        # Set FREE_FOR_ALL_MODE=false to disable
        if self.free_for_all:
            return {
                'tier': 'pro',
                'status': 'active',
                'source': 'free_mode',
                'expiresAt': None
            }
        # ===== END TEMPORARY FREE MODE =====
        
        # Get token from URL query params (first time)
        query_params = st.query_params
        if 'token' in query_params:
            token = query_params.get('token')
            if isinstance(token, list):
                token = token[0]
            st.session_state['auth_token'] = token
        
        # Get token from session state
        token = st.session_state.get('auth_token')
        
        # If no token, return free tier (or call API without auth)
        if not token:
            return self._call_entitlements_api(None)
        
        # Call API with token
        return self._call_entitlements_api(token)
    
    def _call_entitlements_api(self, token: Optional[str]) -> Dict[str, any]:
        """Call the entitlements API to check subscription"""
        try:
            headers = {}
            if token:
                headers['Authorization'] = f'Bearer {token}'
            
            response = requests.get(
                self.entitlements_url,
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                # If API fails, default to free
                return {'tier': 'free', 'status': 'active', 'source': 'default'}
        
        except Exception as e:
            # If any error, default to free tier
            print(f"Error checking subscription: {e}")
            return {'tier': 'free', 'status': 'active', 'source': 'error'}
    
    def is_pro(self) -> bool:
        """Check if user has Pro subscription"""
        entitlements = self.check_subscription()
        return entitlements.get('tier') == 'pro' and entitlements.get('status') == 'active'
    
    def require_pro(self, message: str = "This feature requires a Pro subscription"):
        """Show upgrade message if user is not Pro"""
        if not self.is_pro():
            st.warning(f"🔒 {message}")
            st.markdown("""
            ### Upgrade to Pro
            Get access to all features including:
            - 📊 Advanced alerts and notifications
            - 📈 Trade journal with performance analytics
            - 🔔 Slack integration
            - 📧 Email summaries
            - 📺 Private TradingView scripts
            
            **Only $4.99/month or $39.99/year (save 33%)**
            
            [Upgrade Now](https://marketscannerpros.vercel.app/pricing)
            """)
            return False
        return True
    
    def show_subscription_status(self):
        """Display current subscription status in sidebar"""
        entitlements = self.check_subscription()
        tier = entitlements.get('tier', 'free')
        status = entitlements.get('status', 'active')
        
        if tier == 'pro' and status == 'active':
            st.sidebar.success("✨ **Pro Subscription Active**")
        else:
            st.sidebar.info("🆓 **Free Tier**")
            st.sidebar.markdown("[Upgrade to Pro →](https://marketscannerpros.vercel.app/pricing)")


# Helper function for easy import
def get_auth() -> SubscriptionAuth:
    """Get or create subscription auth instance"""
    if 'auth_instance' not in st.session_state:
        st.session_state['auth_instance'] = SubscriptionAuth()
    return st.session_state['auth_instance']
