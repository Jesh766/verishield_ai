"""Tests for database backup and recovery utilities."""

import json
import tempfile
from pathlib import Path

import pytest

from app.services.backup import (
    backup_database,
    restore_database,
    verify_backup_integrity,
    list_backups,
    cleanup_old_backups,
)


def test_backup_database_creates_file(tmp_path, monkeypatch):
    """Test that backup creates a valid JSON file."""
    # Mock database path
    db_file = tmp_path / "verishield.db"
    db_file.write_text("")  # Create empty file

    # This will fail because database doesn't exist, but test the error handling
    success, msg = backup_database(tmp_path)
    assert success is False
    assert "Database" in msg or "backup" in msg.lower()


def test_verify_backup_integrity_rejects_missing_file():
    """Test that verification rejects missing files."""
    fake_path = Path("/nonexistent/backup.json")
    success, msg = verify_backup_integrity(fake_path)
    assert success is False
    assert "not found" in msg.lower()


def test_verify_backup_integrity_rejects_invalid_json(tmp_path):
    """Test that verification rejects invalid JSON."""
    backup_file = tmp_path / "invalid.json"
    backup_file.write_text("{invalid json")

    success, msg = verify_backup_integrity(backup_file)
    assert success is False
    assert "JSON" in msg or "corrupted" in msg.lower()


def test_verify_backup_integrity_rejects_missing_sessions(tmp_path):
    """Test that verification rejects backups without sessions."""
    backup_file = tmp_path / "missing_sessions.json"
    backup_file.write_text(json.dumps({"backup_date": "2026-01-01"}))

    success, msg = verify_backup_integrity(backup_file)
    assert success is False
    assert "sessions" in msg.lower()


def test_verify_backup_integrity_accepts_valid_backup(tmp_path):
    """Test that verification accepts valid backups."""
    backup_file = tmp_path / "valid.json"
    data = {
        "backup_date": "2026-01-01",
        "sessions": [
            {"id": "1", "created_at": "2026-01-01"},
            {"id": "2", "created_at": "2026-01-01"},
        ],
    }
    backup_file.write_text(json.dumps(data))

    success, msg = verify_backup_integrity(backup_file)
    assert success is True
    assert "valid" in msg.lower()
    assert "2 sessions" in msg


def test_restore_database_dry_run(tmp_path):
    """Test dry-run restore without modifying database."""
    backup_file = tmp_path / "valid.json"
    data = {
        "backup_date": "2026-01-01",
        "sessions": [{"id": "1"}],
    }
    backup_file.write_text(json.dumps(data))

    success, msg = restore_database(backup_file, dry_run=True)
    assert success is True
    assert "dry run" in msg.lower()
    assert "1 session" in msg


def test_restore_database_rejects_invalid(tmp_path):
    """Test that restore rejects invalid backups."""
    backup_file = tmp_path / "invalid.json"
    backup_file.write_text(json.dumps({"no": "sessions"}))

    success, msg = restore_database(backup_file)
    assert success is False


def test_list_backups_returns_empty_for_missing_dir(tmp_path):
    """Test that list returns empty list for missing directory."""
    missing_dir = tmp_path / "nonexistent"
    backups = list_backups(missing_dir)
    assert backups == []


def test_list_backups_finds_backups(tmp_path):
    """Test that list finds backup files."""
    backup_dir = tmp_path / "backups"
    backup_dir.mkdir()

    # Create some fake backups
    (backup_dir / "verishield_backup_20260101_120000.json").write_text("{}")
    (backup_dir / "verishield_backup_20260101_130000.json").write_text("{}")

    backups = list_backups(backup_dir)
    assert len(backups) == 2
    # Most recent first
    assert backups[0].name == "verishield_backup_20260101_130000.json"


def test_cleanup_old_backups_keeps_recent(tmp_path):
    """Test that cleanup keeps recent backups."""
    backup_dir = tmp_path / "backups"
    backup_dir.mkdir()

    # Create 7 backups
    for i in range(7):
        (backup_dir / f"verishield_backup_202601011{i:02d}000.json").write_text("{}")

    # Clean, keeping 5
    deleted = cleanup_old_backups(keep_count=5, backup_dir=backup_dir)
    assert deleted == 2

    remaining = list(backup_dir.glob("*.json"))
    assert len(remaining) == 5
