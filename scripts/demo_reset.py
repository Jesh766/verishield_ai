#!/usr/bin/env python3
"""
VeriShield AI — SIH Demo Reset Script
======================================

PURPOSE:  Quickly restore the demo environment to a known clean state between
          SIH demonstration runs.

WARNING:  This script deletes and recreates the backend SQLite database and
          clears the backend-specific .env if requested. It does NOT delete
          localStorage (browser state) — use the browser DevTools console
          command printed at the end.

This script is DEMO ONLY. Do not run against production data.
"""

import os
import sys
import shutil
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent / "backend"
DB_PATH = BACKEND_DIR / "verishield.db"
UPLOADS_DIR = BACKEND_DIR / ".uploads"
ENV_EXAMPLE = BACKEND_DIR / ".env.example"
ENV_FILE = BACKEND_DIR / ".env"

DEMO_BANNER = """
╔══════════════════════════════════════════════════════════════╗
║          VeriShield AI — SIH Demo Reset (DEMO ONLY)         ║
╚══════════════════════════════════════════════════════════════╝
"""

def confirm(prompt: str) -> bool:
    try:
        return input(f"{prompt} [y/N]: ").strip().lower() == "y"
    except (EOFError, KeyboardInterrupt):
        return False


def reset_database():
    if DB_PATH.exists():
        if confirm(f"Delete database {DB_PATH}?"):
            DB_PATH.unlink()
            print(f"  ✓ Deleted {DB_PATH}")
        else:
            print("  ↷ Skipped database reset.")
    else:
        print(f"  ✓ No database found at {DB_PATH} (already clean).")


def reset_uploads():
    if UPLOADS_DIR.exists():
        shutil.rmtree(UPLOADS_DIR, ignore_errors=True)
        print(f"  ✓ Cleared temp upload directory {UPLOADS_DIR}")
    else:
        print(f"  ✓ No uploads directory found (already clean).")


def ensure_demo_env():
    """Create a demo .env for the backend if one does not exist."""
    if ENV_FILE.exists():
        print(f"  ✓ backend/.env already exists — not overwriting.")
        return

    demo_env_content = """\
# VeriShield AI — Demo Environment (DEMO ONLY — do not use in production)
# This file is created by scripts/demo_reset.py for SIH demonstration use only.
ADMIN_PASSCODE=YOUR_DEMO_PASSCODE
VERISHIELD_ID_SALT=sih-demo-salt-2024
VERISHIELD_CORS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080
"""
    ENV_FILE.write_text(demo_env_content)
    print(f"  ✓ Created demo backend/.env with ADMIN_PASSCODE=YOUR_DEMO_PASSCODE")


def main():
    print(DEMO_BANNER)
    print("This will reset the VeriShield demo environment to a clean state.\n")
    print(f"  Backend directory : {BACKEND_DIR}")
    print(f"  Database path     : {DB_PATH}")
    print(f"  Uploads directory : {UPLOADS_DIR}")
    print()

    if not confirm("Proceed with demo reset?"):
        print("\nReset cancelled.")
        sys.exit(0)

    print("\n--- Step 1: Reset Database ---")
    reset_database()

    print("\n--- Step 2: Clear Temp Uploads ---")
    reset_uploads()

    print("\n--- Step 3: Ensure Demo .env ---")
    ensure_demo_env()

    print("""
--- Step 4: Reinitialize Database ---
The database will be recreated automatically when you start the backend.
Run the following commands to start fresh:

  cd backend
  python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

--- Step 5: Reset Browser State ---
Open the browser DevTools console (F12) on the VeriShield tab and run:

  localStorage.removeItem('verishield.sessions.v1');
  indexedDB.deleteDatabase('verishield-device-keys');
  sessionStorage.removeItem('vs_admin_token');
  location.reload();

This clears local sessions, the device ECDSA key pair, and the admin session token.

╔══════════════════════════════════════════════════════════════╗
║  Demo reset complete. Start the backend then open the app.  ║
╚══════════════════════════════════════════════════════════════╝
""")


if __name__ == "__main__":
    main()
