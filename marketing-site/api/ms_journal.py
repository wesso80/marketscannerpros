# marketing-site/api/ms_journal.py

from flask import Blueprint, request, jsonify
from datetime import datetime

journal = Blueprint("journal", __name__)

# Simple in-memory store for entries
entries = []

@journal.route("/journal", methods=["GET"])
def get_journal():
    return jsonify({"count": len(entries), "entries": entries})


@journal.route("/journal/add", methods=["POST"])
def add_entry():
    data = request.get_json() or {}
    if not data.get("symbol") or not data.get("action"):
        return jsonify({"error": "symbol and action required"}), 400

    entry = {
        "id": len(entries) + 1,
        "symbol": data.get("symbol").upper(),
        "action": data.get("action"),
        "tags": data.get("tags") or [],
        "note": data.get("note") or "",
        "screenshot": data.get("screenshot") or None,
        "created_at": datetime.utcnow().isoformat() + "Z"
    }
    entries.append(entry)
    return jsonify({"added": entry}), 200


@journal.route("/journal/reset", methods=["POST"])
def reset_journal():
    entries.clear()
    return jsonify({"reset": True}), 200
