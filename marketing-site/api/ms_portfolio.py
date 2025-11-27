from flask import Blueprint, request, jsonify

portfolio = Blueprint("portfolio", __name__)

# TEMP IN-MEMORY (db later)
positions = []

@portfolio.route("/portfolio", methods=["GET"])
def get_portfolio():
    return jsonify({"count": len(positions), "positions": positions})


@portfolio.route("/portfolio/add", methods=["POST"])
def add_position():
    data = request.get_json()
    if not data or "symbol" not in data or "size" not in data or "entry" not in data:
        return jsonify({"error": "symbol, size, entry required"}), 400

    pos = {
        "symbol": data["symbol"].upper(),
        "size": float(data["size"]),
        "entry": float(data["entry"])
    }
    positions.append(pos)
    return jsonify({"added": pos}), 200


@portfolio.route("/portfolio/reset", methods=["POST"])
def reset_portfolio():
    positions.clear()
    return jsonify({"reset": True}), 200

from flask import Blueprint, request, jsonify

portfolio = Blueprint("portfolio", __name__)

# TEMP IN-MEMORY (db later)
positions = []

@portfolio.route("/portfolio", methods=["GET"])
def get_portfolio():
    return jsonify({"count": len(positions), "positions": positions})


@portfolio.route("/portfolio/add", methods=["POST"])
def add_position():
    data = request.get_json()
    if not data or "symbol" not in data or "size" not in data or "entry" not in data:
        return jsonify({"error": "symbol, size, entry required"}), 400

    pos = {
        "symbol": data["symbol"].upper(),
        "size": float(data["size"]),
        "entry": float(data["entry"])
    }
    positions.append(pos)
    return jsonify({"added": pos}), 200


@portfolio.route("/portfolio/reset", methods=["POST"])
def reset_portfolio():
    positions.clear()
    return jsonify({"reset": True}), 200
