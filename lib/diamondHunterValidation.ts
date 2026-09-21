import type { DiamondAttention, DiamondConfidence, DiamondStage } from '@/lib/diamondHunter';

export type DiamondValidationStage =
  | 'REJECT'
  | 'BELOW_WATCH'
  | 'WATCH'
  | 'EMERGING'
  | 'PROVISIONAL_DIAMOND'
  | 'CONFIRMED_DIAMOND';

export interface DiamondValidationInput {
  score: number;
  stage: DiamondStage;
  confidence: DiamondConfidence;
  attention: DiamondAttention;
  hardReject: boolean;
  riskFlags: string[];
  ageMinutes: number | null;
  liquidityUsd: number;
  isHoneypot: boolean | 'unknown' | null | undefined;
  qualifyingScanCount: number;
  diamondScanCount: number;
  liquidityChangePct: number | null;
}

export interface DiamondConfirmationResult {
  validationStage: DiamondValidationStage;
  passed: number;
  required: number;
  blockers: string[];
}

const BLOCKING_RISK_PATTERNS = [
  /honeypot/i,
  /mint authority/i,
  /freeze authority/i,
  /developer holding/i,
  /top 10 holders/i,
  /community suspicious|suspicious community/i,
  /low geckoterminal trust score/i,
  /liquidity below \$10k/i,
];

export function evaluateDiamondConfirmation(input: DiamondValidationInput): DiamondConfirmationResult {
  if (input.hardReject || input.stage === 'REJECT' && input.score < 45) {
    return { validationStage: 'REJECT', passed: 0, required: 6, blockers: ['Hard rejection rule triggered'] };
  }

  if (input.score < 60) {
    return { validationStage: 'BELOW_WATCH', passed: 0, required: 6, blockers: ['Score is below the 60 watch threshold'] };
  }
  if (input.score < 70) {
    return { validationStage: 'WATCH', passed: 0, required: 6, blockers: ['Score has not reached the 70 emerging threshold'] };
  }
  if (input.score < 80) {
    return { validationStage: 'EMERGING', passed: 0, required: 6, blockers: ['Score has not reached the 80 Diamond threshold'] };
  }

  const checks = [
    {
      ok: input.qualifyingScanCount >= 3 && input.diamondScanCount >= 2,
      blocker: 'Needs repeated qualifying scans (3 Watch+ and 2 Diamond+)',
    },
    {
      ok: (input.ageMinutes ?? 0) >= 5,
      blocker: 'Pool is too new; needs at least 5 minutes of live history',
    },
    {
      ok: input.confidence === 'DEEP_CHECKED',
      blocker: 'Deep security check has not completed',
    },
    {
      ok: input.isHoneypot === false,
      blocker: input.isHoneypot === true ? 'Honeypot detected' : 'Honeypot status is not confirmed safe',
    },
    {
      ok: input.liquidityUsd >= 50_000 && (input.liquidityChangePct == null || input.liquidityChangePct >= -20),
      blocker: input.liquidityUsd < 50_000
        ? 'Liquidity is below the $50K confirmation floor'
        : 'Liquidity has fallen more than 20% since detection',
    },
    {
      ok: !input.riskFlags.some((flag) => BLOCKING_RISK_PATTERNS.some((pattern) => pattern.test(flag))),
      blocker: 'A blocking contract, holder, developer or liquidity risk flag remains',
    },
  ];

  const blockers = checks.filter((check) => !check.ok).map((check) => check.blocker);
  const passed = checks.length - blockers.length;
  return {
    validationStage: blockers.length === 0 ? 'CONFIRMED_DIAMOND' : 'PROVISIONAL_DIAMOND',
    passed,
    required: checks.length,
    blockers,
  };
}
