/** Exact status label for a section dropped at the report cutoff. */
export const SECTION_TIMED_OUT = 'timed out';

export function sectionTimeoutWarning(section: string): string {
  return `${section} ${SECTION_TIMED_OUT}`;
}

export function sectionTimedOut(warnings: readonly string[] | undefined, section: string): boolean {
  return (warnings ?? []).includes(sectionTimeoutWarning(section));
}
