import { computeInstitutionalFilter, InstitutionalFilterInput, InstitutionalFilterResult } from './institutionalFilter';

export type InstitutionalFilterEngineInput = InstitutionalFilterInput;
export type InstitutionalFilterEngineOutput = InstitutionalFilterResult;

export function runInstitutionalFilterEngine(input: InstitutionalFilterEngineInput): InstitutionalFilterEngineOutput {
  return computeInstitutionalFilter(input);
}
