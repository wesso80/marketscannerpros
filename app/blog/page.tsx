import Link from "next/link";
import { blogPosts } from "./posts-data";

export const metadata = {
  title: "Trading Insights — MarketScanner Pros",
  alternates: { canonical: "/blog" },
};

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-[var(--msp-bg)] text-slate-50">
      <div className="mx-auto max-w-[900px] px-5 py-12 pb-16">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-slate-700/40 bg-slate-950/90 px-2.5 py-1 text-[11px] text-slate-400">
            <span className="text-emerald-300">Free content</span>
            <span>Learn to trade smarter</span>
          </div>
          <h1 className="mb-3 text-4xl font-bold text-white">Trading Insights</h1>
          <p className="mx-auto max-w-[500px] text-base text-slate-400">
            Free educational content to help you understand market scanning, technical analysis, and trading strategies.
          </p>
        </div>

        {/* Blog Posts */}
        <div className="flex flex-col gap-5">
          {blogPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="block rounded-2xl border border-[var(--msp-border)] bg-[var(--msp-card)] p-6 shadow-lg transition hover:border-emerald-500/30"
            >
              <div className="mb-2.5 flex items-center gap-2.5">
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] text-emerald-300">{post.category}</span>
                <span className="text-xs text-slate-500">{post.readTime}</span>
              </div>
              <h2 className="mb-2 text-[22px] font-semibold text-slate-50">{post.title}</h2>
              <p className="text-[15px] leading-relaxed text-slate-400">{post.excerpt}</p>
              <div className="mt-4 flex items-center gap-1.5 text-[13px] text-emerald-400">
                <span>Read article</span>
                <span>→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
