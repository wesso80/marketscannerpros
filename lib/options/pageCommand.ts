/**
 * Options-page command status.
 * NO TRADE, the failed execution step, and the WAIT operator action come only from
 * the verdict or the quality gate. Entry-timing urgency is a clock note and is not read.
 */
export function optionsPageCommand(input: {
  verdict?: string | null;
  tradeQualityGate?: string | null;
  hasExecutionLevels: boolean;
  confidence?: number | null;
}): {
  noTrade: boolean;
  executionStep: 'fail' | 'ready';
  executionState: 'NO TRADE' | 'READY' | 'WAIT';
  commandStatus: 'NO TRADE' | 'ACTIVE' | 'WAIT';
  action: 'WAIT' | 'PREP';
} {
  const noTrade = input.verdict === 'WAIT' || input.tradeQualityGate === 'WAIT';
  const confidence = input.confidence ?? 0;
  return {
    noTrade,
    executionStep: noTrade || !input.hasExecutionLevels ? 'fail' : 'ready',
    executionState: noTrade ? 'NO TRADE' : input.hasExecutionLevels ? 'READY' : 'WAIT',
    commandStatus: noTrade ? 'NO TRADE' : input.hasExecutionLevels && confidence >= 60 ? 'ACTIVE' : 'WAIT',
    action: noTrade ? 'WAIT' : 'PREP',
  };
}
