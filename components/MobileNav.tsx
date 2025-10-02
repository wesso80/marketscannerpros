"use client";
import { useState } from "react";

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Hamburger Button - Only visible on mobile */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden flex flex-col gap-1 p-2 flex-shrink-0"
        aria-label="Toggle menu"
      >
        <span className={`block h-0.5 w-5 bg-neutral-100 transition-all ${isOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
        <span className={`block h-0.5 w-5 bg-neutral-100 transition-all ${isOpen ? 'opacity-0' : ''}`} />
        <span className={`block h-0.5 w-5 bg-neutral-100 transition-all ${isOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
      </button>

      {/* Desktop Nav - Hidden on mobile */}
      <nav className="hidden md:flex md:gap-4 md:opacity-90 md:text-sm flex-wrap">
        <a href="/guide" className="hover:text-emerald-400">User Guide</a>
        <a href="/disclaimer" className="hover:text-emerald-400">Disclaimer</a>
        <a href="/pricing" className="hover:text-emerald-400">Pricing</a>
        <a href="/privacy" className="hover:text-emerald-400">Privacy</a>
        <a href="/legal/terms" className="hover:text-emerald-400">Terms</a>
        <a href="/contact" className="hover:text-emerald-400">Contact</a>
        <a href="/dashboard" className="hover:text-emerald-400">Dashboard</a>
      </nav>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Menu Drawer */}
      <div className={`
        fixed top-0 right-0 h-full w-64 bg-neutral-900 z-50 
        transform transition-transform duration-300 ease-in-out
        md:hidden border-l border-neutral-800
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <div className="flex flex-col p-6 gap-4">
          <button 
            onClick={() => setIsOpen(false)}
            className="self-end text-2xl"
          >
            ✕
          </button>
          <a href="/guide" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>User Guide</a>
          <a href="/disclaimer" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>Disclaimer</a>
          <a href="/pricing" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>Pricing</a>
          <a href="/privacy" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>Privacy</a>
          <a href="/legal/terms" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>Terms</a>
          <a href="/contact" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>Contact</a>
          <a href="/dashboard" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>Dashboard</a>
        </div>
      </div>
    </>
  );
}
