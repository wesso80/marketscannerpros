"use client";

import { ReactNode } from "react";
import AdminTopBar from "./AdminTopBar";
import AdminSidebar from "./AdminSidebar";
import AdminStatusBar from "./AdminStatusBar";

export default function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-[#08111d] text-white overflow-hidden">
      <AdminTopBar />
      <div className="flex flex-1 overflow-hidden">
        <AdminSidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <AdminStatusBar />
    </div>
  );
}
