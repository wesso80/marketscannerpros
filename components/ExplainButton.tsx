// =====================================================
// EXPLAIN BUTTON - Inline metric explanations
// Use: <ExplainButton metricName="RSI" value={65} />
// =====================================================

'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { PageSkill, ExplainResponse } from '@/lib/ai/types';

interface ExplainButtonProps {
  metricName: string;
  metricId?: string;
  metricValue?: unknown;
  skill?: PageSkill;
  context?: Record<string, unknown>;
  size?: 'sm' | 'md';
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export default function ExplainButton({
  metricName,
  metricId,
  metricValue,
  skill = 'scanner',
  context = {},
  size = 'sm',
  position = 'top',
}: ExplainButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [explanation, setExplanation] = useState<ExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tooltipRef.current && 
        !tooltipRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const fetchExplanation = async () => {
    if (explanation) {
      setIsOpen(true);
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsOpen(true);

    try {
      const response = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metricId,
          metricName,
          metricValue,
          context,
          skill,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get explanation');
      }

      setExplanation(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load explanation');
    } finally {
      setIsLoading(false);
    }
  };

  const getTooltipPosition = () => {
    switch (position) {
      case 'top':
        return { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '8px' };
      case 'bottom':
        return { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '8px' };
      case 'left':
        return { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '8px' };
      case 'right':
        return { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '8px' };
    }
  };

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        ref={buttonRef}
        onClick={fetchExplanation}
        title={`Explain ${metricName}`}
        style={{
          background: 'rgba(59, 130, 246, 0.15)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: size === 'sm' ? '4px' : '6px',
          padding: size === 'sm' ? '2px 4px' : '4px 8px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
          fontSize: size === 'sm' ? '0.65rem' : '0.75rem',
          color: '#3B82F6',
          transition: 'all 0.2s',
          marginLeft: '4px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
        }}
      >
        <span>?</span>
      </button>

      {isOpen && (
        <div
          ref={tooltipRef}
          style={{
            position: 'absolute',
            ...getTooltipPosition(),
            zIndex: 1000,
            width: '280px',
            maxWidth: '90vw',
            background: 'linear-gradient(145deg, #1E293B, #0F172A)',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            borderRadius: '12px',
            padding: '1rem',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
          }}
        >
          {/* Header */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'flex-start',
            marginBottom: '0.75rem',
          }}>
            <div style={{ fontWeight: '600', color: '#3B82F6', fontSize: '0.9rem' }}>
              💡 {metricName}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748B',
                cursor: 'pointer',
                fontSize: '1rem',
                padding: '0',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Content */}
          {isLoading && (
            <div style={{ color: '#94A3B8', fontSize: '0.85rem' }}>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
              {' '}Loading explanation...
            </div>
          )}

          {error && (
            <div style={{ color: '#EF4444', fontSize: '0.85rem' }}>
              ❌ {error}
            </div>
          )}

          {explanation && !isLoading && (
            <div style={{ fontSize: '0.85rem' }}>
              {/* Main explanation */}
              <div style={{ color: '#E2E8F0', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                {explanation.explanation}
              </div>

              {/* Why it matters */}
              <div style={{ 
                background: 'rgba(245, 158, 11, 0.1)', 
                borderRadius: '8px', 
                padding: '0.5rem 0.75rem',
                marginBottom: '0.5rem',
              }}>
                <div style={{ fontSize: '0.7rem', color: '#F59E0B', fontWeight: '600', marginBottom: '2px' }}>
                  WHY IT MATTERS
                </div>
                <div style={{ color: '#CBD5E1', fontSize: '0.8rem' }}>
                  {explanation.whyItMatters}
                </div>
              </div>

              {/* Actionable insight */}
              {explanation.actionableInsight && (
                <div style={{ 
                  background: 'rgba(16, 185, 129, 0.1)', 
                  borderRadius: '8px', 
                  padding: '0.5rem 0.75rem',
                }}>
                  <div style={{ fontSize: '0.7rem', color: '#10B981', fontWeight: '600', marginBottom: '2px' }}>
                    💡 INSIGHT
                  </div>
                  <div style={{ color: '#CBD5E1', fontSize: '0.8rem' }}>
                    {explanation.actionableInsight}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div style={{ 
                marginTop: '0.75rem', 
                fontSize: '0.65rem', 
                color: '#64748B',
                textAlign: 'center',
              }}>
                Educational purposes only
              </div>
            </div>
          )}

          {/* Arrow */}
          <div
            style={{
              position: 'absolute',
              width: '12px',
              height: '12px',
              background: '#1E293B',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              borderRight: 'none',
              borderBottom: 'none',
              ...(position === 'top' ? {
                bottom: '-7px',
                left: '50%',
                transform: 'translateX(-50%) rotate(-135deg)',
              } : position === 'bottom' ? {
                top: '-7px',
                left: '50%',
                transform: 'translateX(-50%) rotate(45deg)',
              } : position === 'left' ? {
                right: '-7px',
                top: '50%',
                transform: 'translateY(-50%) rotate(135deg)',
              } : {
                left: '-7px',
                top: '50%',
                transform: 'translateY(-50%) rotate(-45deg)',
              }),
            }}
          />
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </span>
  );
}
