/**
 * lib/insider/edgar.ts — SEC EDGAR insider (Form 4) ingestor.
 *
 * Approach: use the public, free EDGAR submissions endpoint
 * https://data.sec.gov/submissions/CIK{paddedCik}.json to list
 * filings for an issuer, filter to Form 4, then parse the XML
 * primary doc for transaction details.
 *
 * SEC requires a User-Agent identifying the requester
 * (e.g. "MarketScannerPros admin@marketscannerpros.app"). We read
 * EDGAR_USER_AGENT env var; fallback exists but SEC may throttle.
 *
 * Provenance: every row stored with ingest_source='edgar' and
 * ingest_ts. Missing fields stay NULL — never silently backfilled.
 */

import { q } from '@/lib/db';

const SEC_BASE = 'https://www.sec.gov';
const SEC_DATA = 'https://data.sec.gov';

function userAgent(): string {
  return process.env.EDGAR_USER_AGENT
    ?? 'MarketScannerPros Admin (admin@marketscannerpros.app)';
}

async function secFetch(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': userAgent(),
      'Accept': 'application/json, text/xml, */*',
      'Accept-Encoding': 'gzip, deflate',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`SEC ${res.status} ${url}`);
  return res;
}

// ----------------------------- Ticker → CIK -----------------------------

interface TickerEntry { cik_str: number; ticker: string; title: string }

let tickerMapCache: Map<string, { cik: string; name: string }> | null = null;
let tickerMapLoadedAt = 0;
const TICKER_TTL_MS = 24 * 60 * 60 * 1000;

async function loadTickerMap(): Promise<Map<string, { cik: string; name: string }>> {
  const now = Date.now();
  if (tickerMapCache && now - tickerMapLoadedAt < TICKER_TTL_MS) return tickerMapCache;
  const res = await secFetch(`${SEC_BASE}/files/company_tickers.json`);
  const json = await res.json() as Record<string, TickerEntry>;
  const map = new Map<string, { cik: string; name: string }>();
  for (const v of Object.values(json)) {
    map.set(v.ticker.toUpperCase(), { cik: String(v.cik_str).padStart(10, '0'), name: v.title });
  }
  tickerMapCache = map;
  tickerMapLoadedAt = now;
  return map;
}

export async function resolveCik(symbol: string): Promise<{ cik: string; name: string } | null> {
  const sym = symbol.toUpperCase().trim();
  // Check DB cache first
  const cached = await q<{ cik: string; company_name: string | null }>(
    `SELECT cik, company_name FROM edgar_symbol_map WHERE symbol = $1`,
    [sym],
  );
  if (cached[0]) return { cik: cached[0].cik, name: cached[0].company_name ?? sym };
  // Load full map and store
  const map = await loadTickerMap();
  const hit = map.get(sym);
  if (!hit) return null;
  await q(
    `INSERT INTO edgar_symbol_map (symbol, cik, company_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (symbol) DO UPDATE
       SET cik = EXCLUDED.cik, company_name = EXCLUDED.company_name, refreshed_at = NOW()`,
    [sym, hit.cik, hit.name],
  );
  return hit;
}

// ----------------------------- Filings list -----------------------------

interface SubmissionsResp {
  cik: string;
  name: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
    };
  };
}

interface RecentFiling {
  accession: string;
  accessionNoDash: string;
  filingDate: string;
  reportDate: string;
  form: string;
  primaryDocument: string;
}

async function listRecentFilings(cik: string, formTypes: string[]): Promise<RecentFiling[]> {
  const res = await secFetch(`${SEC_DATA}/submissions/CIK${cik}.json`);
  const json = await res.json() as SubmissionsResp;
  const r = json.filings.recent;
  const out: RecentFiling[] = [];
  for (let i = 0; i < r.accessionNumber.length; i++) {
    if (!formTypes.includes(r.form[i])) continue;
    const accession = r.accessionNumber[i];
    out.push({
      accession,
      accessionNoDash: accession.replace(/-/g, ''),
      filingDate: r.filingDate[i],
      reportDate: r.reportDate[i],
      form: r.form[i],
      primaryDocument: r.primaryDocument[i],
    });
  }
  return out;
}

// ----------------------------- Form 4 parsing -----------------------------

interface ParsedTransaction {
  transactionDate: string | null;
  transactionCode: string | null;
  shares: number | null;
  pricePerShare: number | null;
  sharesAfter: number | null;
  directOrIndirect: string | null;
}

interface ParsedForm4 {
  reporterName: string | null;
  reporterCik: string | null;
  reporterRelationship: string | null;
  transactions: ParsedTransaction[];
}

