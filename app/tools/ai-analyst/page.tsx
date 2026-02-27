"use client";

import React, { Suspense, useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import ToolsPageHeader from "@/components/ToolsPageHeader";
import { useAnalystContext, type AnalystTab } from "@/lib/ai/useAnalystContext";
import { useUserTier } from "@/lib/useUserTier";
import UpgradeGate from "@/components/UpgradeGate";

// ─── Tab Config ─────────────────────────────────────

const TAB_CONFIG: { key: AnalystTab; label: string; icon: string; description: string }[] = [
  { key: "explain", label: "Explain", icon: "\uD83D\uDD0D", description: "What the platform sees right now" },
  { key: "plan", label: "Plan", icon: "\uD83D\uDCCB", description: "Scenario planning based on regime" },
  { key: "act", label: "Act", icon: "\u26A1", description: "Execution checklist gated by authorization" },
  { key: "learn", label: "Learn", icon: "\uD83D\uDCDA", description: "Historical context & insights" },
];

// ─── Status Badge Component ─────────────────────────

function AuthorizationBadge({ authorization }: { authorization: string }) {
  const config = {
    AUTHORIZED: { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30", label: "AUTHORIZED", icon: "\u2705" },
    CONDITIONAL: { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/30", label: "CONDITIONAL", icon: "\u26A0\uFE0F" },
    BLOCKED: { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30", label: "BLOCKED", icon: "\u26D4" },
  }[authorization] ?? { bg: "bg-slate-500/20", text: "text-slate-400", border: "border-slate-500/30", label: authorization, icon: "" };

  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider border ${config.bg} ${config.text} ${config.border}`}>
      {config.icon} {config.label}
    </span>
  );
}

function DataQualityBadge({ quality }: { quality: string }) {
  const config = {
    complete: { text: "text-emerald-400", label: "Data Complete" },
    partial: { text: "text-amber-400", label: "Partial Data" },
    stale: { text: "text-orange-400", label: "Stale Data" },
    unavailable: { text: "text-red-400", label: "No Data" },
  }[quality] ?? { text: "text-slate-400", label: quality };

  return <span className={`text-[11px] font-medium ${config.text}`}>{config.label}</span>;
}

// ─── Context Status Bar ─────────────────────────────

function ContextStatusBar({ context, isRefreshing }: { context: ReturnType<typeof useAnalystContext>["context"]; isRefreshing: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#1E293B] bg-[#0B1120] px-4 py-3 text-[12px] text-slate-400">
      {/* Ticker */}
      <div className="flex items-center gap-1.5">
        <span className="text-slate-500">Ticker:</span>
        <span className="font-semibold text-white">{context.ticker || "\u2014"}</span>
      </div>

      <span className="text-slate-700">|</span>

      {/* Regime */}
      <div className="flex items-center gap-1.5">
        <span className="text-slate-500">Regime:</span>
        <span className="font-medium text-slate-200">{context.regimeLabel}</span>
      </div>

      <span className="text-slate-700">|</span>

      {/* Session Phase */}
      <div className="flex items-center gap-1.5">
        <span className="text-slate-500">Session:</span>
        <span className="font-medium text-slate-200">{context.sessionPhaseLabel}</span>
      </div>

      <span className="text-slate-700">|</span>

      {/* Authorization */}
      <AuthorizationBadge authorization={context.authorization} />

      <span className="text-slate-700">|</span>

      {/* Data Quality */}
      <DataQualityBadge quality={context.dataQuality} />

      {/* Throttle */}
      {context.authorization !== "BLOCKED" && (
        <>
          <span className="text-slate-700">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">RU:</span>
            <span className="font-mono text-slate-200">{Math.round(context.ruThrottle * 100)}%</span>
          </div>
        </>
      )}

      {/* Refresh indicator */}
      {isRefreshing && (
        <>
          <span className="text-slate-700">|</span>
          <span className="animate-pulse text-emerald-400">{"\u25CF"} Refreshing\u2026</span>
        </>
      )}
    </div>
  );
}

// ─── Blocked State ──────────────────────────────────

function BlockedPanel({ reason }: { reason: string | null }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{"\u26D4"}</span>
        <div>
          <h3 className="text-base font-bold text-red-400">Analysis Blocked</h3>
          <p className="mt-1 text-sm text-red-300/80">{reason || "Authorization denied for current state."}</p>
          <div className="mt-4 rounded border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-slate-300">
            <p className="font-medium text-red-300 mb-2">What this means:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>No trade plan will be generated in this state</li>
              <li>The risk governor or your subscription tier has restricted access</li>
              <li>Monitor for regime change or upgrade your plan</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Stale/Missing Data State ───────────────────────

function StaleDataPanel({ quality, missingFields }: { quality: string; missingFields: string[] }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <span className="text-xl">{"\u26A0\uFE0F"}</span>
        <div>
          <h4 className="text-sm font-semibold text-amber-400">
            {quality === "unavailable" ? "Context Not Available" : "Limited Data Available"}
          </h4>
          <p className="mt-1 text-xs text-amber-300/70">
            {quality === "unavailable"
              ? "Navigate to a tool page (Scanner, Options, etc.) to provide context for analysis."
              : "Some context is missing. Analysis may be less precise."}
          </p>
          {missingFields.length > 0 && (
            <p className="mt-2 text-xs text-slate-400">
              Missing: {missingFields.join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab Content Panel ──────────────────────────────

function TabContentPanel({ tab }: { tab: ReturnType<typeof useAnalystContext>["tabs"][AnalystTab] }) {
  if (tab.loading) {
    return (
      <div className="flex items-center gap-3 p-8">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
        <span className="text-sm text-slate-400">Generating contextual analysis\u2026</span>
      </div>
    );
  }

  if (tab.error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
        <p className="text-sm text-red-400">{"\u26A0"} {tab.error}</p>
      </div>
    );
  }

  if (!tab.content) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        Waiting for context\u2026 Navigate to a tool page to generate analysis.
      </div>
    );
  }

  return (
    <div className="prose prose-invert max-w-none text-sm leading-relaxed
      prose-headings:text-slate-200 prose-headings:font-semibold prose-headings:text-[14px]
      prose-p:text-slate-300 prose-p:mb-2
      prose-li:text-slate-300 prose-li:my-0.5
      prose-strong:text-emerald-400
      prose-code:text-cyan-300 prose-code:bg-[#1a2235] prose-code:px-1 prose-code:rounded
      prose-a:text-emerald-400 prose-a:no-underline hover:prose-a:underline">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{tab.content}</ReactMarkdown>
      {tab.generatedAt && (
        <p className="mt-4 text-[10px] text-slate-600">
          Generated {new Date(tab.generatedAt).toLocaleTimeString()}
          {tab.contextFingerprint ? ` \u00B7 fp:${tab.contextFingerprint.slice(0, 12)}` : ""}
        </p>
      )}
    </div>
  );
}

// ─── Main Analyst Component ─────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

function ChatSection({ context }: { context: ReturnType<typeof useAnalystContext>["context"] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          pageContext: { name: 'analyst', symbols: context.ticker ? [context.ticker] : [], timeframes: [context.timeframe || '1D'] },
          pageData: {
            symbol: context.ticker,
            currentPrice: context.currentPrice,
            direction: context.regime,
            regime: context.regimeLabel,
            sessionPhase: context.sessionPhaseLabel,
            authorization: context.authorization,
            dataQuality: context.dataQuality,
          },
          conversationHistory: messages.slice(-10),
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Request failed');

      setMessages(prev => [...prev, {
        id: data.responseId || crypto.randomUUID(),
        role: 'assistant',
        content: data.content,
        timestamp: new Date().toISOString(),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, context]);

  return (
    <div className="rounded-lg border border-[#1E293B] bg-[#0F172A] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[#1E293B] bg-[#0B1120] px-4 py-3">
        <span className="text-sm">{"\uD83D\uDCAC"}</span>
        <h3 className="text-sm font-semibold text-slate-200">Ask the Analyst</h3>
        <span className="text-[11px] text-slate-500">— freeform questions about your current context</span>
      </div>

      {/* Messages */}
      {messages.length > 0 && (
        <div className="max-h-[400px] overflow-y-auto p-4 space-y-3">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-emerald-500/15 border border-emerald-500/20 text-emerald-100'
                  : 'bg-[#1a2235] border border-[#1E293B] text-slate-300'
              }`}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-invert prose-sm max-w-none prose-p:mb-1.5 prose-li:my-0.5 prose-strong:text-emerald-400 prose-code:text-cyan-300 prose-code:bg-[#0B1120] prose-code:px-1 prose-code:rounded">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-[#1a2235] border border-[#1E293B] px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                  Thinking...
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-[#1E293B] p-3">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Ask about this ticker, regime, strategy, risk..."
          className="flex-1 rounded-md border border-[#1E293B] bg-[#0B1120] px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/20 transition-colors"
          disabled={isLoading}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
          className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-4 py-2.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function MspAnalystIntelligence() {
  const { tier, isLoading: tierLoading } = useUserTier();
  const analyst = useAnalystContext();
  const { context, tabs, activeTab, setActiveTab, isRefreshing, lastRefresh, refreshNow, isBlocked, blockedReason } = analyst;

  if (tierLoading) return <div className="min-h-screen bg-[var(--msp-bg)]" />;
  if (!tier || tier === "free" || tier === "anonymous") return <UpgradeGate requiredTier="pro" feature="MSP AI Analyst" />;

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-4">
      <ToolsPageHeader
        badge="Intelligence"
        title="MSP Analyst"
        subtitle="Contextual intelligence layer \u2014 auto-reads platform state"
        icon="\uD83E\uDDE0"
      />

      {/* Context status bar */}
      <ContextStatusBar context={context} isRefreshing={isRefreshing} />

      {/* Missing data / stale warning */}
      {(context.dataQuality === "stale" || context.dataQuality === "unavailable") && !isBlocked && (
        <StaleDataPanel quality={context.dataQuality} missingFields={context.missingDataFields} />
      )}

      {/* Blocked state */}
      {isBlocked ? (
        <BlockedPanel reason={blockedReason} />
      ) : (
        <>
          {/* Tab selector */}
          <div className="flex gap-1 rounded-lg border border-[#1E293B] bg-[#0B1120] p-1">
            {TAB_CONFIG.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex-1 rounded-md px-3 py-2.5 text-sm font-medium transition-all
                  ${activeTab === key
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                  }`}
              >
                <span className="mr-1.5">{icon}</span>
                {label}
                {tabs[key].loading && <span className="ml-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />}
              </button>
            ))}
          </div>

          {/* Tab description */}
          <p className="text-xs text-slate-500 px-1">
            {TAB_CONFIG.find(t => t.key === activeTab)?.description}
          </p>

          {/* Tab content */}
          <div className="rounded-lg border border-[#1E293B] bg-[#0F172A] p-5 min-h-[200px]">
            <TabContentPanel tab={tabs[activeTab]} />
          </div>

          {/* Ask the Analyst — freeform chat */}
          <ChatSection context={context} />
        </>
      )}

      {/* Action links — only when we have a ticker and are authorized */}
      {context.ticker && !isBlocked && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/tools/scanner?symbol=${encodeURIComponent(context.ticker)}`}
            className="rounded-md border border-[#1E293B] bg-[#0B1120] px-3 py-2 text-xs text-slate-300 hover:border-emerald-500/30 hover:text-emerald-400 transition-colors no-underline"
          >
            {"\uD83D\uDCCA"} Scanner
          </Link>
          <Link
            href={`/tools/backtest?symbol=${encodeURIComponent(context.ticker)}`}
            className="rounded-md border border-[#1E293B] bg-[#0B1120] px-3 py-2 text-xs text-slate-300 hover:border-emerald-500/30 hover:text-emerald-400 transition-colors no-underline"
          >
            {"\uD83D\uDCC8"} Backtest
          </Link>
          <Link
            href={`/tools/alerts?symbol=${encodeURIComponent(context.ticker)}`}
            className="rounded-md border border-[#1E293B] bg-[#0B1120] px-3 py-2 text-xs text-slate-300 hover:border-emerald-500/30 hover:text-emerald-400 transition-colors no-underline"
          >
            {"\uD83D\uDD14"} Alerts
          </Link>
          <Link
            href="/tools/journal"
            className="rounded-md border border-[#1E293B] bg-[#0B1120] px-3 py-2 text-xs text-slate-300 hover:border-emerald-500/30 hover:text-emerald-400 transition-colors no-underline"
          >
            {"\uD83D\uDCD3"} Journal
          </Link>
        </div>
      )}

      {/* Refresh info */}
      <div className="flex items-center justify-between text-[11px] text-slate-600 px-1">
        <span>
          {lastRefresh
            ? `Last refresh: ${new Date(lastRefresh).toLocaleTimeString()}`
            : "Auto-refreshes on context change"}
        </span>
        <button
          onClick={refreshNow}
          disabled={isRefreshing || isBlocked}
          className="text-slate-500 hover:text-emerald-400 disabled:opacity-30 transition-colors"
        >
          {"\u21BB"} Force refresh
        </button>
      </div>
    </div>
  );
}

// ─── Page Export ─────────────────────────────────────

export default function AiAnalystPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-slate-500">Loading analyst\u2026</div>}>
      <MspAnalystIntelligence />
    </Suspense>
  );
}
