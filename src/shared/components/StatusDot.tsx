import type { CSSProperties } from "react";

type StatusValue = "online" | "idle" | "dnd" | "offline";
type StatusSize = "sm" | "md" | "lg" | number;

type StatusDotProps = {
  status?: string | null;
  size?: StatusSize;
  className?: string;
  title?: string;
};

const SIZE_MAP: Record<Exclude<StatusSize, number>, number> = {
  sm: 10,
  md: 12,
  lg: 14,
};

function normalizeStatus(value?: string | null): StatusValue {
  const v = String(value || "").toLowerCase();
  if (v === "idle" || v === "dnd" || v === "offline") return v;
  return "online";
}

function getSizePx(size: StatusSize): number {
  return typeof size === "number" ? size : SIZE_MAP[size];
}

export default function StatusDot({
  status,
  size = "md",
  className = "",
  title,
}: StatusDotProps) {
  const s = normalizeStatus(status);
  const sizePx = getSizePx(size);
  const style = { "--sd-size": `${sizePx}px` } as CSSProperties;
  const ring = "color-mix(in srgb, #000 30%, var(--border) 70%)";

  return (
    <span
      className={`status-dot-svg ${className}`.trim()}
      style={style}
      title={title}
      aria-hidden="true"
    >
      <svg viewBox="0 0 16 16" focusable="false">
        {s === "online" && (
          <>
            <circle cx="8" cy="8" r="7" fill="var(--status-online)" />
            <circle cx="8" cy="8" r="7" fill="none" stroke={ring} strokeWidth="1" />
          </>
        )}
        {s === "idle" && (
          <>
            <circle cx="8" cy="8" r="7" fill="var(--status-idle)" />
            <circle cx="5.3" cy="5.7" r="4.4" fill="var(--surface-2)" />
            <circle cx="8" cy="8" r="7" fill="none" stroke={ring} strokeWidth="1" />
          </>
        )}
        {s === "dnd" && (
          <>
            <circle cx="8" cy="8" r="7" fill="var(--status-dnd)" />
            <rect x="3.4" y="7.1" width="9.2" height="1.8" rx="0.9" fill="#fff" />
            <circle cx="8" cy="8" r="7" fill="none" stroke={ring} strokeWidth="1" />
          </>
        )}
        {s === "offline" && (
          <>
            <circle cx="8" cy="8" r="7" fill="var(--status-offline-ring)" />
            <circle cx="8" cy="8" r="4.6" fill="var(--status-offline-fill)" />
            <circle cx="8" cy="8" r="7" fill="none" stroke={ring} strokeWidth="1" />
          </>
        )}
      </svg>
    </span>
  );
}
