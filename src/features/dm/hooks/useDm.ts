export type ClosedDmMap = Record<string, number>;

export const getClosedDmStorageKey = (uid: string) => `piksel_closed_dm_ids_${uid}`;

export const readClosedDmIds = (uid: string): ClosedDmMap => {
  try {
    const raw = localStorage.getItem(getClosedDmStorageKey(uid));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    const now = Date.now();
    const next: ClosedDmMap = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      if (!key) return;
      if (value === true) {
        next[key] = now;
        return;
      }
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) {
        next[key] = n;
      }
    });
    return next;
  } catch {
    return {};
  }
};

export const writeClosedDmIds = (uid: string, map: ClosedDmMap) => {
  try {
    localStorage.setItem(getClosedDmStorageKey(uid), JSON.stringify(map));
  } catch {}
};

const toMs = (value: any) => {
  if (!value) return 0;
  const d = new Date(value);
  const ms = d.getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

export const filterVisibleDmInboxes = (
  rows: any[],
  closedMap: ClosedDmMap,
) => {
  const list = (Array.isArray(rows) ? rows : []).filter((row) => {
    const id = String(row?.id || "");
    const closedAt = Number(closedMap?.[id] || 0);
    if (!closedAt) return true;

    const unread = Number(row?.unreadCount || 0);
    if (unread <= 0) return false;

    const updatedAt = toMs(row?.updatedAt);
    return updatedAt > closedAt;
  });
  list.sort((a, b) => toMs(b?.updatedAt) - toMs(a?.updatedAt));
  return list;
};

export const sameDmRows = (a: any[], b: any[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x?.id !== y?.id ||
      Number(x?.unreadCount || 0) !== Number(y?.unreadCount || 0) ||
      x?.updatedAt !== y?.updatedAt ||
      x?.lastMessage !== y?.lastMessage
    ) {
      return false;
    }
  }
  return true;
};
