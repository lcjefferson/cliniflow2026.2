import os
import pytest
from datetime import datetime, timezone, timedelta
from importlib import import_module

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "testdb")
os.environ.setdefault("JWT_SECRET_KEY", "test")

server = import_module("backend.server")
_is_birthday_with_offset = server._is_birthday_with_offset


def test_birthday_today_matches_offset_zero():
    today = datetime.now(timezone.utc).date()
    birthdate = today.isoformat()
    assert _is_birthday_with_offset(birthdate, 0) is True


def test_birthday_tomorrow_matches_offset_minus_one():
    tomorrow = (datetime.now(timezone.utc).date() + timedelta(days=1))
    birthdate = tomorrow.isoformat()
    assert _is_birthday_with_offset(birthdate, -1) is True


def test_birthday_in_two_days_matches_offset_minus_two():
    target = (datetime.now(timezone.utc).date() + timedelta(days=2))
    birthdate = target.isoformat()
    assert _is_birthday_with_offset(birthdate, -2) is True


def test_invalid_date_returns_false():
    assert _is_birthday_with_offset("invalid-date", 0) is False
