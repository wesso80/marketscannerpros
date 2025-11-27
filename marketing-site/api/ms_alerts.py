# marketing-site/api/ms_alerts.py

from flask import Blueprint, request, jsonify
from typing import List
from ms_scanner import run_scan

alerts = Blueprint("alerts", __name__)

# In-memory alerts store
_alerts: List[dict] = []

@alerts.route("/alerts", methods=["GET"])
def list_alerts():
    return jsonify({"count": len(_alerts), "alerts": _alerts})


@alerts.route("/alerts/add", methods=["POST"])
def add_alert():
    data = request.get_json() or {}
    # Expected fields: symbol, threshold, direction ("above"/"below"), label
    if not data.get("symbol") or not data.get("threshold") or not data.get("direction"):
        return jsonify({"error": "symbol, threshold, direction required"}), 400

    a = {
        "id": len(_alerts) + 1,
        "symbol": data.get("symbol").upper(),
        "threshold": float(data.get("threshold")),
        "direction": data.get("direction"),
        "label": data.get("label") or "",
    }
    _alerts.append(a)
    return jsonify({"added": a}), 200


@alerts.route("/alerts/reset", methods=["POST"])
def reset_alerts():
    _alerts.clear()
    return jsonify({"reset": True}), 200


@alerts.route("/alerts/check", methods=["POST"])
def check_alerts():
    """Evaluate all alerts against current scanner close price using `run_scan`.
    Returns list of triggered alerts with current price.
    """
    triggered = []
    # Optionally accept a list of symbol overrides in the POST body to limit checks
    body = request.get_json() or {}
    symbols_filter = body.get("symbols")

    for a in _alerts:
        sym = a["symbol"]
        if symbols_filter and sym not in symbols_filter:
            continue
        # Use run_scan to get current close price (interval default)
        res = run_scan(sym, interval=body.get("tf", "1h"))
        if res.get("error"):
            # include error in response but don't stop
            continue
        price = res.get("close")
        if price is None:
            continue
        if a["direction"] == "above" and price > a["threshold"]:
            triggered.append({**a, "price": price})
        if a["direction"] == "below" and price < a["threshold"]:
            triggered.append({**a, "price": price})

    return jsonify({"triggered": triggered, "count": len(triggered)})
