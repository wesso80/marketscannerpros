import Link from "next/link";
import { blogPosts } from "./posts-data";

export const metadata = {
  title: "Trading Insights & Education | MarketScanner Pros",
  description: "Learn about market scanning, technical analysis, and trading strategies. Free educational content for crypto and stock traders.",
};

export default function BlogPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl md:text-4xl font-bold mb-3">Trading Insights</h1>
      <p className="text-neutral-400 mb-10">
        Free educational content to help you understand market scanning, technical analysis, and trading strategies.
      </p>

      <div className="space-y-6">
        {blogPosts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="block rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 transition hover:border-neutral-700 hover:bg-neutral-900"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-emerald-400 font-medium">{post.category}</span>
              <span className="text-xs text-neutral-500">•</span>
              <span className="text-xs text-neutral-500">{post.readTime}</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold mb-2">{post.title}</h2>
            <p className="text-neutral-400 text-sm md:text-base">{post.excerpt}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
