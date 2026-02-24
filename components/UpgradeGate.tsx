"use client";

import Link from "next/link";
import { PLAN_PRICES, tierDisplayName } from '@/lib/planPrices';

interface UpgradeGateProps {
  requiredTier: "pro" | "pro_trader";
  feature: string;
  children?: React.ReactNode;
}

export default function UpgradeGate({ requiredTier, feature, children }: UpgradeGateProps) {
  const tierName = tierDisplayName(requiredTier);
  const price = requiredTier === "pro_trader" ? PLAN_PRICES.pro_trader.monthly : PLAN_PRICES.pro.monthly;
  
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-5 py-10">
      <div className="msp-card w-full max-w-[480px] rounded-[20px] px-5 py-8 text-center sm:px-10 sm:py-12">
        <div style={{ fontSize: "56px", marginBottom: "20px" }}>🔒</div>
        
        <h2 style={{
          fontSize: "26px",
          fontWeight: "700",
          color: "var(--msp-text)",
          marginBottom: "12px",
        }}>
          {tierName} Feature
        </h2>
        
        <p style={{
          color: "var(--msp-text-muted)",
          fontSize: "16px",
          lineHeight: "1.6",
          marginBottom: "24px",
        }}>
          <strong style={{ color: "var(--msp-text)" }}>{feature}</strong> is available 
          on the {tierName} plan.
        </p>

        {children}

        <div className="mb-6 rounded-panel border border-msp-borderStrong bg-msp-panel p-4">
          <div style={{ color: "var(--msp-accent)", fontWeight: "600", fontSize: "14px", marginBottom: "4px" }}>
            Unlock {tierName}
          </div>
          <div style={{ color: "var(--msp-text)", fontSize: "24px", fontWeight: "700" }}>
            {price}<span style={{ fontSize: "14px", fontWeight: "400" }}>/month</span>
          </div>
        </div>

        <Link
          href="/pricing"
          className="inline-block rounded-full border border-msp-borderStrong bg-msp-accent px-8 py-3.5 text-base font-semibold text-[#061018] no-underline"
        >
          Upgrade to {tierName}
        </Link>

        <p style={{
          color: "var(--msp-text-faint)",
          fontSize: "13px",
          marginTop: "16px",
        }}>
          7-day money-back guarantee • Cancel anytime
        </p>
      </div>
    </div>
  );
}
