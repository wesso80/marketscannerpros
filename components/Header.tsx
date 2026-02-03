'use client';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';

interface DropdownItem {
  href: string;
  label: string;
  icon?: string;
}

interface DropdownProps {
  label: string;
  items: DropdownItem[];
}

function Dropdown({ label, items }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 hover:text-emerald-300 whitespace-nowrap transition-colors"
      >
        {label}
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 py-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl min-w-48 z-50">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors" onClick={() => setIsOpen(false)}>
              {item.icon && <span>{item.icon}</span>}
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

interface MobileAccordionProps {
  label: string;
  items: DropdownItem[];
  isOpen: boolean;
  onToggle: () => void;
  onLinkClick: () => void;
}

function MobileAccordion({ label, items, isOpen, onToggle, onLinkClick }: MobileAccordionProps) {
  return (
    <div className="border-b border-slate-800">
      <button onClick={onToggle} className="flex items-center justify-between w-full px-4 py-3 text-white hover:bg-emerald-500/10 rounded-lg transition-all">
        <span>{label}</span>
        <svg className={`w-4 h-4 text-emerald-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="pl-4 pb-2">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-300 rounded-lg transition-all" onClick={onLinkClick}>
              {item.icon && <span>{item.icon}</span>}
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [mobileDropdown, setMobileDropdown] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const toolsItems: DropdownItem[] = [
    { href: '/tools/scanner', label: 'Market Scanner', icon: '📊' },
    { href: '/tools/watchlists', label: 'Watchlists', icon: '📋' },
    { href: '/tools/portfolio', label: 'Portfolio Tracker', icon: '💼' },
    { href: '/tools/backtest', label: 'Backtester', icon: '📈' },
    { href: '/tools/journal', label: 'Trade Journal', icon: '📓' },
    { href: '/tools/alerts', label: 'Price Alerts', icon: '🔔' },
  ];

  const aiItems: DropdownItem[] = [
    { href: '/tools/ai-analyst', label: 'MSP Analyst', icon: '🤖' },
    { href: '/tools/deep-analysis', label: 'Golden Egg Analysis', icon: '🥚' },
    { href: '/tools/confluence-scanner', label: 'Confluence Scanner', icon: '🔮' },
    { href: '/tools/options-confluence', label: 'Options Scanner', icon: '🎯' },
    { href: '/tools/ai-tools', label: 'AI Tools', icon: '✨' },
  ];

  const marketItems: DropdownItem[] = [
    { href: '/tools/market-movers', label: 'Market Movers', icon: '📈' },
    { href: '/tools/crypto-explorer', label: 'Crypto Explorer', icon: '🔍' },
    { href: '/tools/equity-explorer', label: 'Equity Explorer', icon: '📈' },
    { href: '/tools/intraday-charts', label: 'Intraday Charts', icon: '📈' },
    { href: '/tools/crypto-heatmap', label: 'Crypto Heatmap', icon: '🪙' },
    { href: '/tools/crypto-dashboard', label: 'Crypto Derivatives', icon: '₿' },
    { href: '/tools/commodities', label: 'Commodities', icon: '🛢️' },
    { href: '/tools/macro', label: 'Macro Dashboard', icon: '🏛️' },
  ];

  const calendarItems: DropdownItem[] = [
    { href: '/tools/earnings', label: 'Earnings Calendar', icon: '📅' },
    { href: '/tools/economic-calendar', label: 'Economic Calendar', icon: '📊' },
    { href: '/tools/news', label: 'Market News', icon: '📰' },
  ];

  const resourceItems: DropdownItem[] = [
    { href: '/guide', label: 'Trading Guides', icon: '📚' },
    { href: '/blog', label: 'Blog', icon: '✍️' },
    { href: '/partners', label: 'Partners', icon: '🤝' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-black/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-xl font-semibold tracking-tight text-emerald-300 flex-shrink-0 mr-6">
          <img src="/logos/msp-logo.png" alt="MarketScannerPros" className="h-8 w-8 object-contain" />
          <span>MarketScannerPros</span>
        </Link>

        {/* Desktop Navigation with Dropdowns */}
        <nav className="flex items-center gap-5 text-sm text-emerald-300/90 max-md:hidden">
          <Dropdown label="Tools" items={toolsItems} />
          <Dropdown label="AI" items={aiItems} />
          <Dropdown label="Markets" items={marketItems} />
          <Dropdown label="Calendar" items={calendarItems} />
          <Dropdown label="Resources" items={resourceItems} />
          <Link href="/pricing" className="hover:text-emerald-300 whitespace-nowrap">Pricing</Link>
          <Link href="/dashboard" className="hover:text-emerald-300 whitespace-nowrap">Dashboard</Link>
          <Link href="/account" className="hover:text-emerald-300 whitespace-nowrap">Account</Link>
          <Link href="/auth" className="ml-2 px-4 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 rounded-lg text-emerald-300 font-medium whitespace-nowrap transition-all">Sign In</Link>
        </nav>

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex flex-col gap-1.5 p-2 flex-shrink-0 md:hidden"
          aria-label="Toggle menu"
        >
          <span className={`block h-0.5 w-6 bg-emerald-300 transition-all duration-300 ${isOpen ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`block h-0.5 w-6 bg-emerald-300 transition-all duration-300 ${isOpen ? 'opacity-0' : ''}`} />
          <span className={`block h-0.5 w-6 bg-emerald-300 transition-all duration-300 ${isOpen ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm" onClick={() => setIsOpen(false)} />
      )}

      {/* Mobile Menu Drawer */}
      <div className={`fixed top-0 right-0 h-[100dvh] w-80 bg-[#0F172A] z-50 transform transition-transform duration-300 ease-in-out md:hidden border-l border-emerald-300/20 shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex flex-col h-full min-h-0 overscroll-contain">
          <div className="flex items-center justify-between p-5 border-b border-emerald-300/20 flex-shrink-0">
            <span className="text-lg font-semibold text-emerald-300">Menu</span>
            <button onClick={() => setIsOpen(false)} className="text-2xl text-emerald-300 hover:text-emerald-400 transition-colors p-1">✕</button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            <div className="flex flex-col gap-1">
              <MobileAccordion label="🛠️ Tools" items={toolsItems} isOpen={mobileDropdown === 'tools'} onToggle={() => setMobileDropdown(mobileDropdown === 'tools' ? null : 'tools')} onLinkClick={() => setIsOpen(false)} />
              <MobileAccordion label="🤖 AI Features" items={aiItems} isOpen={mobileDropdown === 'ai'} onToggle={() => setMobileDropdown(mobileDropdown === 'ai' ? null : 'ai')} onLinkClick={() => setIsOpen(false)} />
              <MobileAccordion label="📈 Markets" items={marketItems} isOpen={mobileDropdown === 'markets'} onToggle={() => setMobileDropdown(mobileDropdown === 'markets' ? null : 'markets')} onLinkClick={() => setIsOpen(false)} />
              <MobileAccordion label="� Calendar & News" items={calendarItems} isOpen={mobileDropdown === 'calendar'} onToggle={() => setMobileDropdown(mobileDropdown === 'calendar' ? null : 'calendar')} onLinkClick={() => setIsOpen(false)} />
              <MobileAccordion label="�📚 Resources" items={resourceItems} isOpen={mobileDropdown === 'resources'} onToggle={() => setMobileDropdown(mobileDropdown === 'resources' ? null : 'resources')} onLinkClick={() => setIsOpen(false)} />

              <div className="mt-3 pt-3 border-t border-slate-700">
                <Link href="/pricing" className="flex items-center gap-3 px-4 py-3 text-white hover:bg-emerald-500/10 hover:text-emerald-300 rounded-lg transition-all" onClick={() => setIsOpen(false)}>💰 Pricing</Link>
                <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 text-white hover:bg-emerald-500/10 hover:text-emerald-300 rounded-lg transition-all" onClick={() => setIsOpen(false)}>📊 Dashboard</Link>
                <Link href="/account" className="flex items-center gap-3 px-4 py-3 text-white hover:bg-emerald-500/10 hover:text-emerald-300 rounded-lg transition-all" onClick={() => setIsOpen(false)}>👤 Account</Link>
              </div>
              
              <div className="mt-4 pt-4 border-t border-emerald-300/20">
                <Link href="/auth" className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 rounded-lg text-emerald-300 font-medium transition-all" onClick={() => setIsOpen(false)}>🔐 Sign In</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
