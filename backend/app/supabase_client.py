"""Supabase client helpers.

We use two clients:
  * service_client — server-side, bypasses RLS (for scheduler, auth triggers).
  * user_client(jwt) — scoped to the caller's JWT so RLS policies apply.
"""
from functools import lru_cache
from typing import Optional

from supabase import create_client, Client

from .config import get_settings


@lru_cache
def service_client() -> Optional[Client]:
    s = get_settings()
    if not (s.SUPABASE_URL and s.SUPABASE_SERVICE_ROLE_KEY):
        return None
    return create_client(s.SUPABASE_URL, s.SUPABASE_SERVICE_ROLE_KEY)


def user_client(access_token: str) -> Optional[Client]:
    s = get_settings()
    if not (s.SUPABASE_URL and s.SUPABASE_ANON_KEY):
        return None
    client = create_client(s.SUPABASE_URL, s.SUPABASE_ANON_KEY)
    client.postgrest.auth(access_token)
    return client
