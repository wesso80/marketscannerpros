/**
 * Test-only recognition of a Redis eval stub that implements some other budget.
 * Production does not inspect function source. A cap result is trusted only when
 * the script returns the 'cg' tag. Suites whose stub ignores the script and
 * returns a bare {0|1, ...} tuple should skip the cap script:
 *   if (!evalRunsCapScript(redis.eval)) throw before running it on the cap script.
 */
export function evalRunsCapScript(evalFn: (...args: never[]) => unknown): boolean {
  try {
    const src = Function.prototype.toString.call(evalFn);
    if (src.includes('shadow') || src.includes('1500') || src.includes('4500')) return false;
  } catch {
    return true;
  }
  return true;
}

/** Cap reservation script. Foreign stubs must not answer it. */
export function isCgCapScript(script: string): boolean {
  return script.includes("redis.call('INCR', KEYS[1])") && script.includes("'cg'");
}

/** Split hosts and env reads the bypass guard must still see. */
export const CG_BYPASS_FIXTURES = {
  hosts: [
    ["'https://pro-api.' + 'coingecko.com/api/v3'", true],
    ['`https://api.${\'coingecko.com\'}/api/v3`', true],
    ['`https://${\'pro-api\'}.${\'coingecko.com\'}`', true],
    ['https://www.coingecko.com/en/api', false],
  ],
  env: [
    ["process.env['COIN' + 'GECKO_API_KEY']", true],
    ['process.env[`COINGECKO_${\'PRO_API_KEY\'}`]', true],
    ['process.env.COINGECKO_WS_URL', true],
  ],
} as const;
