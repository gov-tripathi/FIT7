import { supabase } from "./supabaseClient";
import { GUEST_USER_ID } from "./context/AuthContext";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const GUEST_KEY = "fitfuel-guest-mode";

function b64urlEncode(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Build a JWT the backend will accept in dev mode.
 *  When SUPABASE_JWT_SECRET is empty, deps.py skips signature verification,
 *  so the signature value doesn't matter — but the alg must be a real one. */
function guestJwt(): string {
  const header = b64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64urlEncode(
    JSON.stringify({
      sub: GUEST_USER_ID,
      email: "guest@fitfuel.local",
      aud: "authenticated",
      role: "authenticated",
      iat: Math.floor(Date.now() / 1000),
    })
  );
  const signature = b64urlEncode("guest-signature");
  return `${header}.${payload}.${signature}`;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) return { Authorization: `Bearer ${token}` };
  if (localStorage.getItem(GUEST_KEY) === "true") {
    return { Authorization: `Bearer ${guestJwt()}` };
  }
  return {};
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await authHeaders()),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText} — ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const http = {
  get: <T>(p: string) => api<T>(p),
  post: <T>(p: string, body?: unknown) =>
    api<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(p: string, body?: unknown) =>
    api<T>(p, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(p: string) => api<T>(p, { method: "DELETE" }),
};

/** Multipart upload — does NOT set Content-Type so the browser supplies the boundary. */
export async function uploadFiles<T = unknown>(
  path: string,
  files: File[],
  field = "files"
): Promise<T> {
  const fd = new FormData();
  for (const f of files) fd.append(field, f, f.name);
  const headers = await authHeaders();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    body: fd,
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText} — ${text}`);
  }
  return (await res.json()) as T;
}
