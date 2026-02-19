import { useEffect, useRef, useState } from "react";

type UseDmRailLoadingParams = {
  isLoggedIn: boolean;
  dmInboxReady: boolean;
  dmUsersReady: boolean;
  holdMs?: number;
  maxWaitMs?: number;
};

export const useDmRailLoading = ({
  isLoggedIn,
  dmInboxReady,
  dmUsersReady,
  holdMs = 500,
  maxWaitMs = 2600,
}: UseDmRailLoadingParams) => {
  const [showLoadingSkeleton, setShowLoadingSkeleton] = useState(false);
  const timerRef = useRef<number | null>(null);
  const hardStopRef = useRef<number | null>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    if (!isLoggedIn) {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (hardStopRef.current) {
        window.clearTimeout(hardStopRef.current);
        hardStopRef.current = null;
      }
      settledRef.current = false;
      setShowLoadingSkeleton(false);
      return;
    }

    settledRef.current = false;
    setShowLoadingSkeleton(true);

    if (hardStopRef.current) {
      window.clearTimeout(hardStopRef.current);
      hardStopRef.current = null;
    }
    hardStopRef.current = window.setTimeout(() => {
      settledRef.current = true;
      setShowLoadingSkeleton(false);
      hardStopRef.current = null;
    }, maxWaitMs);
  }, [isLoggedIn, maxWaitMs]);

  useEffect(() => {
    if (!isLoggedIn) return;

    const railDataReady = dmInboxReady && dmUsersReady;

    // Initial hydration only: once rail is settled, never reopen skeleton on inbox/user refreshes.
    if (settledRef.current) {
      setShowLoadingSkeleton(false);
      return;
    }

    if (!railDataReady) {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setShowLoadingSkeleton(true);
      return;
    }

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    timerRef.current = window.setTimeout(() => {
      settledRef.current = true;
      setShowLoadingSkeleton(false);
      timerRef.current = null;
    }, holdMs);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isLoggedIn, dmInboxReady, dmUsersReady, holdMs]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (hardStopRef.current) {
        window.clearTimeout(hardStopRef.current);
        hardStopRef.current = null;
      }
    };
  }, []);

  return { showLoadingSkeleton };
};
