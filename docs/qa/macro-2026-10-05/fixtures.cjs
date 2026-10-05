module.exports = {
  "/api/commodities": {
    "commodities": [
      {
        "name": "Gold",
        "symbol": "GOLD",
        "price": 2650.22,
        "changePercent": 1.25,
        "category": "Metals",
        "unit": "USD/oz",
        "date": "2026-10-02",
        "freshnessStatus": "DELAYED",
        "eligibleForGate": true
      },
      {
        "name": "Oil",
        "symbol": "WTI",
        "price": null,
        "changePercent": null,
        "category": "Energy",
        "unit": null,
        "date": null,
        "freshnessStatus": "UNKNOWN",
        "eligibleForGate": false
      }
    ],
    "dataHealth": {
      "gateReady": false,
      "eligibleCount": 1,
      "totalCount": 2,
      "staleSymbols": [
        "WTI"
      ]
    },
    "sourceAsOf": "2026-10-02"
  },
  "/api/regime": {
    "regime": "RISK_ON",
    "asOf": "2026-10-05T13:00:00Z",
    "confidence": 72,
    "signals": [
      {
        "source": "Equities",
        "value": "positive",
        "weight": 0.6,
        "kind": "market",
        "signal": "risk_on",
        "regime": "risk_on",
        "counted": true
      },
      {
        "source": "Volatility",
        "value": "low",
        "weight": 0.4,
        "kind": "market",
        "signal": "risk_on",
        "regime": "risk_on",
        "counted": true
      }
    ]
  },
  "/api/economic-indicators": {
    "timestamp": "2026-10-05T13:00:00Z",
    "rates": {
      "treasury3m": {
        "value": 4.1,
        "date": "2026-10-02",
        "history": [
          {
            "value": 4.1,
            "date": "2026-10-02"
          },
          {
            "value": 3.9999999999999996,
            "date": "2026-10-01"
          }
        ]
      },
      "treasury2y": {
        "value": 3.8,
        "date": "2026-10-02",
        "history": [
          {
            "value": 3.8,
            "date": "2026-10-02"
          },
          {
            "value": 3.6999999999999997,
            "date": "2026-10-01"
          }
        ]
      },
      "treasury5y": {
        "value": 3.9,
        "date": "2026-10-02",
        "history": [
          {
            "value": 3.9,
            "date": "2026-10-02"
          },
          {
            "value": 3.8,
            "date": "2026-10-01"
          }
        ]
      },
      "treasury10y": {
        "value": 4.2,
        "date": "2026-10-02",
        "history": [
          {
            "value": 4.2,
            "date": "2026-10-02"
          },
          {
            "value": 4.1000000000000005,
            "date": "2026-10-01"
          }
        ]
      },
      "treasury30y": {
        "value": 4.5,
        "date": "2026-10-02",
        "history": [
          {
            "value": 4.5,
            "date": "2026-10-02"
          },
          {
            "value": 4.4,
            "date": "2026-10-01"
          }
        ]
      },
      "fedFunds": {
        "value": 4.25,
        "date": "2026-10-02",
        "history": [
          {
            "value": 4.25,
            "date": "2026-10-02"
          },
          {
            "value": 4.15,
            "date": "2026-10-01"
          }
        ]
      },
      "yieldCurve": {
        "value": 0.4,
        "inverted": false,
        "label": "Normal"
      },
      "yieldCurve3m10y": {
        "value": 0.1,
        "inverted": false,
        "label": "Normal"
      }
    },
    "inflation": {
      "cpi": {
        "value": 318.12,
        "date": "2026-10-02",
        "history": [
          {
            "value": 318.12,
            "date": "2026-10-02"
          },
          {
            "value": 318.02,
            "date": "2026-10-01"
          }
        ]
      },
      "inflationRate": {
        "value": 2.7,
        "date": "2026-10-02",
        "history": [
          {
            "value": 2.7,
            "date": "2026-10-02"
          },
          {
            "value": 2.6,
            "date": "2026-10-01"
          }
        ]
      },
      "trend": "elevated"
    },
    "employment": {
      "unemployment": {
        "value": 4.3,
        "date": "2026-10-02",
        "history": [
          {
            "value": 4.3,
            "date": "2026-10-02"
          },
          {
            "value": 4.2,
            "date": "2026-10-01"
          }
        ]
      },
      "trend": "stable"
    },
    "growth": {
      "realGDP": {
        "value": 23900,
        "date": "2026-10-02",
        "history": [
          {
            "value": 23900,
            "date": "2026-10-02"
          },
          {
            "value": 23899.9,
            "date": "2026-10-01"
          }
        ],
        "unit": "billions"
      }
    },
    "regime": {
      "label": "Mixed",
      "description": "Fixture macro observations",
      "riskLevel": "medium"
    }
  },
  "/api/correlation-regime": {
    "available": true,
    "regime": "RISK_OFF",
    "vixRegime": "UNAVAILABLE",
    "riskScore": 48.12345,
    "sizeMultiplier": 0.753217,
    "dxyTrend": "unavailable",
    "btcSpyCorrelation": null,
    "sectorRotation": "UNAVAILABLE",
    "components": {
      "goldSafeHaven": null
    },
    "warnings": [
      "VIX input unavailable"
    ],
    "recommendation": "Wait for stronger alignment",
    "inputs": {
      "vix": {
        "label": "VIX",
        "available": false,
        "value": null,
        "changePct": null,
        "asOf": null,
        "source": "alpha_vantage",
        "note": "MISSING"
      }
    }
  },
  "/api/options-chain": {
    "contracts": [
      {
        "type": "call",
        "openInterest": 10000
      },
      {
        "type": "put",
        "openInterest": 12000
      }
    ]
  },
  "/api/market-status": {
    "us": {
      "status": "open",
      "session": "regular",
      "sessionDisplay": "Regular session",
      "nextEvent": "Closes 16:00 ET"
    },
    "global": {
      "forex": {
        "status": "open"
      },
      "crypto": {
        "status": "open"
      }
    }
  },
  "missing": {
    "/api/economic-indicators": {
      "timestamp": "2026-10-05T13:00:00Z",
      "rates": {
        "treasury3m": {
          "value": null,
          "date": "2026-10-02",
          "history": [],
          "label": "UNKNOWN"
        },
        "treasury2y": {
          "value": null,
          "date": "2026-10-02",
          "history": [],
          "label": "UNKNOWN"
        },
        "treasury5y": {
          "value": null,
          "date": "2026-10-02",
          "history": [],
          "label": "UNKNOWN"
        },
        "treasury10y": {
          "value": null,
          "date": "2026-10-02",
          "history": [],
          "label": "UNKNOWN"
        },
        "treasury30y": {
          "value": null,
          "date": "2026-10-02",
          "history": [],
          "label": "UNKNOWN"
        },
        "fedFunds": {
          "value": null,
          "date": "2026-10-02",
          "history": [],
          "label": "UNKNOWN"
        },
        "yieldCurve": {
          "value": null,
          "inverted": false,
          "label": "UNKNOWN",
          "history": []
        },
        "yieldCurve3m10y": {
          "value": null,
          "inverted": false,
          "label": "UNKNOWN",
          "history": []
        }
      },
      "inflation": {
        "cpi": {
          "value": null,
          "date": "2026-10-02",
          "history": [],
          "label": "UNKNOWN"
        },
        "inflationRate": {
          "value": null,
          "date": "2026-10-02",
          "history": [],
          "label": "UNKNOWN"
        },
        "trend": "elevated"
      },
      "employment": {
        "unemployment": {
          "value": null,
          "date": "2026-10-02",
          "history": [],
          "label": "UNKNOWN"
        },
        "trend": "stable"
      },
      "growth": {
        "realGDP": {
          "value": null,
          "date": "2026-10-02",
          "history": [],
          "unit": "billions",
          "label": "UNKNOWN"
        }
      },
      "regime": {
        "label": "Mixed",
        "description": "Fixture macro observations",
        "riskLevel": "medium"
      }
    },
    "/api/options-chain": {
      "contracts": []
    },
    "/api/correlation-regime": {
      "available": false,
      "reason": "UNKNOWN_INPUT",
      "inputs": {
        "vix": {
          "label": "VIX",
          "available": false,
          "value": null,
          "changePct": null,
          "asOf": null,
          "source": "alpha_vantage",
          "note": "MISSING"
        }
      }
    }
  }
};
