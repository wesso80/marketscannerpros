"use client";

import SectionTitle from "@/components/admin/shared/SectionTitle";
import AdminCard from "@/components/admin/shared/AdminCard";

export default function LogsPage() {
  return (
    <div className="p-4 space-y-4">
      <SectionTitle title="System Logs" />
      <AdminCard title="Log Stream">
        <div className="font-mono text-xs text-white/50 space-y-1 max-h-[60vh] overflow-y-auto">
          <p className="text-white/30 italic">Waiting for log entries…</p>
        </div>
      </AdminCard>
      <AdminCard title="Filters">
        <div className="flex gap-2 flex-wrap">
          {["All", "Error", "Warn", "Info", "Debug"].map((level) => (
            <button
              key={level}
              className="px-3 py-1 rounded text-xs bg-white/5 text-white/50 hover:bg-white/10 transition"
            >
              {level}
            </button>
          ))}
        </div>
      </AdminCard>
    </div>
  );
}
