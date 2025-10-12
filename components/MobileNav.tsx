"use client";
import { useState } from "react";

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Desktop Nav - Only visible on larger screens */}
      <nav className="desktop-only-nav" style={{ 
        display: 'none',
      }}>
        <style jsx>{`
          @media (min-width: 768px) {
            .desktop-only-nav {
              display: flex !important;
              align-items: center;
              opacity: 0.9;
              font-size: 0.875rem;
            }
            .desktop-only-nav a {
              margin-right: 1.5rem;
              white-space: nowrap;
            }
            .desktop-only-nav a:last-child {
              margin-right: 0;
            }
          }
        `}</style>
        <a href="/blog">Blog</a>
        <a href="/guide">User Guide</a>
        <a href="/pricing">Pricing</a>
        <a href="/contact">Contact</a>
        <a href="/dashboard">Dashboard</a>
      </nav>

      {/* Hamburger Button - Only visible on mobile */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
          padding: '0.5rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer'
        }}
        className="md:hidden"
        aria-label="Toggle menu"
      >
        <style jsx>{`
          @media (min-width: 768px) {
            button {
              display: none !important;
            }
          }
        `}</style>
        <span style={{ 
          display: 'block', 
          height: '2px', 
          width: '20px', 
          backgroundColor: '#f5f5f5',
          transition: 'all 0.3s',
          transform: isOpen ? 'rotate(45deg) translateY(6px)' : 'none'
        }} />
        <span style={{ 
          display: 'block', 
          height: '2px', 
          width: '20px', 
          backgroundColor: '#f5f5f5',
          transition: 'all 0.3s',
          opacity: isOpen ? 0 : 1
        }} />
        <span style={{ 
          display: 'block', 
          height: '2px', 
          width: '20px', 
          backgroundColor: '#f5f5f5',
          transition: 'all 0.3s',
          transform: isOpen ? 'rotate(-45deg) translateY(-6px)' : 'none'
        }} />
      </button>

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
          <a href="/blog" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>Blog</a>
          <a href="/guide" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>User Guide</a>
          <a href="/pricing" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>Pricing</a>
          <a href="/contact" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>Contact</a>
          <a href="/dashboard" className="py-2 hover:text-emerald-400" onClick={() => setIsOpen(false)}>Dashboard</a>
        </div>
      </div>
    </>
  );
}
