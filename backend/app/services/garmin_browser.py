"""Browser-based Garmin Connect login.

Garmin's SSO serves a reCAPTCHA on `/portal/sso` for many accounts, which
the unofficial `garminconnect` Python library cannot solve. This module
opens a real headed Chromium window so the user can complete the captcha
once, then persists the authenticated session (cookies + localStorage)
to disk. Subsequent syncs reuse that session and hit Garmin's REST API
directly with cookie auth — no further captcha, no rate-limit dance.

Public API:
    interactive_login(user_id, timeout_s=240) -> dict
    load_storage_state(user_id) -> dict | None
    storage_path(user_id) -> str
    has_valid_session(user_id) -> bool
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

logger = logging.getLogger(__name__)

_SESSION_ROOT = os.path.join(
    os.environ.get("XDG_CACHE_HOME", os.path.expanduser("~/.cache")),
    "fitfuel",
    "garmin-sessions",
)


def _dir(user_id: str) -> str:
    p = os.path.join(_SESSION_ROOT, user_id)
    os.makedirs(p, exist_ok=True)
    return p


def storage_path(user_id: str) -> str:
    return os.path.join(_dir(user_id), "storage_state.json")


def has_valid_session(user_id: str) -> bool:
    """Quick check that a session file exists and contains Garmin cookies.

    We don't validate freshness here — that's done at request time by the
    HTTP client, which falls back to an auth error if cookies have expired.
    """
    p = storage_path(user_id)
    if not os.path.exists(p):
        return False
    try:
        with open(p) as f:
            state = json.load(f)
    except Exception:
        return False
    cookies = state.get("cookies") or []
    return any("garmin.com" in (c.get("domain") or "") for c in cookies)


def load_storage_state(user_id: str) -> dict | None:
    p = storage_path(user_id)
    if not os.path.exists(p):
        return None
    try:
        with open(p) as f:
            return json.load(f)
    except Exception as e:
        logger.warning("Failed to read Garmin session for %s: %s", user_id, e)
        return None


def interactive_login(user_id: str, timeout_s: int = 240) -> dict[str, Any]:
    """Open a headed Chromium window pointed at Garmin SSO. Wait for the
    user to complete sign-in (captcha + credentials + any MFA). Persist
    the authenticated storage state to disk.

    Blocks the calling thread. Call this inside a threadpool if invoked
    from an async FastAPI handler.

    Raises RuntimeError if the login doesn't complete within `timeout_s`.
    """
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout  # type: ignore

    out_path = storage_path(user_id)

    # Keep browser profile sticky across re-logins — lets the user skip
    # repeat captchas on the same machine.
    user_data_dir = os.path.join(_dir(user_id), "chromium-profile")

    t0 = time.time()
    with sync_playwright() as p:
        logger.info("Launching Chromium for Garmin browser login (user=%s)", user_id)
        context = p.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=False,
            viewport={"width": 1100, "height": 780},
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-default-browser-check",
                "--disable-features=PasswordLeakToggleMove",
            ],
        )
        # Remove the webdriver flag so Garmin's bot-detection doesn't trip.
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        )

        try:
            page = context.pages[0] if context.pages else context.new_page()
            page.goto(
                "https://sso.garmin.com/portal/sso/en-US/sign-in"
                "?clientId=GarminConnect"
                "&service=https%3A%2F%2Fconnect.garmin.com%2Fapp",
                wait_until="domcontentloaded",
            )

            # The successful landing URL after login is either:
            #   https://connect.garmin.com/modern/           (legacy)
            #   https://connect.garmin.com/app              (current)
            # We poll for any connect.garmin.com URL that's not the SSO
            # portal — that's the reliable "logged in" signal.
            deadline = time.time() + timeout_s
            logged_in = False
            while time.time() < deadline:
                try:
                    current = page.url or ""
                except Exception:
                    current = ""
                if (
                    current.startswith("https://connect.garmin.com/")
                    and "/sso/" not in current
                    and "/signin" not in current
                ):
                    # Give the SPA a beat to settle so auth cookies are
                    # definitely written.
                    page.wait_for_timeout(2500)
                    logged_in = True
                    break
                try:
                    page.wait_for_timeout(1000)
                except PWTimeout:
                    pass

            if not logged_in:
                raise RuntimeError(
                    "Garmin login was not completed within the time window. "
                    "Close any open popups and try again."
                )

            # Persist everything: cookies + localStorage.
            context.storage_state(path=out_path)
            logger.info(
                "Garmin browser login: session saved for user=%s in %.1fs",
                user_id,
                time.time() - t0,
            )
        finally:
            try:
                context.close()
            except Exception:
                pass

    # Double-check we actually captured Garmin cookies.
    if not has_valid_session(user_id):
        raise RuntimeError(
            "Login completed but no Garmin cookies were captured. "
            "Please try again and make sure you land on connect.garmin.com."
        )

    return {
        "status": "success",
        "storage_path": out_path,
        "duration_s": round(time.time() - t0, 1),
    }


def clear_session(user_id: str) -> bool:
    p = storage_path(user_id)
    removed = False
    if os.path.exists(p):
        os.remove(p)
        removed = True
    return removed
