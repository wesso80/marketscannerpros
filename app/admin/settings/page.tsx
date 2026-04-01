"use client";

import SectionTitle from "@/components/admin/shared/SectionTitle";
import AdminCard from "@/components/admin/shared/AdminCard";

export default function SettingsPage() {
  return (
    <div className="p-4 space-y-4">
      <SectionTitle title="Admin Settings" />
      <AdminCard title="API Keys">
        <p className="text-white/40 text-sm">Manage Alpha Vantage, Stripe, and OpenAI API key configuration.</p>
      </AdminCard>
      <AdminCard title="Operator Preferences">
        <p className="text-white/40 text-sm">Default chart timeframes, scanner intervals, and notification preferences.</p>
      </AdminCard>
      <AdminCard title="Security">
        <p className="text-white/40 text-sm">Admin secret rotation, session timeouts, and access control settings.</p>
      </AdminCard>
    </div>
  );
}
