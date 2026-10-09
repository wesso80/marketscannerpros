import type { Metadata } from "next";
import AdminDirectLogin from "@/components/admin/AdminDirectLogin";
import styles from "./AdminLogin.module.css";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLoginPage() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>MSP / Private workspace</p>
        <h1>Admin sign in</h1>
        <p className={styles.intro}>Use the admin email and passphrase. This page is not linked from the public site.</p>
        <AdminDirectLogin />
      </div>
    </main>
  );
}
