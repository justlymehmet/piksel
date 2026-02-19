const SAFE_PROTOCOLS = ["http:", "https:", "data:", "asset:", "tauri:"] as const;

export const isSafeUrl = (value?: string | null) => {
  if (!value) return false;
  const raw = value.trim();
  if (!raw) return false;
  if (raw.startsWith("/")) return true;
  try {
    const u = new URL(raw);
    return SAFE_PROTOCOLS.includes(u.protocol as (typeof SAFE_PROTOCOLS)[number]);
  } catch {
    return false;
  }
};

export const safeImageSrc = (value?: string | null, fallback = "") => {
  return isSafeUrl(value) ? String(value).trim() : fallback;
};

export const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const res = await fetch(dataUrl);
  return await res.blob();
};
