import { NextResponse } from 'next/server';

// ETF API removed
export async function GET() {
  return NextResponse.json(
    { success: false, error: 'ETF API has been removed' },
    { status: 410 }
  );
}
