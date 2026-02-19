import { useMemo } from "react";

export const useSettings = (savedThemeId: string, draftThemeId: string) => {
  const dirty = useMemo(() => savedThemeId !== draftThemeId, [savedThemeId, draftThemeId]);
  return { dirty };
};

