"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import styles from "./AdminNavigationFrame.module.css";

/** Presentation only: authentication remains in the admin layout. */
export default function AdminNavigationFrame({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key !== "Tab") return;
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex="0"]') ?? [])
        .filter(node => node.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      if (trigger.current?.getClientRects().length) trigger.current.focus();
    };
  }, [open]);

  return <div className={styles.frame}>
    {open && <div className={styles.backdrop} onClick={() => setOpen(false)} aria-hidden="true" />}
    <aside ref={panel} id="admin-navigation" className={`${styles.sidebar} ${open ? styles.open : ""}`}
      role={open ? "dialog" : undefined} aria-modal={open ? true : undefined} aria-label="Admin navigation"
      onClick={event => { if ((event.target as HTMLElement).closest("a[href]")) setOpen(false); }}>
      <button className={styles.close} type="button" onClick={() => setOpen(false)}>Close navigation</button>
      {sidebar}
    </aside>
    <div className={styles.content} inert={open}>
      <header className={styles.mobileHeader}>
        <span>MSP Operator <small>Private desk</small></span>
        <button ref={trigger} type="button" aria-expanded={open} aria-controls="admin-navigation" onClick={() => setOpen(true)}>Menu</button>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  </div>;
}
