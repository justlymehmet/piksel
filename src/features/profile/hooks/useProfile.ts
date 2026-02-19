import { useMemo } from "react";

export const useProfile = (displayName: string, username: string) => {
  const title = useMemo(
    () => (displayName?.trim() ? displayName : username || "Kullanıcı"),
    [displayName, username],
  );

  return { title };
};

