"""
Apple IAP Receipt Validation API
Separate FastAPI endpoint for handling Apple In-App Purchase receipt validation
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import requests
import json
import psycopg2
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Market Scanner IAP API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ReceiptValidationRequest(BaseModel):
    receipt: str
    productId: str
    transactionId: str
    workspaceId: str = None

class ReceiptValidationResponse(BaseModel):
    success: bool
    message: str
    subscriptionData: dict = None

@app.post("/api/iap/validate-receipt", response_model=ReceiptValidationResponse)
async def validate_receipt(request: ReceiptValidationRequest):
    """Validate Apple IAP receipt and create/update subscription"""
    try:
        logger.info(f"Validating receipt for product: {request.productId}")
        
        # Validate receipt with Apple
        is_valid, validation_result = await validate_apple_receipt(
            request.receipt, 
            request.productId, 
            request.transactionId
        )
        
        if not is_valid:
            logger.warning(f"Receipt validation failed: {validation_result}")
            return ReceiptValidationResponse(
                success=False,
                message=f"Receipt validation failed: {validation_result}"
            )
        
        # Create/update subscription in database
        subscription_data = await process_subscription(
            validation_result,
            request.workspaceId,
            request.transactionId
        )
        
        logger.info(f"Subscription processed successfully: {subscription_data}")
        
        return ReceiptValidationResponse(
            success=True,
            message="Receipt validated and subscription created",
            subscriptionData=subscription_data
        )
        
    except Exception as e:
        logger.error(f"Receipt validation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def validate_apple_receipt(receipt_data: str, product_id: str, transaction_id: str):
    """Validate receipt with Apple's servers"""
    try:
        # Try production endpoint first
        endpoints = [
            "https://buy.itunes.apple.com/verifyReceipt",  # Production
            "https://sandbox.itunes.apple.com/verifyReceipt"  # Sandbox fallback
        ]
        
        receipt_payload = {
            "receipt-data": receipt_data,
            "password": os.getenv("APPLE_SHARED_SECRET"),
            "exclude-old-transactions": True
        }
        
        for endpoint in endpoints:
            logger.info(f"Trying Apple endpoint: {endpoint}")
            
            response = requests.post(endpoint, json=receipt_payload, timeout=30)
            
            if response.status_code != 200:
                continue
                
            result = response.json()
            status = result.get("status")
            
            # Status 21007 means we should use sandbox
            if status == 21007 and endpoint == endpoints[0]:
                continue
                
            if status == 0:
                # Receipt is valid
                latest_receipt_info = result.get("latest_receipt_info", [])
                
                # Find the matching transaction
                for transaction in latest_receipt_info:
                    if transaction.get("product_id") == product_id:
                        # Check if subscription is active
                        expires_date = transaction.get("expires_date_ms")
                        if expires_date:
                            import time
                            if int(expires_date) / 1000 > time.time():
                                return True, {
                                    "transaction_id": transaction.get("transaction_id"),
                                    "expires_date": expires_date,
                                    "product_id": product_id,
                                    "plan_code": get_plan_code_from_product_id(product_id),
                                    "environment": "sandbox" if "sandbox" in endpoint else "production"
                                }
                
                return False, "No active subscription found"
            else:
                logger.warning(f"Apple validation failed with status: {status}")
                
        return False, "All Apple endpoints failed"
        
    except Exception as e:
        logger.error(f"Apple receipt validation error: {e}")
        return False, str(e)

def get_plan_code_from_product_id(product_id: str) -> str:
    """Map Apple product ID to internal plan code"""
    product_mapping = {
        'market_scanner_pro_monthly': 'pro',
        'market_scanner_pro_trader_monthly': 'pro_trader'
    }
    return product_mapping.get(product_id, 'free')

