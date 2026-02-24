"use client";

import { useDisplayMode } from "@/lib/displayMode";
import { redirect } from "next/navigation";

export default function DashboardPage() {
  const { isRetail } = useDisplayMode();
  redirect(isRetail ? "/tools/dashboard" : "/tools/command-hub");
}
