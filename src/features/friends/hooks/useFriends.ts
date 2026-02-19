import { useMemo } from "react";

export const useFriends = (friendsMap: Record<string, boolean>) => {
  const friendCount = useMemo(
    () => Object.keys(friendsMap || {}).filter((k) => friendsMap[k]).length,
    [friendsMap],
  );

  return { friendCount };
};

