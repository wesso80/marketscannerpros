/**
 * lib/playbooks/index.ts — public API.
 */
export type {
  Playbook, PlaybookTrigger, PlaybookInvalidation,
  PlaybookDirection, PlaybookType, PreferredRegime, IvBias,
} from './types';
export { PLAYBOOKS, getPlaybook, listPlaybooks } from './registry';
export { classify } from './classifier';
export type { ClassifyInput, ClassifyResult } from './classifier';
