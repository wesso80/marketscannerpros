import type { Metadata } from "next";
import AdminDirectLogin from "@/components/admin/AdminDirectLogin";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLoginPage() {
  return (
    <main className="min-h-screen bg-[#07110e] px-4 py-16 text-white">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-lg font-semibold">Admin sign in</h1>
        <p className="mt-2 text-sm text-white/60">Use the admin email and passphrase. This page is not linked from the public site.</p>
        <AdminDirectLogin />
      </div>
    </main>
  );
}
