// =====================================================
// MSP AI COPILOT COMPONENT - Universal AI Panel
// Use: <MSPCopilot skill="derivatives" pageData={...} />
// =====================================================

'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { 
  PageSkill, 
  CopilotTab, 
  CopilotMessage, 
  AIToolCall,
  SuggestedAction,
  PendingAction,
} from '@/lib/ai/types';
import { SKILL_CONFIGS } from '@/lib/ai/types';

interface MSPCopilotProps {
  skill: PageSkill;
  pageData?: Record<string, unknown>;
  symbols?: string[];
  timeframes?: string[];
  onActionExecute?: (action: AIToolCall) => Promise<void>;
  defaultOpen?: boolean;
}

export default function MSPCopilot({
  skill,
  pageData = {},
  symbols = [],
  timeframes = [],
  onActionExecute,
  defaultOpen = false,
}: MSPCopilotProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [activeTab, setActiveTab] = useState<CopilotTab>('explain');
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, 'up' | 'down'>>({});
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const skillConfig = SKILL_CONFIGS[skill] || SKILL_CONFIGS.home;
  
  // Check if we have meaningful page data
  const hasPageData = useMemo(() => {
    return pageData && Object.keys(pageData).length > 0 && pageData.symbol;
  }, [pageData]);

  // Generate tab-specific content based on page data
  const getTabContent = useMemo(() => {
    if (!hasPageData) return null;
    
    try {
      const symbol = pageData.symbol as string || 'N/A';
      const price = pageData.currentPrice as number || pageData.price as number;
      const direction = pageData.direction as string;
      const quality = pageData.tradeQuality as string;
      const confluence = pageData.confluenceStack as number;
      const signalStrength = pageData.signalStrength as string;
      
      return {
        explain: {
          title: '📊 Scan Results Summary',
          content: [
            { label: 'Symbol', value: symbol, highlight: true },
            { label: 'Price', value: price && typeof price === 'number' ? `$${price.toFixed(2)}` : 'N/A' },
            { label: 'Direction', value: direction?.toUpperCase() || 'Neutral', color: direction === 'bullish' ? '#10B981' : direction === 'bearish' ? '#EF4444' : '#64748B' },
            { label: 'Quality', value: quality || 'N/A', color: quality === 'A+' || quality === 'A' ? '#10B981' : quality === 'B' ? '#F59E0B' : '#64748B' },
            { label: 'Confluence', value: confluence !== undefined ? `${confluence}/8` : 'N/A' },
            { label: 'Signal', value: signalStrength || 'N/A' },
          ],
          footer: 'Ask me to explain any specific metric or signal.',
        },
        plan: {
          title: '📋 Trade Plan',
          content: direction ? [
            { label: 'Bias', value: direction.toUpperCase(), color: direction === 'bullish' ? '#10B981' : '#EF4444' },
            { label: 'Entry', value: pageData.entryTiming ? (pageData.entryTiming as { idealEntryWindow?: string })?.idealEntryWindow || 'See timing' : 'Wait for confirmation' },
            { label: 'Strategy', value: pageData.strategyRecommendation ? (pageData.strategyRecommendation as { name?: string })?.name || 'Review options' : 'Ask for recommendation' },
            { label: 'Risk', value: pageData.tradeLevels && typeof (pageData.tradeLevels as { stopLoss?: number })?.stopLoss === 'number' ? `Stop: $${((pageData.tradeLevels as { stopLoss?: number }).stopLoss as number).toFixed(2)}` : 'Define your stop' },
          ] : [],
          footer: direction ? 'Ask me to build a complete trade plan.' : 'Run a scan first to get trade planning.',
        },
        act: {
          title: '⚡ Suggested Actions',
          actions: hasPageData ? [
            { icon: '🔔', label: `Create alert for ${symbol}`, action: 'create_alert' },
            { icon: '📝', label: 'Log to trade journal', action: 'journal_trade' },
            { icon: '⭐', label: 'Add to watchlist', action: 'add_to_watchlist' },
            { icon: '📊', label: 'Run backtest', action: 'run_backtest' },
          ] : [],
          footer: 'Click an action or ask me to help.',
        },
        learn: {
          title: '📚 Learn From This Scan',
          topics: [
            { icon: '💡', label: 'Why this signal matters', question: `Explain why ${direction || 'this'} signal on ${symbol} is significant` },
            { icon: '📈', label: 'What confluence means', question: 'Explain what confluence stack means and how to use it' },
            { icon: '⚠️', label: 'Risk considerations', question: `What are the risks of this ${symbol} trade?` },
            { icon: '🎯', label: 'Similar setups', question: `Show me examples of similar ${direction || 'trading'} setups` },
          ],
          footer: 'Click a topic to learn more.',
        },
      };
    } catch (e) {
      console.error('Error generating tab content:', e);
      return null;
    }
  }, [hasPageData, pageData]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Log copilot opened event
  useEffect(() => {
    if (isOpen) {
      logEvent('ai_opened', { skill, tab: activeTab });
    }
  }, [isOpen, skill, activeTab]);

  const logEvent = async (eventType: string, eventData: Record<string, unknown>) => {
    try {
      await fetch('/api/ai/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: [{
            eventType,
            eventData,
            pageContext: { name: skill, symbols, timeframes },
          }],
        }),
      });
    } catch (e) {
      console.error('Failed to log event:', e);
    }
  };

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: CopilotMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          pageContext: { name: skill, symbols, timeframes },
          pageData,
          conversationHistory: messages.slice(-10),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

      const assistantMessage: CopilotMessage = {
        id: data.responseId,
        role: 'assistant',
        content: data.content,
        toolCalls: data.toolCalls,
        sources: data.sources,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      // If there are suggested actions requiring confirmation
      if (data.suggestedActions?.length > 0) {
        const firstAction = data.suggestedActions[0];
        setPendingAction({
          tool: firstAction.tool,
          parameters: firstAction.parameters,
          description: firstAction.label,
          requiresConfirmation: true,
          idempotencyKey: firstAction.idempotencyKey || crypto.randomUUID(),
        });
      }

    } catch (error) {
      const errorMessage: CopilotMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: error instanceof Error ? error.message : 'Sorry, something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, pageData, skill, symbols, timeframes]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleFeedback = async (responseId: string, type: 'up' | 'down') => {
    if (feedbackGiven[responseId]) return;
    
    setFeedbackGiven(prev => ({ ...prev, [responseId]: type }));
    
    try {
      await fetch('/api/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responseId,
          feedbackType: type === 'up' ? 'thumbs_up' : 'thumbs_down',
        }),
      });
    } catch (e) {
      console.error('Failed to send feedback:', e);
    }
  };

  const executeAction = async (action: PendingAction) => {
    setPendingAction(null);
    
    if (onActionExecute) {
      await onActionExecute({
        tool: action.tool,
        parameters: action.parameters,
      });
    }

    // Log action execution
    await logEvent('ai_action_used', {
      tool: action.tool,
      parameters: action.parameters,
    });

    // Add confirmation message
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `✅ Action completed: ${action.description}`,
      timestamp: new Date().toISOString(),
    }]);
  };

  const getQuickPrompts = (): string[] => {
    switch (skill) {
      case 'derivatives':
        return [
          'What\'s driving OI changes?',
          'Is positioning crowded?',
          'Explain the funding rate',
        ];
      case 'scanner':
        return [
          'What makes this signal strong?',
          'Show me similar setups',
          'Create an alert for this',
        ];
      case 'options':
        return [
          'What strategy fits this IV?',
          'Calculate my max risk',
          'Explain the Greeks here',
        ];
      case 'journal':
        return [
          'Review my recent trades',
          'What mistakes am I repeating?',
          'Tag this trade automatically',
        ];
      case 'portfolio':
        return [
          'How concentrated am I?',
          'Calculate position size',
          'Show correlation risks',
        ];
      case 'deep_analysis':
        return [
          'Summarize the key signals',
          'What\'s the invalidation?',
          'Create a trade plan',
        ];
      default:
        return [
          'Explain this to me',
          'What should I watch?',
          'Help me understand',
        ];
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-all hover:scale-105"
        style={{
          background: 'linear-gradient(135deg, #10B981, #3B82F6)',
          color: 'white',
          fontWeight: '600',
          boxShadow: '0 4px 20px rgba(16, 185, 129, 0.4)',
        }}
      >
        <span style={{ fontSize: '1.25rem' }}>🤖</span>
        <span>MSP Analyst</span>
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-0 right-0 z-50 flex flex-col"
      style={{
        width: 'min(420px, 100vw)',
        height: 'min(600px, 80vh)',
        background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)',
        borderTopLeftRadius: '20px',
        borderLeft: '1px solid rgba(59, 130, 246, 0.3)',
        borderTop: '1px solid rgba(59, 130, 246, 0.3)',
        boxShadow: '-4px -4px 20px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '1rem',
          borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🤖</span>
          <div>
            <div style={{ fontWeight: '700', color: '#E2E8F0' }}>MSP Analyst</div>
            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{skillConfig.displayName}</div>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: 'rgba(51, 65, 85, 0.5)',
            border: 'none',
            borderRadius: '8px',
            padding: '0.5rem',
            cursor: 'pointer',
            color: '#94A3B8',
          }}
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
        }}
      >
        {(['explain', 'plan', 'act', 'learn'] as CopilotTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '0.75rem',
              background: activeTab === tab ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #3B82F6' : '2px solid transparent',
              color: activeTab === tab ? '#3B82F6' : '#64748B',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {tab === 'explain' && '💡'}
            {tab === 'plan' && '📋'}
            {tab === 'act' && '⚡'}
            {tab === 'learn' && '📚'}
            {' '}{tab}
          </button>
        ))}
      </div>

      {/* Messages Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {messages.length === 0 && (
          <div style={{ padding: '0.5rem 0' }}>
            {/* Show tab-specific content when we have page data */}
            {hasPageData && getTabContent ? (
              <div>
                {/* EXPLAIN TAB */}
                {activeTab === 'explain' && getTabContent.explain && (
                  <div style={{ background: 'rgba(30, 41, 59, 0.5)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                    <div style={{ fontWeight: '600', color: '#E2E8F0', marginBottom: '1rem', fontSize: '0.95rem' }}>
                      {getTabContent.explain.title}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      {getTabContent.explain.content.map((item, i) => (
                        <div key={i} style={{ 
                          background: item.highlight ? 'rgba(59, 130, 246, 0.15)' : 'rgba(51, 65, 85, 0.3)',
                          padding: '0.6rem 0.8rem',
                          borderRadius: '8px',
                          gridColumn: item.highlight ? '1 / -1' : undefined,
                        }}>
                          <div style={{ fontSize: '0.7rem', color: '#64748B', textTransform: 'uppercase' }}>{item.label}</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: '600', color: item.color || '#E2E8F0' }}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#64748B', fontStyle: 'italic' }}>
                      {getTabContent.explain.footer}
                    </div>
                  </div>
                )}

                {/* PLAN TAB */}
                {activeTab === 'plan' && getTabContent.plan && (
                  <div style={{ background: 'rgba(30, 41, 59, 0.5)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    <div style={{ fontWeight: '600', color: '#E2E8F0', marginBottom: '1rem', fontSize: '0.95rem' }}>
                      {getTabContent.plan.title}
                    </div>
                    {getTabContent.plan.content.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {getTabContent.plan.content.map((item, i) => (
                          <div key={i} style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            padding: '0.5rem 0.75rem',
                            background: 'rgba(51, 65, 85, 0.3)',
                            borderRadius: '6px',
                          }}>
                            <span style={{ color: '#94A3B8', fontSize: '0.85rem' }}>{item.label}</span>
                            <span style={{ color: item.color || '#E2E8F0', fontWeight: '600', fontSize: '0.85rem' }}>{item.value}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: '#64748B', fontSize: '0.85rem' }}>Run a scan to see trade planning.</div>
                    )}
                    <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#64748B', fontStyle: 'italic' }}>
                      {getTabContent.plan.footer}
                    </div>
                  </div>
                )}

                {/* ACT TAB */}
                {activeTab === 'act' && getTabContent.act && (
                  <div style={{ background: 'rgba(30, 41, 59, 0.5)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(249, 115, 22, 0.2)' }}>
                    <div style={{ fontWeight: '600', color: '#E2E8F0', marginBottom: '1rem', fontSize: '0.95rem' }}>
                      {getTabContent.act.title}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {getTabContent.act.actions.map((action, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setInput(`${action.label} for ${pageData.symbol}`);
                            setTimeout(() => sendMessage(), 100);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.75rem',
                            background: 'rgba(249, 115, 22, 0.1)',
                            border: '1px solid rgba(249, 115, 22, 0.3)',
                            borderRadius: '8px',
                            color: '#F97316',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.2s',
                          }}
                          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(249, 115, 22, 0.2)'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'rgba(249, 115, 22, 0.1)'}
                        >
                          <span style={{ fontSize: '1.1rem' }}>{action.icon}</span>
                          <span>{action.label}</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#64748B', fontStyle: 'italic' }}>
                      {getTabContent.act.footer}
                    </div>
                  </div>
                )}

                {/* LEARN TAB */}
                {activeTab === 'learn' && getTabContent.learn && (
                  <div style={{ background: 'rgba(30, 41, 59, 0.5)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                    <div style={{ fontWeight: '600', color: '#E2E8F0', marginBottom: '1rem', fontSize: '0.95rem' }}>
                      {getTabContent.learn.title}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {getTabContent.learn.topics.map((topic, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setInput(topic.question);
                            setTimeout(() => sendMessage(), 100);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.75rem',
                            background: 'rgba(168, 85, 247, 0.1)',
                            border: '1px solid rgba(168, 85, 247, 0.3)',
                            borderRadius: '8px',
                            color: '#A855F7',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.2s',
                          }}
                          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(168, 85, 247, 0.2)'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'rgba(168, 85, 247, 0.1)'}
                        >
                          <span style={{ fontSize: '1.1rem' }}>{topic.icon}</span>
                          <span>{topic.label}</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#64748B', fontStyle: 'italic' }}>
                      {getTabContent.learn.footer}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Default empty state when no page data */
              <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>👋</div>
                <div style={{ color: '#E2E8F0', fontWeight: '600', marginBottom: '0.5rem' }}>
                  How can I help?
                </div>
                <div style={{ color: '#64748B', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                  Ask me anything about this page, your trades, or market analysis.
                </div>
                
                {/* Quick prompts */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {getQuickPrompts().map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setInput(prompt);
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      style={{
                        padding: '0.75rem 1rem',
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '10px',
                        color: '#94A3B8',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s',
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                        e.currentTarget.style.color = '#E2E8F0';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                        e.currentTarget.style.color = '#94A3B8';
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '85%',
                padding: '0.75rem 1rem',
                borderRadius: msg.role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0',
                background: msg.role === 'user' 
                  ? 'linear-gradient(135deg, #3B82F6, #2563EB)'
                  : 'rgba(30, 41, 59, 0.8)',
                color: '#E2E8F0',
                fontSize: '0.9rem',
                lineHeight: '1.5',
                border: msg.role === 'user' ? 'none' : '1px solid rgba(51, 65, 85, 0.5)',
              }}
            >
              {msg.content}
              
              {/* Sources */}
              {msg.sources && msg.sources.length > 0 && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#64748B' }}>
                  📚 Sources: {msg.sources.join(', ')}
                </div>
              )}
            </div>

            {/* Feedback buttons for assistant messages */}
            {msg.role === 'assistant' && msg.id && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  onClick={() => handleFeedback(msg.id, 'up')}
                  disabled={!!feedbackGiven[msg.id]}
                  style={{
                    background: feedbackGiven[msg.id] === 'up' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(51, 65, 85, 0.5)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.25rem 0.5rem',
                    cursor: feedbackGiven[msg.id] ? 'default' : 'pointer',
                    fontSize: '0.75rem',
                    color: feedbackGiven[msg.id] === 'up' ? '#10B981' : '#64748B',
                  }}
                >
                  👍
                </button>
                <button
                  onClick={() => handleFeedback(msg.id, 'down')}
                  disabled={!!feedbackGiven[msg.id]}
                  style={{
                    background: feedbackGiven[msg.id] === 'down' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(51, 65, 85, 0.5)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.25rem 0.5rem',
                    cursor: feedbackGiven[msg.id] ? 'default' : 'pointer',
                    fontSize: '0.75rem',
                    color: feedbackGiven[msg.id] === 'down' ? '#EF4444' : '#64748B',
                  }}
                >
                  👎
                </button>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem' }}>
            <div style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              background: '#3B82F6',
              animation: 'pulse 1s ease-in-out infinite',
            }} />
            <div style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              background: '#3B82F6',
              animation: 'pulse 1s ease-in-out infinite 0.2s',
            }} />
            <div style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              background: '#3B82F6',
              animation: 'pulse 1s ease-in-out infinite 0.4s',
            }} />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Pending Action Confirmation */}
      {pendingAction && (
        <div
          style={{
            padding: '1rem',
            background: 'rgba(245, 158, 11, 0.1)',
            borderTop: '1px solid rgba(245, 158, 11, 0.3)',
          }}
        >
          <div style={{ fontSize: '0.85rem', color: '#F59E0B', marginBottom: '0.75rem' }}>
            ⚡ Suggested Action:
          </div>
          <div style={{ fontSize: '0.9rem', color: '#E2E8F0', marginBottom: '0.75rem' }}>
            {pendingAction.description}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => executeAction(pendingAction)}
              style={{
                flex: 1,
                padding: '0.5rem',
                background: 'linear-gradient(135deg, #10B981, #059669)',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              ✓ Confirm
            </button>
            <button
              onClick={() => setPendingAction(null)}
              style={{
                padding: '0.5rem 1rem',
                background: 'rgba(51, 65, 85, 0.5)',
                border: 'none',
                borderRadius: '8px',
                color: '#94A3B8',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div
        style={{
          padding: '1rem',
          borderTop: '1px solid rgba(51, 65, 85, 0.5)',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask anything..."
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(51, 65, 85, 0.5)',
              borderRadius: '12px',
              color: '#E2E8F0',
              fontSize: '0.9rem',
              outline: 'none',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            style={{
              padding: '0.75rem 1rem',
              background: input.trim() && !isLoading 
                ? 'linear-gradient(135deg, #3B82F6, #2563EB)'
                : 'rgba(51, 65, 85, 0.5)',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
            }}
          >
            →
          </button>
        </div>
        <div style={{ 
          marginTop: '0.5rem', 
          fontSize: '0.7rem', 
          color: '#64748B',
          textAlign: 'center',
        }}>
          Educational purposes only • Not financial advice
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
