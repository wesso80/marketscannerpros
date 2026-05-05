/**
 * MSP Brain Layer — Phase 6: Admin / Public Surface Separation
 *
 * The elite learning brain is admin-private. This module is the single,
 * importable, testable enforcement point for the admin/public boundary.
 *
 * ─── ADMIN BRAIN MAY ───────────────────────────────────────────────────────
 *   - Use deeper research logic
 *   - Rank new opportunities aggressively
 *   - Compare symbols
 *   - Study failed setups
 *   - Review market anomalies
 *   - Detect edge decay
 *   - Identify watch candidates
 *   - Create private research notes
 *   - Produce operator-grade diagnostics
 *
 * ─── ADMIN BRAIN MUST NOT ──────────────────────────────────────────────────
 *   - Place trades
 *   - Connect to broker execution
 *   - Pretend to guarantee outcomes
 *   - Leak private prompts to public users
 *   - Leak admin research packets to public users
 *   - Use personal portfolio constraints unless in portfolio/risk mode
 *
 * ─── PUBLIC SITE MAY ───────────────────────────────────────────────────────
 *   - Show educational summaries
 *   - Show confluence and alignment
 *   - Explain setup conditions
 *   - Explain risks and limitations
 *   - Show delayed/cached/stale labels
 *   - Show hypothetical scenarios
 *
 * ─── PUBLIC SITE MUST NOT ──────────────────────────────────────────────────
 *   - Show admin-only edge models
 *   - Show private scoring internals
 *   - Show hidden research candidates
 *   - Expose raw prompt logic
 *   - Expose admin diagnostics
 *   - Imply personal financial advice
 *   - Imply broker execution
 *
 * Implementation: hard runtime guards at the API boundary + a sanitizer
 * applied to any payload leaving an admin module toward a public surface.
 *
 * Pairs with:
 *   - .claude/rules/admin-only.md
 *   - .claude/rules/no-public-leakage.md
 *   - .claude/rules/no-broker-execution.md
 *   - .claude/rules/risk-language-private.md
 */

// ─── Surface taxonomy ────────────────────────────────────────────────────────

export type Surface = 'admin' | 'public';

/**
 * Capabilities the admin brain is allowed to perform.
 */
export type AdminCapability =
  | 'deep_research'
  | 'aggressive_ranking'
  | 'symbol_comparison'
  | 'failed_setup_study'
  | 'anomaly_review'
  | 'edge_decay_detection'
  | 'watch_candidate_curation'
  | 'private_research_notes'
  | 'operator_diagnostics';

/**
 * Capabilities the admin brain is forbidden from performing,
 * regardless of caller authorisation.
 */
export type ForbiddenAdminAction =
  | 'place_trade'
  | 'broker_execution'
  | 'guarantee_outcome'
  | 'leak_private_prompt'
  | 'leak_admin_packet'
  | 'use_personal_portfolio_outside_risk_mode';

/**
 * Capabilities the public site is allowed to expose.
 */
export type PublicCapability =
  | 'educational_summary'
  | 'confluence_alignment'
  | 'setup_explanation'
  | 'risk_explanation'
  | 'freshness_labels'
  | 'hypothetical_scenarios';

/**
 * Capabilities the public site MUST NOT expose under any conditions.
 */
export type ForbiddenPublicExposure =
  | 'admin_edge_model'
  | 'private_scoring_internals'
  | 'hidden_research_candidate'
  | 'raw_prompt_logic'
  | 'admin_diagnostics'
  | 'personal_financial_advice'
  | 'broker_execution_implication';

export const ADMIN_CAPABILITIES: ReadonlyArray<AdminCapability> = [
  'deep_research',
  'aggressive_ranking',
  'symbol_comparison',
  'failed_setup_study',
  'anomaly_review',
  'edge_decay_detection',
  'watch_candidate_curation',
  'private_research_notes',
  'operator_diagnostics',
];

export const FORBIDDEN_ADMIN_ACTIONS: ReadonlyArray<ForbiddenAdminAction> = [
  'place_trade',
  'broker_execution',
  'guarantee_outcome',
  'leak_private_prompt',
  'leak_admin_packet',
  'use_personal_portfolio_outside_risk_mode',
];

export const PUBLIC_CAPABILITIES: ReadonlyArray<PublicCapability> = [
  'educational_summary',
  'confluence_alignment',
  'setup_explanation',
  'risk_explanation',
  'freshness_labels',
  'hypothetical_scenarios',
];

