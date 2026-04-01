"use client";

import SectionTitle from "@/components/admin/shared/SectionTitle";
import AdminCard from "@/components/admin/shared/AdminCard";
import StatusPill from "@/components/admin/shared/StatusPill";

export default function LiveScannerPage() {
  return (
    <div className="p-4 space-y-4">
      <SectionTitle title="Live Scanner Feed" />
      <AdminCard title="Scanner Status">
        <div className="flex items-center gap-3">
          <StatusPill label="Active" tone="green" />
          <span className="text-white/50 text-sm">
            Real-time scanner hits will appear here when connected to the operator engine.
          </span>
        </div>
      </AdminCard>
      <AdminCard title="Recent Hits">
        <p className="text-white/40 text-sm">No scanner hits yet. Start a scan from the Operator Terminal.</p>
      </AdminCard>
    </div>
  );
}
