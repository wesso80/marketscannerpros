"use client";

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import type { UserTier } from "./useUserTier";

interface TierInfo {
  tier: UserTier;
  isLoading: boolean;
  isLoggedIn: boolean;
  isAdmin: boolean;
  email: string | null;
  /** Force refetch (e.g. after login/logout) */
  refresh: () => void;
}

const ANONYMOUS: TierInfo = {
  tier: "anonymous",
  isLoading: true,
  isLoggedIn: false,
  isAdmin: false,
  email: null,
  refresh: () => {},
};

const UserTierContext = createContext<TierInfo>(ANONYMOUS);

export function UserTierProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<Omit<TierInfo, "refresh">>({
    tier: "anonymous",
    isLoading: true,
    isLoggedIn: false,
    isAdmin: false,
    email: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const fetchTier = () => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);

    fetch("/api/me", { credentials: "include", signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        if (res.ok) return res.json();
        throw new Error("not-ok");
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data) {
          setInfo({
            tier: data.tier || "free",
            isLoading: false,
            isLoggedIn: true,
            isAdmin: data.isAdmin || false,
            email: data.email || null,
          });
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setInfo({
          tier: "anonymous",
          isLoading: false,
          isLoggedIn: false,
          isAdmin: false,
          email: null,
        });
      })
      .finally(() => clearTimeout(timeout));
  };

  useEffect(() => {
    fetchTier();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: TierInfo = { ...info, refresh: fetchTier };

  return (
    <UserTierContext.Provider value={value}>
      {children}
    </UserTierContext.Provider>
  );
}

/**
 * Consume the shared tier context.
 * Falls back to a local fetch if no provider is present (backwards compat).
 */
export function useUserTierContext(): TierInfo {
  return useContext(UserTierContext);
}