export const FORBIDDEN_PUBLIC_EXPOSURES: ReadonlyArray<ForbiddenPublicExposure> = [
  'admin_edge_model',
  'private_scoring_internals',
  'hidden_research_candidate',
  'raw_prompt_logic',
  'admin_diagnostics',
  'personal_financial_advice',
  'broker_execution_implication',
];

// ─── Forbidden runtime actions ───────────────────────────────────────────────

const HARD_FORBIDDEN_REGARDLESS_OF_SURFACE: ReadonlyArray<ForbiddenAdminAction> = [
  'place_trade',
  'broker_execution',
];

/**
 * The platform NEVER places trades or connects to a broker.
 * Throws synchronously regardless of caller surface (admin or public).
 */
export function assertNoBrokerExecution(intendedAction: string): void {
  const lc = intendedAction.toLowerCase();
  const hits = ['place_order', 'submit_order', 'broker_connect', 'execute_trade', 'route_order'];
  if (hits.some((h) => lc.includes(h))) {
    throw new BrainSurfaceViolation(
      'broker_execution',
      `Hard rule: platform must not place trades or connect to broker execution. Intended action: ${intendedAction}`,
    );
  }
}

/**
 * Outcome guarantees are forbidden in all surfaces. Use evidence + uncertainty
 * language instead. Throws if a payload contains banned guarantee phrasing.
 */
const GUARANTEE_PHRASES = [
  'guaranteed return',
  'guaranteed profit',
  'guaranteed win',
  'risk-free',
  'cannot lose',
  'will definitely',
  'guaranteed outcome',
];

export function assertNoOutcomeGuarantee(text: string | null | undefined): void {
  if (!text) return;
  const lc = text.toLowerCase();
  for (const phrase of GUARANTEE_PHRASES) {
    if (lc.includes(phrase)) {
      throw new BrainSurfaceViolation(
        'guarantee_outcome',
        `Hard rule: outcome guarantees are forbidden. Found phrase: "${phrase}"`,
      );
    }
  }
}

// ─── Admin-only field set (never serialise to public) ────────────────────────

/**
 * Top-level keys that are ALWAYS stripped before any payload reaches a
 * public surface. The list is conservative — when in doubt, add a key.
 */
export const ADMIN_ONLY_KEYS: ReadonlySet<string> = new Set([
  // Edge model internals
  'edgeScore',
  'edge_score',
  'edgeTier',
  'edge_tier',
  'wilsonLower95',
  'wilson_lower_95',
  'wilsonUpper95',
  'wilson_upper_95',
  'shrinkageEstimate',
  'shrinkage_estimate',
  'sampleSizePenalty',
  'sample_size_penalty',
  'overfittingPenalty',
  'overfitting_penalty',
  'confidenceReason',
  'confidence_reason',
  'inputsHash',
  'inputs_hash',
  'snapshotHash',
  'snapshot_hash',
  'inputSnapshotHash',
  'input_snapshot_hash',
  'scoringModelVersion',
  'scoring_model_version',
  // Admin scoring axes
  'opportunityScore',
  'opportunity_score',
  'evidenceQualityScore',
  'evidence_quality_score',
  'personalExposureScore',
  'personal_exposure_score',
  'personalExposureFlag',
  'personal_exposure_flag',
  // Admin/operator metadata
  'adminOnly',
  'admin_only',
  'operatorContext',
  'operator_context',
  'adminPacket',
  'admin_packet',
  'researchPacket',
  'research_packet',
  'researchPacketId',
  'research_packet_id',
  'decisionPacketId',
  'decision_packet_id',
  // Prompts / model internals
  'systemPrompt',
  'system_prompt',
  'promptTemplate',
  'prompt_template',
  'rawPrompt',
  'raw_prompt',
  'promptVersion',
  'prompt_version',
  'modelVersion',
  'model_version',
  'ruleVersion',
  'rule_version',
  // Diagnostics
  'diagnostics',
  'adminDiagnostics',
  'admin_diagnostics',
  'providerDiagnostics',
  'provider_diagnostics',
  'modelDiagnostics',
  'model_diagnostics',
  // Hidden watchlists / candidates
  'watchCandidates',
  'watch_candidates',
  'hiddenCandidates',
  'hidden_candidates',
  'privateNotes',
  'private_notes',
  'operatorNotes',
  'operator_notes',
  // Personal portfolio constraints (unless explicitly in risk mode)
  'portfolioConstraints',
  'portfolio_constraints',
  'personalPortfolio',
  'personal_portfolio',
]);

