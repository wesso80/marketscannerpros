'use client';

import Link from "next/link";
import { blogPosts } from "./posts-data";

export default function BlogPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at top, #111827 0, #020617 55%, #000 100%)',
      color: '#f9fafb',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif'
    }}>
      <div style={{ maxWidth: 900, padding: '48px 20px 60px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: '#9ca3af',
            padding: '4px 10px',
            borderRadius: 999,
            background: 'rgba(15,23,42,0.9)',
            border: '1px solid rgba(148,163,184,0.25)',
            marginBottom: 16
          }}>
            <span style={{ color: '#bbf7d0' }}>Free content</span>
            <span>Learn to trade smarter</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 12 }}>Trading Insights</h1>
          <p style={{ fontSize: 16, color: '#9ca3af', maxWidth: 500, margin: '0 auto' }}>
            Free educational content to help you understand market scanning, technical analysis, and trading strategies.
          </p>
        </div>

        {/* Blog Posts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {blogPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              style={{
                display: 'block',
                background: 'radial-gradient(circle at top left, #111827, #020617 60%)',
                borderRadius: 16,
                border: '1px solid #1f2933',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                padding: '24px 28px',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'border-color 0.2s, transform 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{
                  fontSize: 11,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'rgba(34,197,94,0.12)',
                  color: '#bbf7d0',
                  border: '1px solid rgba(34,197,94,0.3)'
                }}>{post.category}</span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{post.readTime}</span>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 650, marginBottom: 8, color: '#f9fafb' }}>{post.title}</h2>
              <p style={{ fontSize: 15, color: '#9ca3af', lineHeight: 1.6, margin: 0 }}>{post.excerpt}</p>
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#14b8a6' }}>
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
