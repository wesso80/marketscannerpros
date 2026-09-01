import { describe, it, expect } from 'vitest';
import { parsePbocMoneySupplyHtml } from '@/lib/intelligence/diagnostics/pbocMoneySupply';

// Minimal fixture mirroring the real PBOC 货币供应量 table structure + values
// captured 2026-09-01 (attachDir/2026/08/2026081416590597261.htm).
const FIXTURE = `
<table>
<tr><td>货币供应量</td></tr>
<tr><td>Money Supply</td></tr>
<tr><td>单位：亿元人民币 Unit:100 Million Yuan</td></tr>
<tr><td>项目 Item</td><td>2026.01</td><td>2026.02</td><td>2026.03</td><td>2026.04</td><td>2026.05</td><td>2026.06</td><td>2026.07</td><td>2026.08</td></tr>
<tr><td>货币和准货币（M2） Money &amp; Quasi-money</td><td>3471860.39</td><td>3492159.91</td><td>3538636.53</td><td>3530425.21</td><td>3536688.92</td><td>3567108.43</td><td>3555077.24</td><td>　</td></tr>
<tr><td>货币（M1） Money</td><td>1179680.52</td><td>1159258.82</td><td>1193202.99</td><td>1145833.73</td><td>1148891.41</td><td>1184775.53</td><td>1154623.00</td><td>　</td></tr>
<tr><td>流通中货币（M0） Currency in Circulation</td><td>146138.60</td><td>151436.41</td><td>147082.81</td><td>147477.38</td><td>146854.71</td><td>147364.79</td><td>148202.86</td><td>　</td></tr>
</table>`;

describe('PBOC Money Supply parser', () => {
  it('extracts the M2 (货币和准货币) monthly series with correct scale', () => {
    const r = parsePbocMoneySupplyHtml(FIXTURE, 'https://www.pbc.gov.cn/x.htm', '2026-09-01T00:00:00Z');
    expect(r.country).toBe('China');
    expect(r.aggregate).toBe('M2');
    expect(r.unit).toBe('100-million-CNY');
    expect(r.observations).toHaveLength(7); // Aug empty
    expect(r.observations[0]).toEqual({ month: '2026-01', value: 3471860.39 });
    // June scale sanity check vs independent reference (CNY 356.71T).
    expect(r.observations.find((o) => o.month === '2026-06')!.value).toBeCloseTo(3567108.43, 2);
    expect(r.observations[r.observations.length - 1]).toEqual({ month: '2026-07', value: 3555077.24 });
  });

  it('does NOT pick the M1 row value for M2 (fails closed on row identity)', () => {
    const r = parsePbocMoneySupplyHtml(FIXTURE, 'u');
    // M2 June must be the M2 value, never M1's 1184775.53.
    expect(r.observations.find((o) => o.month === '2026-06')!.value).not.toBe(1184775.53);
  });

  it('throws when the unit hint is absent (refuses to guess scale)', () => {
    expect(() => parsePbocMoneySupplyHtml('<table><tr><td>项目 Item</td><td>2026.01</td></tr></table>', 'u')).toThrow(/unit/);
  });

  it('throws when the M2 row is missing', () => {
    const noM2 = `<table>
      <tr><td>单位：亿元</td></tr>
      <tr><td>项目 Item</td><td>2026.01</td></tr>
      <tr><td>货币（M1）</td><td>1179680.52</td></tr></table>`;
    expect(() => parsePbocMoneySupplyHtml(noM2, 'u')).toThrow(/M2 row/);
  });

  it('throws on an implausible scale (guards against unit drift)', () => {
    const badScale = `<table>
      <tr><td>单位：亿元</td></tr>
      <tr><td>项目 Item</td><td>2026.01</td></tr>
      <tr><td>货币和准货币（M2）</td><td>355.5</td></tr></table>`;
    expect(() => parsePbocMoneySupplyHtml(badScale, 'u')).toThrow(/scale/);
  });
});
