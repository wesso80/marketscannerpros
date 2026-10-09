"use client";

import Link from "next/link";
import SectionTitle from "@/components/admin/shared/SectionTitle";
import AdminCard from "@/components/admin/shared/AdminCard";

/**
 * Read-only reference. Nothing on this page changes a setting: the earlier cards promised API-key, preference and
 * security controls that never existed (admin audit A6). Each card says where the setting actually lives.
 */
export default function SettingsPage() {
  return (
    <div className="p-4 space-y-4">
      <SectionTitle title="Admin Settings" />
      <p data-settings-readonly className="text-sm text-white/60">
        Nothing can be changed on this page. It lists where each setting lives.
      </p>
      <AdminCard title="Sign-in and sessions">
        <ul className="space-y-1 text-sm text-white/60">
          <li>Sign in at <Link className="underline" href="/admin/login">/admin/login</Link>, or with an app session for an email in <code>ADMIN_EMAILS</code>.</li>
          <li>The admin session cookie lasts 12 hours. Removing an email from <code>ADMIN_EMAILS</code> revokes its admin access, including admin cookies already issued.</li>
          <li>Logout ends both the admin cookie and the app session from the admin sign-in.</li>
          <li>The admin list and secrets are set in the Render environment, not here.</li>
        </ul>
      </AdminCard>
      <AdminCard title="API keys and secrets">
        <p className="text-sm text-white/60">
          Provider keys (Alpha Vantage, CoinGecko, Stripe, OpenAI) and signing secrets are environment variables on the Render
          web service and worker. They cannot be viewed or edited from the admin area. Never paste them into chat or tickets.
        </p>
      </AdminCard>
      <AdminCard title="Pause switches">
        <ul className="space-y-1 text-sm text-white/60">
          <li><code>ADMIN_DISCOVERY_ONLY</code>, <code>ADMIN_EQUITIES_PAUSED</code>, <code>CRYPTO_MARKETS_PAUSED</code> and <code>CRYPTO_MARKETS_PAUSE_EXITS</code> are environment settings.</li>
          <li>Crypto automation is one platform-wide flag set from the Crypto Markets page, not a per-account setting.</li>
          <li>Current states and recent job outcomes are on <Link className="underline" href="/admin/health">Health</Link>.</li>
        </ul>
      </AdminCard>
      <AdminCard title="Notifications and preferences">
        <ul className="space-y-1 text-sm text-white/60">
          <li>Research-alert notifications can be paused for this workspace from <Link className="underline" href="/admin/alerts">Alerts</Link>; that setting is saved.</li>
          <li>Chart timeframes and scanner intervals have no saved settings yet.</li>
        </ul>
      </AdminCard>
    </div>
  );
}
