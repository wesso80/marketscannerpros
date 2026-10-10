/** Public invite link. Empty and whitespace-only values stay hidden. */
export function discordInviteHref(): string | null {
  const raw = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL;
  if (typeof raw !== 'string') return null;
  const href = raw.trim();
  return href ? href : null;
}
