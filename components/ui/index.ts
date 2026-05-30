/**
 * UI Primitives barrel export
 * Import from '@/components/ui' in tool pages and admin surfaces.
 */
export { default as ToolPanel } from './ToolPanel';
export { default as StatusPill } from './StatusPill';
export { default as TierBadge } from './TierBadge';
export { default as EducationalDisclaimerCard } from './EducationalDisclaimerCard';
export { default as EmptyState } from './EmptyState';
export { default as ErrorState } from './ErrorState';
export { default as ScoreTypeBadge, deriveScoreType } from './ScoreTypeBadge';
export type { ScoreType } from './ScoreTypeBadge';
export { default as LoadingSkeleton, SkeletonLine, SkeletonCard, SkeletonTable, SkeletonMetric } from './LoadingSkeleton';

// Phase 1 design-system primitives (consume tokens only)
export { default as Button } from './Button';
export type { ButtonProps } from './Button';
export { default as Card } from './Card';
export type { CardProps, CardElevation } from './Card';
export { default as Badge } from './Badge';
export type { BadgeProps, BadgeTone } from './Badge';
export { default as StatCard } from './StatCard';
export type { StatCardProps } from './StatCard';
export { default as DataTable } from './DataTable';
export type { DataTableProps, DataColumn, DataColumnAlign } from './DataTable';
export { default as MetricChip } from './MetricChip';
export type { MetricChipProps, MetricChipTone } from './MetricChip';
export { default as PageHero } from './PageHero';
export type { PageHeroProps, PageHeroAction, PageHeroBadge } from './PageHero';
