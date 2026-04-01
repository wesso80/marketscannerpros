/**
 * MSP Operator — Version Registry §13.2
 * Central source of truth for all engine versions.
 * Every decision stores these so any prior decision can be exactly replayed.
 * @internal
 */

import type { EngineVersions } from '@/types/operator';

export const ENGINE_VERSIONS: EngineVersions = {
  featureEngineVersion: '2.0.0',
  regimeEngineVersion: '1.1.0',
  playbookEngineVersion: '1.1.0',
  doctrineVersion: '1.1.0',
  scoringProfileVersion: '1.1.0',
  governancePolicyVersion: '1.1.0',
  orchestratorVersion: '2.0.0',
  symbolTrustVersion: '1.0.0',
  metaHealthVersion: '1.0.0',
};
