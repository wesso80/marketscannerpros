"use client";

import SectionTitle from "@/components/admin/shared/SectionTitle";
import AdminCard from "@/components/admin/shared/AdminCard";
import StatusPill from "@/components/admin/shared/StatusPill";
import MiniStat from "@/components/admin/shared/MiniStat";

export default function DiagnosticsPage() {
  return (
    <div className="p-4 space-y-4">
      <SectionTitle title="System Diagnostics" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="API Latency" value="—" />
        <MiniStat label="DB Connections" value="—" />
        <MiniStat label="Cache Hit Rate" value="—" />
        <MiniStat label="Error Rate" value="—" />
      </div>
      <AdminCard title="Health Checks">
        <div className="space-y-2">
          {["Alpha Vantage API", "PostgreSQL", "Stripe Webhooks", "OpenAI API"].map((svc) => (
            <div key={svc} className="flex items-center justify-between py-1">
              <span className="text-white/70 text-sm">{svc}</span>
              <StatusPill label="Pending" tone="neutral" />
            </div>
          ))}
        </div>
      </AdminCard>
      <AdminCard title="Recent Errors">
        <p className="text-white/40 text-sm">No errors logged in the current session.</p>
      </AdminCard>
    </div>
  );
}
