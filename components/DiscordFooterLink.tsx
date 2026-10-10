'use client';

import { discordInviteHref } from '@/lib/discordInvite';

export default function DiscordFooterLink({ className }: { className?: string }) {
  const href = discordInviteHref();
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener" className={className}>
      Discord
    </a>
  );
}
