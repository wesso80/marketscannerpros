import React from 'react';

interface PageHeroProps {
  badge: string;
  icon: string;
  title: string;
  subtitle: string;
}

export default function PageHero({ badge, icon, title, subtitle }: PageHeroProps) {
  return (
    <div style={{
      marginBottom: '2rem',
      textAlign: 'center',
    }}>
      {/* Badge */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1rem',
        marginBottom: '1rem',
        background: 'rgba(16, 185, 129, 0.1)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '600',
        color: '#10B981',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}>
        {badge}
      </div>

      {/* Title with Icon */}
      <h1 style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        fontSize: '2.5rem',
        fontWeight: '700',
        marginBottom: '0.75rem',
        background: 'linear-gradient(to right, #10B981, #3B82F6)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}>
        <span style={{ fontSize: '2rem' }}>{icon}</span>
        {title}
      </h1>

      {/* Subtitle */}
      <p style={{
        fontSize: '1.125rem',
        color: '#94A3B8',
        maxWidth: '600px',
        margin: '0 auto',
        lineHeight: '1.6',
      }}>
        {subtitle}
      </p>
    </div>
  );
}
