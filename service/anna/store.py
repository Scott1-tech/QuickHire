"""File-backed persistence. Uses the same DATA_DIR as the Node app so carriers.json
is shared (read-only here). Anna owns portfolios/settings/learning files.
"""
from __future__ import annotations
import os
import json
import threading

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "data"))
PORTFOLIO_FILE = os.path.join(DATA_DIR, "anna-portfolios.json")
SETTINGS_FILE = os.path.join(DATA_DIR, "anna-settings.json")
LEARNING_FILE = os.path.join(DATA_DIR, "anna-learning.json")
CARRIER_FILE = os.path.join(DATA_DIR, "carriers.json")

_lock = threading.Lock()


def _read(path, default):
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return default


def _write(path, data):
    os.makedirs(DATA_DIR, exist_ok=True)
    with _lock:
        with open(path, "w") as f:
            json.dump(data, f, indent=2)


def read_portfolios():
    return _read(PORTFOLIO_FILE, [])


def write_portfolios(rows):
    _write(PORTFOLIO_FILE, rows)


def upsert_portfolio(p):
    rows = read_portfolios()
    i = next((idx for idx, x in enumerate(rows) if x.get("id") == p.get("id")), -1)
    if i == -1:
        rows.append(p)
    else:
        rows[i] = p
    write_portfolios(rows)
    return p


def find_portfolio(pid):
    return next((p for p in read_portfolios() if p.get("id") == pid), None)


def read_settings():
    return _read(SETTINGS_FILE, {})


def write_settings(o):
    _write(SETTINGS_FILE, o)


def read_learning():
    return _read(LEARNING_FILE, {})


def write_learning(o):
    _write(LEARNING_FILE, o)


def read_carriers():
    return _read(CARRIER_FILE, [])


def find_carrier(cid):
    return next((c for c in read_carriers() if c.get("id") == cid), None)