@app.get("/api/iap/entitlement")
async def get_entitlement(device_id: str = None, user_id: str = None):
    """Get current subscription entitlement for device or user"""
    try:
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise HTTPException(status_code=500, detail="Database URL not configured")
        
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()
        
        # Query by device_id or user_id
        if user_id:
            query = """
            SELECT plan_code, status, current_period_end 
            FROM user_subscriptions 
            WHERE workspace_id = %s AND status = 'active' AND current_period_end > NOW()
            ORDER BY current_period_end DESC LIMIT 1
            """
            cursor.execute(query, (user_id,))
        elif device_id:
            query = """
            SELECT plan_code, status, current_period_end 
            FROM user_subscriptions 
            WHERE workspace_id = %s AND status = 'active' AND current_period_end > NOW()
            ORDER BY current_period_end DESC LIMIT 1
            """
            cursor.execute(query, (device_id,))
        else:
            raise HTTPException(status_code=400, detail="device_id or user_id required")
        
        result = cursor.fetchone()
        conn.close()
        
        if result:
            return {
                "tier": result[0],
                "status": result[1], 
                "expires_at": result[2].isoformat(),
                "features": get_features_for_tier(result[0])
            }
        else:
            return {
                "tier": "free",
                "status": "none",
                "expires_at": None,
                "features": get_features_for_tier("free")
            }
            
    except Exception as e:
        logger.error(f"Get entitlement error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def get_features_for_tier(tier: str) -> dict:
    """Return feature permissions for subscription tier"""
    features = {
        "free": {
            "market_scans": 5,
            "watchlists": 1,
            "alerts": False,
            "advanced_charts": False,
            "backtesting": False,
            "custom_algorithms": False,
            "portfolio_tracking": False
        },
        "pro": {
            "market_scans": -1,  # unlimited
            "watchlists": -1,
            "alerts": True,
            "advanced_charts": True,
            "backtesting": False,
            "custom_algorithms": False,
            "portfolio_tracking": True
        },
        "pro_trader": {
            "market_scans": -1,
            "watchlists": -1,
            "alerts": True,
            "advanced_charts": True,
            "backtesting": True,
            "custom_algorithms": True,
            "portfolio_tracking": True
        }
    }
    return features.get(tier, features["free"])

async def process_subscription(validation_result: dict, workspace_id: str, transaction_id: str):
    """Create or update subscription in database"""
    try:
        if not workspace_id:
            # Generate workspace if not provided
            workspace_id = f"ios_{transaction_id[:8]}"
        
        plan_code = validation_result["plan_code"]
        expires_date = validation_result["expires_date"]
        
        # Database connection
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            raise Exception("Database URL not configured")
        
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()
        
        # Create or update subscription
        query = """
        INSERT INTO user_subscriptions (workspace_id, plan_code, platform, billing_cycle, status, 
                                       current_period_start, current_period_end, apple_transaction_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (workspace_id) 
        DO UPDATE SET 
            plan_code = EXCLUDED.plan_code,
            status = EXCLUDED.status,
            current_period_end = EXCLUDED.current_period_end,
            apple_transaction_id = EXCLUDED.apple_transaction_id,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id
        """
        
        current_time = datetime.now()
        expires_datetime = datetime.fromtimestamp(int(expires_date) / 1000)
        
        cursor.execute(query, (
            workspace_id,
            plan_code,
            'ios',
            'monthly',
            'active',
            current_time,
            expires_datetime,
            transaction_id
        ))
        
        subscription_id = cursor.fetchone()[0]
        conn.commit()
        
        conn.close()
        
        return {
            "subscription_id": subscription_id,
            "workspace_id": workspace_id,
            "plan_code": plan_code,
            "expires_date": expires_datetime.isoformat(),
            "apple_transaction_id": transaction_id
        }
        
    except Exception as e:
        logger.error(f"Database error: {e}")
        raise Exception(f"Failed to process subscription: {str(e)}")

@app.get("/api/iap/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "Apple IAP API"}

@app.get("/api/iap/products")
async def get_products():
    """Get available IAP products"""
    products = [
        {
            "id": "market_scanner_pro_monthly",
            "title": "Market Scanner Pro",
            "price": "$4.99",
            "period": "monthly",
            "tier": "pro"
        },
        {
            "id": "market_scanner_pro_trader_monthly", 
            "title": "Market Scanner Pro Trader",
            "price": "$9.99",
            "period": "monthly",
            "tier": "pro_trader"
        }
    ]
    return {"products": products}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)