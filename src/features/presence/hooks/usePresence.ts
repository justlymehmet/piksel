import { useMemo } from "react";

type LastActiveLike =
  | Date
  | { toDate?: () => Date; seconds?: number }
  | null
  | undefined;

const resolveDate = (value: LastActiveLike): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  return null;
};

export const usePresence = (
  presence: string,
  status: string,
  lastActive: LastActiveLike,
) => {
  const effectiveStatus = useMemo(() => {
    if (status === "offline") return "offline";
    if (presence === "online") return status || "online";
    const d = resolveDate(lastActive);
    if (!d) return "offline";
    return Date.now() - d.getTime() <= 15 * 60 * 1000
      ? status || "online"
      : "offline";
  }, [presence, status, lastActive]);

  return { effectiveStatus };
};

