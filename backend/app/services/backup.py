"""
SQLite database backup and recovery utilities.
Provides safe backup/restore for the verification_sessions table.
"""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

def get_database_path() -> Path:
    """Get the path to the SQLite database."""
    # Default location: backend directory
    db_path = Path(__file__).parent.parent / "verishield.db"
    return db_path


def backup_database(backup_dir: Optional[Path] = None) -> tuple[bool, str]:
    """
    Create a backup of the verification_sessions table.
    Returns (success, message)
    """
    try:
        db_path = get_database_path()
        if not db_path.exists():
            return False, f"Database not found at {db_path}"

        if backup_dir is None:
            backup_dir = db_path.parent / "backups"
        
        backup_dir.mkdir(parents=True, exist_ok=True)

        # Create timestamped backup file
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        backup_file = backup_dir / f"verishield_backup_{timestamp}.json"

        # Export verification_sessions to JSON
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Get all sessions
        cursor.execute("SELECT * FROM verification_sessions ORDER BY created_at DESC")
        sessions = cursor.fetchall()
        conn.close()

        # Serialize
        data = {
            "backup_date": datetime.now(timezone.utc).isoformat(),
            "database_file": str(db_path),
            "session_count": len(sessions),
            "sessions": [dict(row) for row in sessions],
        }

        backup_file.write_text(json.dumps(data, indent=2, default=str))
        return True, f"Backup created at {backup_file}"

    except Exception as e:
        return False, f"Backup failed: {str(e)}"


def verify_backup_integrity(backup_file: Path) -> tuple[bool, str]:
    """
    Verify that a backup file is valid and readable.
    Returns (valid, message)
    """
    try:
        if not backup_file.exists():
            return False, f"Backup file not found: {backup_file}"

        data = json.loads(backup_file.read_text())

        if "sessions" not in data:
            return False, "Backup missing 'sessions' key"

        if not isinstance(data["sessions"], list):
            return False, "Sessions not in expected format"

        return True, f"Backup is valid ({len(data['sessions'])} sessions)"

    except json.JSONDecodeError:
        return False, "Backup file is corrupted JSON"
    except Exception as e:
        return False, f"Verification failed: {str(e)}"


def restore_database(backup_file: Path, dry_run: bool = True) -> tuple[bool, str]:
    """
    Restore verification_sessions from a backup.
    If dry_run=True, validate without modifying database.
    Returns (success, message)
    """
    try:
        # Verify backup first
        valid, msg = verify_backup_integrity(backup_file)
        if not valid:
            return False, f"Cannot restore: {msg}"

        data = json.loads(backup_file.read_text())
        session_count = len(data.get("sessions", []))

        if dry_run:
            return True, f"Dry run OK: Would restore {session_count} sessions"

        # Perform actual restore
        db_path = get_database_path()
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()

        # Create backup of current state first
        backup_database()

        # Clear existing sessions
        cursor.execute("DELETE FROM verification_sessions")

        # Restore from backup
        for session in data["sessions"]:
            cursor.execute(
                """
                INSERT INTO verification_sessions 
                (id, device_id, checkpoint_id, officer_badge, document_type, 
                 extracted_fields, evidence, decision, decision_timestamp, 
                 decision_note, created_at, synced_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session.get("id"),
                    session.get("device_id"),
                    session.get("checkpoint_id"),
                    session.get("officer_badge"),
                    session.get("document_type"),
                    session.get("extracted_fields"),
                    session.get("evidence"),
                    session.get("decision"),
                    session.get("decision_timestamp"),
                    session.get("decision_note"),
                    session.get("created_at"),
                    session.get("synced_at"),
                ),
            )

        conn.commit()
        conn.close()

        return True, f"Restored {session_count} sessions from backup"

    except Exception as e:
        return False, f"Restore failed: {str(e)}"


def list_backups(backup_dir: Optional[Path] = None) -> list[Path]:
    """List all available backups."""
    if backup_dir is None:
        backup_dir = get_database_path().parent / "backups"

    if not backup_dir.exists():
        return []

    return sorted(backup_dir.glob("verishield_backup_*.json"), reverse=True)


def cleanup_old_backups(keep_count: int = 5, backup_dir: Optional[Path] = None) -> int:
    """
    Remove old backups, keeping only the most recent.
    Returns number of backups deleted.
    """
    backups = list_backups(backup_dir)
    if len(backups) <= keep_count:
        return 0

    deleted = 0
    for backup in backups[keep_count:]:
        backup.unlink()
        deleted += 1

    return deleted
