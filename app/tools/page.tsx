"use client";
import { useState } from "react";
import Link from "next/link";
import { TOOL_CATALOG, TOOL_CATEGORIES } from "@/lib/toolCatalog";
import StatTile from "@/components/visual/StatTile";

export default function AllToolsPage() {
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase();
  const matches = TOOL_CATALOG.filter((tool) =>
    `${tool.label} ${tool.description} ${tool.category} ${(tool.aliases ?? []).join(" ")}`
      .toLocaleLowerCase()
      .includes(search),
  );
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6 text-[var(--msp-text)]">
      <h1 className="text-2xl font-semibold">All tools</h1>
      <label className="block text-sm">
        Find a tool
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tools and guides"
          className="mt-2 block min-h-10 w-full rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel)] px-3"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Pages and tools" value={TOOL_CATALOG.length} />
        <StatTile label="Groups" value={TOOL_CATEGORIES.length} />
      </div>
      <p className="text-sm text-[var(--msp-text-muted)]">
        Free labels include limited summaries where available. Pro features keep
        their access gates.
      </p>
      <p role="status" className="text-sm">
        {search ? `${matches.length} matches` : "Choose a group to explore."}
      </p>
      <div className="grid items-start gap-3 md:grid-cols-2">
        {TOOL_CATEGORIES.map((category) => {
          const items = matches.filter((tool) => tool.category === category);
          if (!items.length) return null;
          return (
            <details
              key={`${category}-${search ? "search" : "browse"}`}
              open={search ? true : category === "Today" ? true : undefined}
              className="min-w-0 rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel)]"
            >
              <summary className="min-h-10 cursor-pointer px-3 py-3 font-medium">
                {category}{" "}
                <span className="text-xs text-[var(--msp-text-muted)]">
                  ({items.length})
                </span>
              </summary>
              <ul className="divide-y divide-[var(--msp-border)] px-3 pb-2">
                {items.map((tool) => (
                  <li key={tool.href}>
                    <Link
                      href={tool.href}
                      className={`flex min-h-10 items-center gap-2 py-2 text-sm ${tool.comingSoon ? "text-[var(--msp-text-muted)]" : "hover:text-[var(--msp-accent)]"}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={tool.comingSoon ? "font-medium text-[var(--msp-text-muted)]" : "font-medium"}>
                          {tool.label}
                        </span>
                        <span className="ml-2 text-xs text-[var(--msp-text-muted)]">
                          {tool.description}
                        </span>
                      </span>
                      {tool.comingSoon ? (
                        <span className="shrink-0 text-xs text-[var(--msp-text-muted)]">
                          Coming soon
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full border border-[var(--msp-border)] px-2 py-1 text-xs">
                          {tool.tier === "pro" ? "Pro" : "Free"}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
      {search && matches.length === 0 && (
        <button
          type="button"
          className="min-h-10 underline"
          onClick={() => setQuery("")}
        >
          Clear search
        </button>
      )}
    </main>
  );
}
