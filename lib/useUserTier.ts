"use client";

import { useState, useEffect } from "react";

export type UserTier = "free" | "pro" | "pro_trader" | "anonymous";

interface TierInfo {
  tier: UserTier;
  isLoading: boolean;
  isLoggedIn: boolean;
  isAdmin: boolean;
  email: string | null;
}

export function useUserTier(): TierInfo {
  const [tier, setTier] = useState<UserTier>("anonymous");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    async function checkTier() {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await fetch("/api/me", {
          credentials: "include",
          signal: controller.signal,
        });
        
        if (res.ok) {
          const data = await res.json();
          setTier(data.tier || "free");
          setIsLoggedIn(true);
          setIsAdmin(data.isAdmin || false);
          setEmail(data.email || null);
        } else {
          setTier("anonymous");
          setIsLoggedIn(false);
          setIsAdmin(false);
          setEmail(null);
        }
      } catch {
        setTier("anonymous");
        setIsLoggedIn(false);
        setIsAdmin(false);
        setEmail(null);
      } finally {
        clearTimeout(timeout);
        setIsLoading(false);
      }
    }
    
    checkTier();
  }, []);

  return { tier, isLoading, isLoggedIn, isAdmin, email };
}

// Feature access helpers
export const canAccessBacktest = (tier: UserTier) => tier === "pro_trader";
export const canAccessBrain = (tier: UserTier) => tier === "pro_trader";
export const canAccessUnlimitedScanning = (tier: UserTier) => tier === "pro" || tier === "pro_trader";
export const canExportCSV = (tier: UserTier) => tier === "pro" || tier === "pro_trader";
// TradingView scripts no longer available
// export const canAccessTradingViewScripts = (tier: UserTier) => tier === "pro_trader";
export const canAccessAdvancedJournal = (tier: UserTier) => tier === "pro" || tier === "pro_trader";
export const canAccessPortfolioInsights = (tier: UserTier) => tier === "pro" || tier === "pro_trader";
export const canAccessCryptoCommandCenter = (tier: UserTier) => tier === "pro" || tier === "pro_trader";
export const getPortfolioLimit = (tier: UserTier) => tier === "anonymous" || tier === "free" ? 3 : Infinity;
export const getAILimit = (tier: UserTier) => {
  switch (tier) {
    case "pro_trader": return 200;
    case "pro": return 50;
    default: return 10;
  }
};
