import { redirect } from 'next/navigation';
import { optionsTerminalUrl } from '@/lib/options/journey';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const raw=await searchParams;
  const params=Object.fromEntries(Object.entries(raw).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
  redirect(optionsTerminalUrl(params));
}
