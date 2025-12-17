import { NextResponse } from 'next/server';

// Options API removed
export async function POST() {
  return NextResponse.json(
    { success: false, error: 'Options API has been removed' },
    { status: 410 }
  );
}