/**
 * Substrings within a key that mark it as admin-only (defence in depth
 * for keys we haven't explicitly enumerated).
 */
const ADMIN_KEY_SUBSTRINGS = [
  'admin_',
  'adminonly',
  'admin_only',
  'operator_',
  'private_',
  'internal_',
  '__internal',
  'rawprompt',
  'raw_prompt',
];

function keyLooksAdminOnly(key: string): boolean {
  if (ADMIN_ONLY_KEYS.has(key)) return true;
  const lc = key.toLowerCase();
  return ADMIN_KEY_SUBSTRINGS.some((s) => lc.includes(s));
}

// ─── Sanitizer ──────────────────────────────────────────────────────────────

export interface SanitizeOptions {
  /** When true, the function throws on the first admin-only key instead of stripping. */
  strict?: boolean;
  /** Keys that are admin-only by general policy but allowed for THIS payload. */
  allow?: string[];
  /** Optional collector populated with stripped key paths (e.g. ['result.adminPacket']). */
  strippedPaths?: string[];
  /** Recursion guard depth (default 32). */
  maxDepth?: number;
}

/**
 * Recursively strip admin-only keys from any value before it leaves an admin
 * module toward a public surface. Returns a NEW value — does not mutate input.
 *
 * If `strict: true`, throws BrainSurfaceViolation on the first hit. Use this
 * inside admin→public bridges where any leak is a bug.
 */
export function sanitizeForPublic<T>(value: T, opts: SanitizeOptions = {}): T {
  const allow = new Set(opts.allow ?? []);
  const maxDepth = opts.maxDepth ?? 32;
  return walk(value, '', 0) as T;

  function walk(node: unknown, path: string, depth: number): unknown {
    if (depth > maxDepth) return node;
    if (node === null || node === undefined) return node;
    if (Array.isArray(node)) {
      return node.map((v, i) => walk(v, `${path}[${i}]`, depth + 1));
    }
    if (typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (!allow.has(k) && keyLooksAdminOnly(k)) {
          if (opts.strict) {
            throw new BrainSurfaceViolation(
              'leak_admin_packet',
              `Admin-only key "${k}" found at "${path || '<root>'}" while serialising for public surface.`,
            );
          }
          opts.strippedPaths?.push(path ? `${path}.${k}` : k);
          continue;
        }
        out[k] = walk(v, path ? `${path}.${k}` : k, depth + 1);
      }
      return out;
    }
    return node;
  }
}

// ─── Surface-level guards ────────────────────────────────────────────────────

/**
 * Asserts that the payload is safe to return from a public route.
 * Throws on any admin-only key. Use this as the very last step before
 * `NextResponse.json(...)` in any non-admin route.
 */
export function assertPublicSafe<T>(payload: T, context = 'public response'): T {
  // strict pass — throws on first admin-only key
  return sanitizeForPublic(payload, { strict: true }) as T;
}

/**
 * Strip admin fields from a payload destined for a public surface.
 * Use this when the upstream is an admin module that may include admin
 * fields and you want a permissive (non-throwing) downgrade.
 */
export function downgradeToPublic<T>(payload: T, allow: string[] = []): T {
  return sanitizeForPublic(payload, { strict: false, allow });
}

/**
 * Asserts that the calling module is allowed to import from
 * `lib/admin/*`, `lib/operator/*`, `lib/quant/*` — i.e. that the route
 * file path is itself admin. Used at the top of admin route handlers.
 *
 * Pass `import.meta.url` (or a recognisable path string) to identify the caller.
 */
export function assertAdminSurface(callerPath: string): void {
  const lc = callerPath.toLowerCase().replace(/\\/g, '/');
  const isAdminPath =
    lc.includes('/api/admin/') ||
    lc.includes('/api/operator/') ||
    lc.includes('/api/quant/') ||
    lc.includes('/admin/') ||
    lc.includes('/operator/');
  if (!isAdminPath) {
    throw new BrainSurfaceViolation(
      'leak_admin_packet',
      `Module path "${callerPath}" attempted to use an admin-only Brain operation from a non-admin surface.`,
    );
  }
}

