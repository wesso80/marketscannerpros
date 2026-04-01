"use client";

import SectionTitle from "@/components/admin/shared/SectionTitle";
import AdminCard from "@/components/admin/shared/AdminCard";
import MiniStat from "@/components/admin/shared/MiniStat";

export default function SystemPage() {
  return (
    <div className="p-4 space-y-4">
      <SectionTitle title="System Overview" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Total Users" value="—" />
        <MiniStat label="Active Subscriptions" value="—" />
        <MiniStat label="API Calls (24h)" value="—" />
        <MiniStat label="Uptime" value="—" />
      </div>
      <AdminCard title="Feature Flags">
        <p className="text-white/40 text-sm">Toggle feature flags and system-wide settings here.</p>
      </AdminCard>
      <AdminCard title="Cron Jobs">
        <p className="text-white/40 text-sm">Scheduled task status and next-run times will appear here.</p>
      </AdminCard>
    </div>
  );
}
