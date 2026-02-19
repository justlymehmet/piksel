import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:3001";

const api = (backendUrl?: string) => backendUrl || DEFAULT_BACKEND_URL;

export type PresenceState = {
  uid: string;
  status: "online" | "idle" | "dnd" | "offline";
  presence: "online" | "offline";
  customStatus: string;
  lastActive: string | null;
  updatedAt: string | null;
};

const toPresenceState = (raw: any): PresenceState => {
  const statusRaw = String(raw?.status || "online").toLowerCase();
  const status: PresenceState["status"] =
    statusRaw === "idle" ||
    statusRaw === "dnd" ||
    statusRaw === "offline"
      ? statusRaw
      : "online";
  return {
    uid: String(raw?.uid || ""),
    status,
    presence:
      String(raw?.presence || "").toLowerCase() === "online"
        ? "online"
        : "offline",
    customStatus: String(raw?.customStatus || ""),
    lastActive: raw?.lastActive ? String(raw.lastActive) : null,
    updatedAt: raw?.updatedAt ? String(raw.updatedAt) : null,
  };
};

export const fetchPresenceByUid = async (
  uid: string,
  backendUrl?: string,
) => {
  const res = await tauriFetch(`${api(backendUrl)}/presence/${uid}`, {
    method: "GET",
  });
  if (!res.ok) throw new Error("PRESENCE_FETCH_FAILED");
  const body = await res.json();
  return toPresenceState(body?.state || { uid });
};

export const fetchPresenceBatch = async (
  uids: string[],
  backendUrl?: string,
) => {
  const uniq = Array.from(new Set((uids || []).map(String).filter(Boolean)));
  if (uniq.length === 0) return [] as PresenceState[];
  const res = await tauriFetch(`${api(backendUrl)}/presence/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uids: uniq }),
  });
  if (!res.ok) throw new Error("PRESENCE_BATCH_FAILED");
  const body = await res.json();
  return Array.isArray(body?.rows)
    ? (body.rows as any[]).map(toPresenceState)
    : [];
};

export const setUserPresence = async (
  uid: string,
  presence: "online" | "offline",
  backendUrl?: string,
) => {
  const res = await tauriFetch(`${api(backendUrl)}/presence/${uid}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      presence,
      touchLastActive: true,
    }),
  });
  if (!res.ok) throw new Error("PRESENCE_SET_FAILED");
  const body = await res.json();
  return toPresenceState(body?.state || { uid, presence });
};

export const pingUserPresence = async (uid: string, backendUrl?: string) => {
  const res = await tauriFetch(`${api(backendUrl)}/presence/ping`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid }),
  });
  if (!res.ok) throw new Error("PRESENCE_PING_FAILED");
  const body = await res.json();
  return toPresenceState(body?.state || { uid });
};

export const setUserStatus = async (
  uid: string,
  status: "online" | "idle" | "dnd" | "offline",
  customStatus: string,
  backendUrl?: string,
) => {
  const nextPresence = status === "offline" ? "offline" : "online";
  const res = await tauriFetch(`${api(backendUrl)}/presence/${uid}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status,
      customStatus,
      presence: nextPresence,
      touchLastActive: true,
    }),
  });
  if (!res.ok) throw new Error("STATUS_SET_FAILED");
  const body = await res.json();
  return toPresenceState(
    body?.state || { uid, status, customStatus, presence: nextPresence },
  );
};
