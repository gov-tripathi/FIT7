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


_CHROME_PATHS = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
]


def _find_system_browser() -> str | None:
    for p in _CHROME_PATHS:
        if os.path.exists(p):
            return p
    return None


def interactive_login(user_id: str, timeout_s: int = 240) -> dict[str, Any]:
    """Open a headed browser window pointed at Garmin SSO. Wait for the
    user to complete sign-in (captcha + credentials + any MFA). Persist
    the authenticated storage state to disk.

    Prefers the system-installed Chrome/Brave over Playwright's bundled
    Chromium — real Chrome passes Garmin's bot-detection fingerprint checks
    that flag the Playwright binary as automation.

    Blocks the calling thread. Call inside a threadpool from async handlers.
    Raises RuntimeError if login doesn't complete within `timeout_s`.
    """
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout  # type: ignore

    out_path = storage_path(user_id)
    system_browser = _find_system_browser()

    # Separate profile dir per browser type so switching doesn't corrupt state.
    profile_key = "chrome-profile" if system_browser else "chromium-profile"
    user_data_dir = os.path.join(_dir(user_id), profile_key)

    logger.info(
        "Garmin browser login: using %s for user=%s",
        system_browser or "Playwright Chromium",
        user_id,
    )

    t0 = time.time()
    with sync_playwright() as p:
        launch_kwargs: dict = dict(
            user_data_dir=user_data_dir,
            headless=False,
            viewport={"width": 1280, "height": 800},
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-default-browser-check",
                "--disable-infobars",
                "--no-first-run",
                "--password-store=basic",
                "--disable-features=PasswordLeakToggleMove,ChromeWhatsNewUI",
            ],
            ignore_default_args=["--enable-automation"],
        )
        if system_browser:
            launch_kwargs["executable_path"] = system_browser

        context = p.chromium.launch_persistent_context(**launch_kwargs)

        # Anti-detection: hide navigator.webdriver and CDP artefacts.
        # Less critical when using real Chrome, but harmless to include.
        context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            try { delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise; } catch(e){}
            try { delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol; } catch(e){}
            if (!window.chrome) {
                window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} };
            }
        """)

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


def clear_chromium_profile(user_id: str) -> bool:
    """Delete the persisted Chromium profile for this user.

    Useful when Garmin's bot-detection has flagged the profile — a fresh
    profile looks like a brand-new browser install and avoids the ban.
    """
    import shutil
    profile_dir = os.path.join(_dir(user_id), "chromium-profile")
    if os.path.exists(profile_dir):
        shutil.rmtree(profile_dir, ignore_errors=True)
        logger.info("Cleared Chromium profile for user=%s", user_id)
        return True
    return False
