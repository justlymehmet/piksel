import { useMemo } from "react";

export const useAuthFlow = (isLogin: boolean, isVerifying: boolean) => {
  const mode = useMemo(() => {
    if (isLogin) return "login";
    if (isVerifying) return "verify";
    return "register";
  }, [isLogin, isVerifying]);

  return { mode };
};

