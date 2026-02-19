export const safeUrl = (value?: string) => {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("data:image/")) return trimmed;
  try {
    const url = new URL(trimmed);
    if (["http:", "https:", "asset:", "tauri:"].includes(url.protocol)) {
      return trimmed;
    }
  } catch {}
  return "";
};

export const safeImageSrc = (value?: string, fallback = "") => {
  const safe = safeUrl(value);
  return safe || fallback;
};
