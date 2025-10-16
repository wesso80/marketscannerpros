import { notFound } from "next/navigation";
import { getPostBySlug, blogPosts } from "../posts-data";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

export async function generateStaticParams() {
  return blogPosts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug);
  
  if (!post) {
    return {
      title: "Post Not Found",
    };
  }

  return {
    title: `${post.title} | MarketScanner Pros`,
    description: post.excerpt,
  };
}

export default function BlogPost({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug);

  if (!post) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link 
        href="/blog" 
        className="inline-flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300 mb-6"
      >
        ← Back to Insights
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-emerald-400 font-medium">{post.category}</span>
          <span className="text-xs text-neutral-500">•</span>
          <span className="text-xs text-neutral-500">{post.readTime}</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-4">{post.title}</h1>
        <p className="text-lg text-neutral-400">{post.excerpt}</p>
      </div>

      <article className="prose prose-invert prose-emerald max-w-none">
        <ReactMarkdown
          components={{
            h1: ({ children }) => <h1 className="text-3xl font-bold mt-8 mb-4">{children}</h1>,
            h2: ({ children }) => <h2 className="text-2xl font-bold mt-8 mb-3">{children}</h2>,
            h3: ({ children }) => <h3 className="text-xl font-semibold mt-6 mb-3">{children}</h3>,
            p: ({ children }) => <p className="text-neutral-300 leading-relaxed mb-4">{children}</p>,
            ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-2">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-2">{children}</ol>,
            li: ({ children }) => <li className="text-neutral-300">{children}</li>,
            a: ({ href, children }) => (
              <a href={href} className="text-emerald-400 hover:text-emerald-300 underline">
                {children}
              </a>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-emerald-500 pl-4 italic text-neutral-400 my-4">
                {children}
              </blockquote>
            ),
            code: ({ children }) => (
              <code className="bg-neutral-800 px-1.5 py-0.5 rounded text-sm text-emerald-400">
                {children}
              </code>
            ),
            hr: () => <hr className="border-neutral-800 my-8" />,
            table: ({ children }) => (
              <div className="overflow-x-auto my-6">
                <table className="min-w-full border border-neutral-800">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-neutral-900">{children}</thead>,
            th: ({ children }) => (
              <th className="border border-neutral-800 px-4 py-2 text-left font-semibold">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border border-neutral-800 px-4 py-2 text-neutral-300">{children}</td>
            ),
          }}
        >
          {post.content}
        </ReactMarkdown>
      </article>

      <div className="mt-12 p-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
        <h3 className="text-xl font-bold mb-2">Ready to Find Your Edge?</h3>
        <p className="text-neutral-300 mb-4">
          Stop manually checking charts. MarketScanner automates multi-timeframe confluence, squeeze detection, and risk management.
        </p>
        <Link
          href="/"
          className="inline-block rounded-xl bg-emerald-500 px-6 py-3 font-medium text-neutral-900 hover:bg-emerald-400"
        >
          Try MarketScanner Free
        </Link>
      </div>

      <div className="mt-8 text-center">
        <Link 
          href="/blog" 
          className="text-sm text-neutral-400 hover:text-neutral-300"
        >
          ← Back to all insights
        </Link>
      </div>
    </div>
  );
}
