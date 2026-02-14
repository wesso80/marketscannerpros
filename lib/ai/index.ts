// =====================================================
// MSP AI PLATFORM - Main Export
// Import everything from: import { ... } from '@/lib/ai';
// =====================================================

// Types
export * from './types';

// Context Builder
export { 
  buildUnifiedContext, 
  serializeContextForPrompt,
  getUserMemory,
  updateUserMemory,
  getMarketState,
} from './context';

// Tools & Policies
export { 
  AI_TOOLS, 
  getToolsForSkill, 
  getOpenAITools,
  toolRequiresConfirmation,
  getToolPolicy,
  isToolCacheable,
  getToolCacheTTL,
  isToolRateLimited,
  assertToolAllowedForSkill,
  generateIdempotencyKey,
  getToolSummary,
} from './tools';

// Hooks
export { useAIEvents } from './useAIEvents';
export { useUserMemory } from './useUserMemory';
