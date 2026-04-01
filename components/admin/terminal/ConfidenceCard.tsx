"use client";

import AdminCard from "../shared/AdminCard";
import DataRow from "../shared/DataRow";
import { mockSymbol } from "@/lib/admin/mock-data";

export default function ConfidenceCard() {
  return (
    <AdminCard title="Confidence">
      <DataRow label="Confidence" value={`${mockSymbol.confidence}%`} valueColor="text-sky-300" />
      <DataRow label="Symbol Trust" value={`${mockSymbol.symbolTrust}%`} />
      <DataRow label="Size Multiplier" value={`${mockSymbol.sizeMultiplier}x`} />
    </AdminCard>
  );
}
