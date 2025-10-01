import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default function LaunchRedirect() {
  const target = process.env.NEXT_PUBLIC_APP_URL || 'https://app.marketscannerpros.app';
  redirect(target);
}