function pickFirst(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  // value can be wrapped in <value>...</value>
  const inner = m[1].trim();
  const inner2 = inner.match(/<value>([\s\S]*?)<\/value>/i);
  return inner2 ? inner2[1].trim() : inner.replace(/<[^>]+>/g, '').trim() || null;
}

function pickAllBlocks(xml: string, blockTag: string): string[] {
  const re = new RegExp(`<${blockTag}[^>]*>([\\s\\S]*?)</${blockTag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

function parseForm4Xml(xml: string): ParsedForm4 {
  const reporterName = pickFirst(xml, 'rptOwnerName');
  const reporterCik = pickFirst(xml, 'rptOwnerCik');
  const isDirector = pickFirst(xml, 'isDirector');
  const isOfficer = pickFirst(xml, 'isOfficer');
  const isTenPct = pickFirst(xml, 'isTenPercentOwner');
  const officerTitle = pickFirst(xml, 'officerTitle');
  const relationship = [
    isDirector === '1' || isDirector === 'true' ? 'director' : null,
    isOfficer === '1' || isOfficer === 'true' ? (officerTitle ? `officer (${officerTitle})` : 'officer') : null,
    isTenPct === '1' || isTenPct === 'true' ? '10% owner' : null,
  ].filter(Boolean).join(', ') || null;

  const transactions: ParsedTransaction[] = [];
  for (const block of pickAllBlocks(xml, 'nonDerivativeTransaction')) {
    const date = pickFirst(block, 'transactionDate');
    const code = pickFirst(block, 'transactionCode');
    const sharesRaw = pickFirst(block, 'transactionShares');
    const priceRaw = pickFirst(block, 'transactionPricePerShare');
    const afterRaw = pickFirst(block, 'sharesOwnedFollowingTransaction');
    const dOrI = pickFirst(block, 'directOrIndirectOwnership');
    transactions.push({
      transactionDate: date,
      transactionCode: code,
      shares: sharesRaw ? Number(sharesRaw) : null,
      pricePerShare: priceRaw ? Number(priceRaw) : null,
      sharesAfter: afterRaw ? Number(afterRaw) : null,
      directOrIndirect: dOrI,
    });
  }
  return { reporterName, reporterCik, reporterRelationship: relationship, transactions };
}

// ----------------------------- Ingest -----------------------------

export interface InsiderIngestResult {
  symbol: string;
  cik: string;
  filingsScanned: number;
  filingsParsed: number;
  txInserted: number;
  errors: { accession: string; error: string }[];
}

export async function ingestInsiderForSymbol(symbol: string, opts: { maxFilings?: number } = {}): Promise<InsiderIngestResult> {
  const maxFilings = Math.max(1, Math.min(50, opts.maxFilings ?? 10));
  const resolved = await resolveCik(symbol);
  if (!resolved) throw new Error(`CIK not found for ${symbol}`);
  const filings = (await listRecentFilings(resolved.cik, ['4', '4/A'])).slice(0, maxFilings);
  const result: InsiderIngestResult = {
    symbol: symbol.toUpperCase(),
    cik: resolved.cik,
    filingsScanned: filings.length,
    filingsParsed: 0,
    txInserted: 0,
    errors: [],
  };
  for (const f of filings) {
    try {
      const cikInt = String(parseInt(resolved.cik, 10));
      const xmlUrl = `${SEC_BASE}/Archives/edgar/data/${cikInt}/${f.accessionNoDash}/${f.primaryDocument}`;
      const res = await secFetch(xmlUrl);
      const xml = await res.text();
      const parsed = parseForm4Xml(xml);
      const filingUrl = `${SEC_BASE}/cgi-bin/browse-edgar?action=getcompany&CIK=${resolved.cik}&type=4&dateb=&owner=include&count=40`;
      for (const t of parsed.transactions) {
        if (!t.transactionDate) continue;
        const totalValue = t.shares !== null && t.pricePerShare !== null
          ? t.shares * t.pricePerShare
          : null;
        try {
          await q(
            `INSERT INTO insider_transactions (
               symbol, issuer_cik, reporter_name, reporter_cik, reporter_relationship,
               transaction_date, transaction_code, shares, price_per_share, total_value,
               shares_after, direct_or_indirect, filing_accession, filing_url, filed_at,
               ingest_source
             ) VALUES (
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'edgar'
             )
             ON CONFLICT DO NOTHING`,
            [
              symbol.toUpperCase(),
              resolved.cik,
              parsed.reporterName,
              parsed.reporterCik,
              parsed.reporterRelationship,
              t.transactionDate,
              t.transactionCode,
              t.shares,
              t.pricePerShare,
              totalValue,
              t.sharesAfter,
              t.directOrIndirect,
              f.accession,
              filingUrl,
              f.filingDate ? `${f.filingDate}T00:00:00Z` : null,
            ],
          );
          result.txInserted += 1;
        } catch {
          // unique violation or other — skip silently per row
        }
      }
      result.filingsParsed += 1;
      // Be polite to SEC: 100ms between filings = max 10/sec, well under their 10 req/s limit
      await new Promise((r) => setTimeout(r, 110));
    } catch (e: unknown) {
      result.errors.push({ accession: f.accession, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}

// ----------------------------- Read API -----------------------------

export interface InsiderRow {
  id: number;
  symbol: string;
  reporterName: string | null;
  reporterRelationship: string | null;
  transactionDate: string;
  transactionCode: string | null;
  shares: number | null;
  pricePerShare: number | null;
  totalValue: number | null;
  sharesAfter: number | null;
  directOrIndirect: string | null;
  filingUrl: string | null;
  filedAt: string | null;
}

export async function recentInsiderForSymbol(symbol: string, limit = 50): Promise<InsiderRow[]> {
  const rows = await q<{
    id: number; symbol: string; reporter_name: string | null;
    reporter_relationship: string | null; transaction_date: Date;
    transaction_code: string | null; shares: string | null;
    price_per_share: string | null; total_value: string | null;
    shares_after: string | null; direct_or_indirect: string | null;
    filing_url: string | null; filed_at: Date | null;
  }>(
    `SELECT id, symbol, reporter_name, reporter_relationship, transaction_date,
            transaction_code, shares::text, price_per_share::text, total_value::text,
            shares_after::text, direct_or_indirect, filing_url, filed_at
       FROM insider_transactions
      WHERE symbol = $1
      ORDER BY transaction_date DESC, id DESC
      LIMIT $2`,
    [symbol.toUpperCase(), Math.max(1, Math.min(500, limit))],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    symbol: r.symbol,
    reporterName: r.reporter_name,
    reporterRelationship: r.reporter_relationship,
    transactionDate: r.transaction_date.toISOString().slice(0, 10),
    transactionCode: r.transaction_code,
    shares: r.shares === null ? null : Number(r.shares),
    pricePerShare: r.price_per_share === null ? null : Number(r.price_per_share),
    totalValue: r.total_value === null ? null : Number(r.total_value),
    sharesAfter: r.shares_after === null ? null : Number(r.shares_after),
    directOrIndirect: r.direct_or_indirect,
    filingUrl: r.filing_url,
    filedAt: r.filed_at ? r.filed_at.toISOString() : null,
  }));
}

export interface InsiderSummary {
  symbol: string;
  windowDays: number;
  totalTransactions: number;
  buys: { count: number; shares: number; value: number };
  sells: { count: number; shares: number; value: number };
  uniqueInsiders: number;
  latestTransactionDate: string | null;
}

export async function insiderSummary(symbol: string, windowDays = 90): Promise<InsiderSummary> {
  const rows = await q<{
    transaction_code: string | null; shares: string | null;
    total_value: string | null; reporter_cik: string | null;
    transaction_date: Date;
  }>(
    `SELECT transaction_code, shares::text, total_value::text, reporter_cik, transaction_date
       FROM insider_transactions
      WHERE symbol = $1
        AND transaction_date >= CURRENT_DATE - ($2::int * INTERVAL '1 day')`,
    [symbol.toUpperCase(), windowDays],
  );
  const buys = { count: 0, shares: 0, value: 0 };
  const sells = { count: 0, shares: 0, value: 0 };
  const insiders = new Set<string>();
  let latest: Date | null = null;
  for (const r of rows) {
    if (r.reporter_cik) insiders.add(r.reporter_cik);
    if (!latest || r.transaction_date > latest) latest = r.transaction_date;
    const sh = r.shares ? Number(r.shares) : 0;
    const val = r.total_value ? Number(r.total_value) : 0;
    if (r.transaction_code === 'P') { buys.count++; buys.shares += sh; buys.value += val; }
    else if (r.transaction_code === 'S') { sells.count++; sells.shares += sh; sells.value += val; }
  }
  return {
    symbol: symbol.toUpperCase(),
    windowDays,
    totalTransactions: rows.length,
    buys, sells,
    uniqueInsiders: insiders.size,
    latestTransactionDate: latest ? latest.toISOString().slice(0, 10) : null,
  };
}
