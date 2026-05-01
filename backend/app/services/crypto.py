"""Symmetric encryption for Garmin tokens at rest."""
from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from ..config import get_settings


def _fernet() -> Fernet | None:
    key = get_settings().FERNET_KEY
    if not key:
        return None
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(plaintext: str) -> str:
    f = _fernet()
    if not f:
        return plaintext  # dev mode: passthrough
    return f.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    f = _fernet()
    if not f:
        return ciphertext
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        return ciphertext
