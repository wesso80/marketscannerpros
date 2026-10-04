'use client';
import SavedPicks from './SavedPicks';
import { FREE_COPY } from './copy';
export default function FreeScanner() { return <main className="mx-auto max-w-4xl space-y-4 p-4"><h1 className="text-2xl font-semibold">{FREE_COPY.scanner}</h1><SavedPicks /><p className="text-xs">{FREE_COPY.research}</p></main>; }
