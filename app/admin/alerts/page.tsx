"use client";

import SectionTitle from "@/components/admin/shared/SectionTitle";
import AdminCard from "@/components/admin/shared/AdminCard";

export default function AlertsPage() {
  return (
    <div className="p-4 space-y-4">
      <SectionTitle title="Alert Management" />
      <AdminCard title="Active Alerts">
        <p className="text-white/40 text-sm">No active alerts. Triggered alerts from the operator engine will appear here.</p>
      </AdminCard>
      <AdminCard title="Alert Rules">
        <p className="text-white/40 text-sm">Configure price, volume, and technical indicator alert rules here.</p>
      </AdminCard>
      <AdminCard title="Alert History">
        <p className="text-white/40 text-sm">Past alert triggers will be logged here with timestamps and outcomes.</p>
      </AdminCard>
    </div>
  );
}
