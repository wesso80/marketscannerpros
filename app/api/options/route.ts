import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';

// Deprecated — use /api/options-scan instead
export async function POST() {
  return NextResponse.json(
    { success: false, error: 'Options API has moved to /api/options-scan', redirect: '/api/options-scan' },
    { status: 301 }
  );
}

export async function GET() {
  return NextResponse.json(
    { success: false, error: 'Options API has moved to /api/options-scan', redirect: '/api/options-scan' },
    { status: 301 }
  );
}