/**
 * Combined guard for an admin capability invocation. Verifies the caller
 * was authorised AND the capability is in the admin-allowed set.
 */
export function assertAdminCapability(
  capability: AdminCapability,
  ctx: { isAdmin: boolean; callerPath?: string },
): void {
  if (!ctx.isAdmin) {
    throw new BrainSurfaceViolation(
      'leak_admin_packet',
      `Admin capability "${capability}" requested by non-admin caller${
        ctx.callerPath ? ` (${ctx.callerPath})` : ''
      }.`,
    );
  }
  if (!ADMIN_CAPABILITIES.includes(capability)) {
    throw new BrainSurfaceViolation(
      'leak_admin_packet',
      `Capability "${capability}" is not in the admin-allowed set.`,
    );
  }
}

/**
 * Combined guard for a public capability — confirms the requested behaviour
 * is one we're willing to expose publicly.
 */
export function assertPublicCapability(capability: PublicCapability): void {
  if (!PUBLIC_CAPABILITIES.includes(capability)) {
    throw new BrainSurfaceViolation(
      'private_scoring_internals' as ForbiddenPublicExposure as never,
      `Capability "${capability}" is not in the public-allowed set.`,
    );
  }
}

// ─── Personal portfolio gate ─────────────────────────────────────────────────

/**
 * Admin brain is forbidden from using personal portfolio constraints unless
 * the operator is explicitly in 'portfolio' or 'risk' mode. This guard makes
 * that boundary explicit at every call site that wants to read portfolio data.
 */
export type AdminMode = 'research' | 'portfolio' | 'risk' | 'diagnostics' | 'unknown';

const PORTFOLIO_ALLOWED_MODES: ReadonlySet<AdminMode> = new Set(['portfolio', 'risk']);

export function assertPortfolioContextAllowed(mode: AdminMode): void {
  if (!PORTFOLIO_ALLOWED_MODES.has(mode)) {
    throw new BrainSurfaceViolation(
      'use_personal_portfolio_outside_risk_mode',
      `Admin mode "${mode}" is not allowed to read personal portfolio constraints. Switch to 'portfolio' or 'risk' mode.`,
    );
  }
}

// ─── Public-output language guard ────────────────────────────────────────────

const FINANCIAL_ADVICE_PHRASES = [
  'you should buy',
  'you should sell',
  'i recommend you buy',
  'i recommend you sell',
  'as your financial advisor',
  'this is personal financial advice',
];

const BROKER_EXECUTION_PHRASES = [
  'i will place',
  'placing your order',
  'order has been routed',
  'execution submitted',
  'connected to your broker',
];

/**
 * Asserts public-facing text does not imply personal financial advice or
 * broker execution. Throws on the first hit.
 */
export function assertPublicLanguageSafe(text: string | null | undefined): void {
  if (!text) return;
  const lc = text.toLowerCase();
  for (const phrase of FINANCIAL_ADVICE_PHRASES) {
    if (lc.includes(phrase)) {
      throw new BrainSurfaceViolation(
        'personal_financial_advice',
        `Public output implied personal financial advice: "${phrase}"`,
      );
    }
  }
  for (const phrase of BROKER_EXECUTION_PHRASES) {
    if (lc.includes(phrase)) {
      throw new BrainSurfaceViolation(
        'broker_execution_implication',
        `Public output implied broker execution: "${phrase}"`,
      );
    }
  }
  assertNoOutcomeGuarantee(text);
}

// ─── Brain event visibility coercion ─────────────────────────────────────────

/**
 * Given the surface the data is destined for, set the correct visibility
 * flags on a brain event. Mirrors the DB CHECK constraint
 * `NOT (admin_only AND public_safe)`.
 */
export function visibilityFlagsForSurface(surface: Surface): {
  adminOnly: boolean;
  publicSafe: boolean;
} {
  return surface === 'admin'
    ? { adminOnly: true, publicSafe: false }
    : { adminOnly: false, publicSafe: true };
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class BrainSurfaceViolation extends Error {
  readonly kind: ForbiddenAdminAction | ForbiddenPublicExposure;
  constructor(
    kind: ForbiddenAdminAction | ForbiddenPublicExposure,
    message: string,
  ) {
    super(`[BrainSurfaceViolation:${kind}] ${message}`);
    this.name = 'BrainSurfaceViolation';
    this.kind = kind;
  }
}
