/**
 * Execution Engine — barrel export
 */

export * from './types';
export { computePositionSize, kellyMaxSize } from './positionSizing';
export { selectOptions } from './optionsSelector';
export { evaluateGovernor, quickGovernorCheck } from './riskGovernor';
export { buildExitPlan } from './exits';
export { computeLeverage } from './leverage';
export { buildOrder } from './orderBuilder';
export { validateIntent, validateProposal } from './validators';
