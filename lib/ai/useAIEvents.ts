// =====================================================
// USE AI EVENTS HOOK - Easy event logging from components
// Use: const { logEvent, logPageView } = useAIEvents('scanner');
// =====================================================

'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { AIEventType, PageSkill } from '@/lib/ai/types';

interface UseAIEventsOptions {
  skill: PageSkill;
  symbols?: string[];
  timeframes?: string[];
  autoLogPageView?: boolean;
}

interface EventQueue {
  events: Array<{
    eventType: AIEventType;
    eventData: Record<string, unknown>;
    pageContext: {
      name: PageSkill;
      symbols?: string[];
      timeframes?: string[];
    };
  }>;
  timeout: ReturnType<typeof setTimeout> | null;
}

// Batch events and send every 2 seconds or when 10 events accumulate
const BATCH_INTERVAL = 2000;
const BATCH_SIZE = 10;

export function useAIEvents({
  skill,
  symbols = [],
  timeframes = [],
  autoLogPageView = true,
}: UseAIEventsOptions) {
  const queueRef = useRef<EventQueue>({ events: [], timeout: null });
  const sessionIdRef = useRef<string>(`sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

  // Flush events to server
  const flushEvents = useCallback(async () => {
    const queue = queueRef.current;
    if (queue.events.length === 0) return;

    const eventsToSend = [...queue.events];
    queue.events = [];

    try {
      await fetch('/api/ai/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: eventsToSend,
          sessionId: sessionIdRef.current,
        }),
      });
    } catch (error) {
      console.error('Failed to send AI events:', error);
      // Put events back in queue on failure
      queue.events = [...eventsToSend, ...queue.events].slice(0, 100);
    }
  }, []);

  // Queue an event
  const queueEvent = useCallback((
    eventType: AIEventType,
    eventData: Record<string, unknown> = {}
  ) => {
    const queue = queueRef.current;
    
    queue.events.push({
      eventType,
      eventData,
      pageContext: {
        name: skill,
        symbols,
        timeframes,
      },
    });

    // Flush immediately if batch size reached
    if (queue.events.length >= BATCH_SIZE) {
      if (queue.timeout) {
        clearTimeout(queue.timeout);
        queue.timeout = null;
      }
      flushEvents();
    } else if (!queue.timeout) {
      // Set timeout for batch flush
      queue.timeout = setTimeout(() => {
        queue.timeout = null;
        flushEvents();
      }, BATCH_INTERVAL);
    }
  }, [skill, symbols, timeframes, flushEvents]);

  // Log specific event types
  const logEvent = useCallback((
    eventType: AIEventType,
    eventData: Record<string, unknown> = {}
  ) => {
    queueEvent(eventType, {
      ...eventData,
      timestamp: new Date().toISOString(),
    });
  }, [queueEvent]);

  const logPageView = useCallback(() => {
    logEvent('page_view', {
      url: typeof window !== 'undefined' ? window.location.pathname : '',
      referrer: typeof document !== 'undefined' ? document.referrer : '',
    });
  }, [logEvent]);

  const logWidgetInteraction = useCallback((
    widgetName: string,
    action: string,
    value?: unknown
  ) => {
    logEvent('widget_interaction', {
      widgetName,
      action,
      value,
    });
  }, [logEvent]);

  const logSignalClicked = useCallback((
    symbol: string,
    signalType: string,
    confidence?: number,
    timeframe?: string
  ) => {
    logEvent('signal_clicked', {
      symbol,
      signalType,
      confidence,
      timeframe,
    });
  }, [logEvent]);

  const logAIQuestion = useCallback((question: string, responseId?: string) => {
    logEvent('ai_question_asked', {
      question,
      responseId,
      questionLength: question.length,
    });
  }, [logEvent]);

  const logAIAction = useCallback((
    actionType: string,
    actionParams: Record<string, unknown>,
    success: boolean
  ) => {
    logEvent('ai_action_used', {
      actionType,
      actionParams,
      success,
    });
  }, [logEvent]);

  const logOutcome = useCallback((
    symbol: string,
    pnlPercent: number,
    pnlDollars: number,
    holdTimeHours: number
  ) => {
    logEvent('outcome_logged', {
      symbol,
      pnlPercent,
      pnlDollars,
      holdTimeHours,
    });
  }, [logEvent]);

  const logThumbsUp = useCallback((responseId: string, topic?: string) => {
    logEvent('thumbs_up', { responseId, topic });
  }, [logEvent]);

  const logThumbsDown = useCallback((responseId: string, reason?: string, topic?: string) => {
    logEvent('thumbs_down', { responseId, reason, topic });
  }, [logEvent]);

  const logCorrection = useCallback((responseId: string, correctionText: string) => {
    logEvent('user_correction', { responseId, correctionText });
  }, [logEvent]);

  // Auto log page view on mount
  useEffect(() => {
    if (autoLogPageView) {
      logPageView();
    }
    
    // Flush on unmount
    return () => {
      if (queueRef.current.timeout) {
        clearTimeout(queueRef.current.timeout);
      }
      flushEvents();
    };
  }, [autoLogPageView, logPageView, flushEvents]);

  // Flush on page unload
  useEffect(() => {
    const handleUnload = () => {
      if (queueRef.current.events.length > 0) {
        // Use sendBeacon for reliable delivery on page unload
        navigator.sendBeacon('/api/ai/events', JSON.stringify({
          events: queueRef.current.events,
          sessionId: sessionIdRef.current,
        }));
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  return {
    logEvent,
    logPageView,
    logWidgetInteraction,
    logSignalClicked,
    logAIQuestion,
    logAIAction,
    logOutcome,
    logThumbsUp,
    logThumbsDown,
    logCorrection,
    sessionId: sessionIdRef.current,
  };
}

export default useAIEvents;
