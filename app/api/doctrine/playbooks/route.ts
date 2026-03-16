/* ═══════════════════════════════════════════════════════════════════════════
   API: /api/doctrine/playbooks — GET all playbook definitions
   Public reference data (no auth required).
   ═══════════════════════════════════════════════════════════════════════════ */

import { NextResponse } from 'next/server';
import { PLAYBOOKS } from '@/lib/doctrine/registry';

export async function GET() {
  return NextResponse.json({ playbooks: PLAYBOOKS });
}
