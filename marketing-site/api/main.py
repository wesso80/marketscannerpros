# marketing-site/api/main.py
import os
import sys

# Ensure this directory is first in path so ms_scanner imports correctly
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from flask_cors import CORS
from ms_scanner import scanner as scanner_blueprint  # 👈 import the Blueprint
from ms_portfolio import portfolio as portfolio_blueprint
from ms_journal import journal as journal_blueprint
from ms_alerts import alerts as alerts_blueprint

app = Flask(__name__)

# Allow the web app to call /api/* from any origin (dev-friendly)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Mount all scanner endpoints under /api
app.register_blueprint(scanner_blueprint, url_prefix="/api")
app.register_blueprint(portfolio_blueprint, url_prefix="/api")
app.register_blueprint(journal_blueprint, url_prefix="/api")
app.register_blueprint(alerts_blueprint, url_prefix="/api")



@app.route("/health", methods=["GET"])
def health():
    return {"status": "ok", "service": "scanner-api"}, 200


if __name__ == "__main__":
    # Dev server
    app.run(host="0.0.0.0", port=5000, debug=True)
