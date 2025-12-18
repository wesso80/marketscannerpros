"use client";

import { useState, useEffect } from "react";

export type UserTier = "free" | "pro" | "pro_trader" | "anonymous";

interface TierInfo {
  tier: UserTier;
  isLoading: boolean;
  isLoggedIn: boolean;
}

export function useUserTier(): TierInfo {
  const [tier, setTier] = useState<UserTier>("anonymous");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    async function checkTier() {
      try {
        const res = await fetch("/api/me", {
          credentials: "include",
        });
        
        if (res.ok) {
          const data = await res.json();
          setTier(data.tier || "free");
          setIsLoggedIn(true);
        } else {
          setTier("anonymous");
          setIsLoggedIn(false);
        }
      } catch {
        setTier("anonymous");
        setIsLoggedIn(false);
      } finally {
        setIsLoading(false);
      }
    }
    
    checkTier();
  }, []);

  return { tier, isLoading, isLoggedIn };
}

// Feature access helpers
export const canAccessBacktest = (tier: UserTier) => tier === "pro_trader";
export const canAccessUnlimitedScanning = (tier: UserTier) => tier === "pro" || tier === "pro_trader";
export const canExportCSV = (tier: UserTier) => tier === "pro" || tier === "pro_trader";
export const canAccessTradingViewScripts = (tier: UserTier) => tier === "pro_trader";
export const canAccessAdvancedJournal = (tier: UserTier) => tier === "pro" || tier === "pro_trader";
export const canAccessPortfolioInsights = (tier: UserTier) => tier === "pro" || tier === "pro_trader";
export const getPortfolioLimit = (tier: UserTier) => tier === "anonymous" || tier === "free" ? 3 : Infinity;
export const getAILimit = (tier: UserTier) => {
  switch (tier) {
    case "pro_trader": return 200;
    case "pro": return 50;
    default: return 10;
  }
};
