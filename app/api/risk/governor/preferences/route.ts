import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'msp_risk_guard';

function parseEnabledFromCookie(req: NextRequest): boolean {
  return req.cookies.get(COOKIE_NAME)?.value !== 'off';
}

export async function GET(req: NextRequest) {
  const enabled = parseEnabledFromCookie(req);
  return NextResponse.json({ enabled });
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const enabled = body?.enabled !== false;

    const res = NextResponse.json({ enabled });
    res.cookies.set({
      name: COOKIE_NAME,
      value: enabled ? 'on' : 'off',
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  } catch (error) {
    console.error('risk governor preferences update error:', error);
    return NextResponse.json({ error: 'Failed to update preference' }, { status: 500 });
  }
}
