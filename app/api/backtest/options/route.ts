import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { hasProTraderAccess } from '@/lib/proTraderAccess';
import { brainBacktestRequestSchema } from '@/lib/backtest/signalSnapshots';
import { runSignalReplayBacktest } from '@/lib/backtest/signalReplay';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Please log in to use Backtesting' }, { status: 401 });
    }
    if (!hasProTraderAccess(session.tier)) {
      return NextResponse.json({ error: 'Pro Trader subscription required for Backtesting' }, { status: 403 });
    }

    const body = brainBacktestRequestSchema.parse(await req.json());
    const result = await runSignalReplayBacktest({
      workspaceId: session.workspaceId,
      symbol: body.symbol,
      startDate: body.startDate,
      endDate: body.endDate,
      timeframe: body.timeframe,
      initialCapital: body.initialCapital,
      minSignalScore: body.minSignalScore,
      mode: 'options_signal_replay',
      sourceFilter: {
        exact: ['options.confluence'],
        like: ['options.confluence%'],
      },
    });

    return NextResponse.json(result);
  } catch (error: any) {
    logger.error('Options signal replay backtest error', {
      error: error?.message || 'Failed to run options signal replay backtest',
      stack: error?.stack,
    });
    return NextResponse.json(
      { error: error?.message || 'Failed to run options signal replay backtest' },
      { status: 500 }
    );
  }
}
