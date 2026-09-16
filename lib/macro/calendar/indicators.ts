import type { CanonicalIndicatorId, CountryCode, EventCategory, HigherMeans, Importance, IndicatorDefinition } from './types';

const SRC = {
  BLS: ['U.S. Bureau of Labor Statistics', 'https://www.bls.gov/schedule/news_release/'],
  BEA: ['U.S. Bureau of Economic Analysis', 'https://www.bea.gov/news/schedule'],
  FED: ['Federal Reserve', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'],
  ISM: ['Institute for Supply Management', 'https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/'],
  CENSUS: ['U.S. Census Bureau', 'https://www.census.gov/retail/'],
  STAT_JP: ['Statistics Bureau of Japan', 'https://www.stat.go.jp/english/data/cpi/'],
  BOJ: ['Bank of Japan', 'https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm'],
  MHLW: ['Ministry of Health, Labour and Welfare (Japan)', 'https://www.mhlw.go.jp/english/database/db-l/monthly-labour.html'],
  CAO_JP: ['Cabinet Office (Japan)', 'https://www.esri.cao.go.jp/en/sna/menu.html'],
  METI: ['Ministry of Economy, Trade and Industry (Japan)', 'https://www.meti.go.jp/english/statistics/'],
  JIBUN: ['S&P Global / au Jibun Bank', 'https://www.pmi.spglobal.com/'],
  EUROSTAT: ['Eurostat', 'https://ec.europa.eu/eurostat/web/main/news/release-calendar'],
  ECB: ['European Central Bank', 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html'],
  HCOB: ['S&P Global / HCOB', 'https://www.pmi.spglobal.com/'],
  ONS: ['Office for National Statistics', 'https://www.ons.gov.uk/releasecalendar'],
  BOE: ['Bank of England', 'https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates'],
  CIPS: ['S&P Global / CIPS', 'https://www.pmi.spglobal.com/'],
  ABS: ['Australian Bureau of Statistics', 'https://www.abs.gov.au/release-calendar/future-releases'],
  RBA: ['Reserve Bank of Australia', 'https://www.rba.gov.au/schedules-events/'],
  STATCAN: ['Statistics Canada', 'https://www.statcan.gc.ca/en/dai/sched'],
  BOC: ['Bank of Canada', 'https://www.bankofcanada.ca/press/upcoming-events/'],
  NBS: ['National Bureau of Statistics of China', 'https://www.stats.gov.cn/english/PressRelease/'],
  PBOC: ["People's Bank of China", 'http://www.pbc.gov.cn/en/3688229/index.html'],
  CAIXIN: ['S&P Global / Caixin', 'https://www.pmi.spglobal.com/'],
  STATSNZ: ['Stats NZ', 'https://www.stats.govt.nz/release-calendar/'],
  RBNZ: ['Reserve Bank of New Zealand', 'https://www.rbnz.govt.nz/monetary-policy/about-monetary-policy/monetary-policy-dates'],
  FSO: ['Swiss Federal Statistical Office', 'https://www.bfs.admin.ch/bfs/en/home/statistics/prices.html'],
  SNB: ['Swiss National Bank', 'https://www.snb.ch/en/the-snb/mandates-goals/monetary-policy/monetary-policy-assessments'],
  KOSTAT: ['Statistics Korea', 'https://kostat.go.kr/anse/'],
  BOK: ['Bank of Korea', 'https://www.bok.or.kr/eng/main/main.do'],
  MOSPI: ['Ministry of Statistics and Programme Implementation (India)', 'https://www.mospi.gov.in/'],
  RBI: ['Reserve Bank of India', 'https://www.rbi.org.in/'],
} as const;

type SrcKey = keyof typeof SRC;

type Def = Omit<IndicatorDefinition, 'id' | 'countryCode'>;

function def(
  name: string,
  category: EventCategory,
  importance: Importance,
  unit: string | null,
  higherMeans: HigherMeans,
  surpriseScale: number | null,
  src: SrcKey,
  match: string[][],
  tags?: string[],
): Def {
  return { name, category, importance, unit, higherMeans, surpriseScale, source: SRC[src][0], sourceUrl: SRC[src][1], match, tags };
}

/**
 * Indicator registry keyed by canonical indicator id (`<CC>_<FAMILY>_<VARIANT>_<BASIS>`).
 * Canonical ids are the cross-provider join key: two provider rows describe the
 * same release only if they resolve to the same id (plus country + reference
 * period). Names alone never merge.
 *
 * `higherMeans` encodes the policy reading of a positive surprise — this is
 * the guard against "higher = bullish" assumptions.
 */
export const INDICATORS: Record<string, Def> = {
  // ───────────── United States ─────────────
  US_CPI_HEADLINE_YOY: def('CPI YoY', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'BLS', [['cpi', 'yoy', '!core'], ['inflation rate', 'yoy', '!core']]),
  US_CPI_HEADLINE_MOM: def('CPI MoM', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'BLS', [['cpi', 'mom', '!core'], ['inflation rate', 'mom', '!core']]),
  US_CPI_CORE_YOY: def('Core CPI YoY', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'BLS', [['core', 'inflation', 'yoy'], ['core', 'cpi', 'yoy']]),
  US_CPI_CORE_MOM: def('Core CPI MoM', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'BLS', [['core', 'inflation', 'mom'], ['core', 'cpi', 'mom']]),
  US_PCE_HEADLINE_YOY: def('PCE Price Index YoY', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'BEA', [['pce price index', 'yoy', '!core']]),
  US_PCE_CORE_YOY: def('Core PCE Price Index YoY', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'BEA', [['core pce', 'yoy']]),
  US_PCE_CORE_MOM: def('Core PCE Price Index MoM', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'BEA', [['core pce', 'mom']]),
  US_FOMC_RATE_DECISION: def('FOMC Rate Decision', 'central_bank', 'high', '%', 'HAWKISH', 0.25, 'FED', [['fed interest rate decision'], ['fomc'], ['fed funds rate', 'decision']]),
  US_NFP: def('Non-Farm Payrolls', 'employment', 'high', 'K', 'HAWKISH', 50, 'BLS', [['non farm payrolls'], ['nonfarm payrolls']]),
  US_UNEMPLOYMENT_RATE: def('Unemployment Rate', 'employment', 'high', '%', 'DOVISH', 0.1, 'BLS', [['unemployment rate']]),
  US_GDP_QOQ_ADVANCE: def('GDP Growth Rate QoQ (Advance)', 'gdp', 'high', '%', 'HAWKISH', 0.3, 'BEA', [['gdp growth rate', 'adv']]),
  US_GDP_QOQ_SECOND: def('GDP Growth Rate QoQ (Second Estimate)', 'gdp', 'medium', '%', 'HAWKISH', 0.2, 'BEA', [['gdp growth rate', '2nd']]),
  US_GDP_QOQ_FINAL: def('GDP Growth Rate QoQ (Final)', 'gdp', 'medium', '%', 'HAWKISH', 0.2, 'BEA', [['gdp growth rate', 'final']]),
  US_ISM_MFG_PMI: def('ISM Manufacturing PMI', 'manufacturing', 'high', 'index', 'HAWKISH', 1.0, 'ISM', [['ism manufacturing pmi']]),
  US_ISM_SERVICES_PMI: def('ISM Services PMI', 'pmi', 'high', 'index', 'HAWKISH', 1.0, 'ISM', [['ism services pmi'], ['ism non-manufacturing pmi']]),
  US_RETAIL_SALES_MOM: def('Retail Sales MoM', 'consumer', 'medium', '%', 'HAWKISH', 0.3, 'CENSUS', [['retail sales', 'mom']]),

  // ───────────── Japan ─────────────
  // Tokyo and National CPI are distinct series and must never share an id.
  JP_CPI_NATIONAL_HEADLINE_YOY: def('National CPI YoY', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'STAT_JP', [['inflation rate', 'yoy', '!core', '!tokyo'], ['national cpi', 'yoy', '!core', '!tokyo']]),
  JP_CPI_NATIONAL_CORE_YOY: def('National Core CPI YoY (ex-fresh food)', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'STAT_JP', [['core inflation rate', 'yoy', '!tokyo'], ['national core cpi', 'yoy', '!tokyo']]),
  JP_CPI_NATIONAL_CORECORE_YOY: def('National Core-Core CPI YoY (ex-fresh food & energy)', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'STAT_JP', [['cpi ex food and energy', 'yoy', '!tokyo'], ['core core', '!tokyo']]),
  JP_CPI_TOKYO_HEADLINE_YOY: def('Tokyo CPI YoY', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'STAT_JP', [['tokyo cpi', 'yoy', '!core', '!ex food']], ['LEADING INFLATION SIGNAL']),
  JP_CPI_TOKYO_CORE_YOY: def('Tokyo Core CPI YoY (ex-fresh food)', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'STAT_JP', [['tokyo core cpi', 'yoy']], ['LEADING INFLATION SIGNAL']),
  JP_CPI_TOKYO_CORECORE_YOY: def('Tokyo Core-Core CPI YoY (ex-fresh food & energy)', 'inflation', 'medium', '%', 'HAWKISH', 0.1, 'STAT_JP', [['tokyo cpi ex food and energy', 'yoy']], ['LEADING INFLATION SIGNAL']),
  JP_BOJ_RATE_DECISION: def('BoJ Interest Rate Decision', 'central_bank', 'high', '%', 'HAWKISH', 0.1, 'BOJ', [['boj interest rate decision'], ['boj', 'rate decision']]),
  JP_BOJ_OUTLOOK_REPORT: def('BoJ Outlook Report (Projections)', 'central_bank', 'high', null, 'HAWKISH', null, 'BOJ', [['boj quarterly outlook report'], ['boj outlook']]),
  JP_CASH_EARNINGS_YOY: def('Labor Cash Earnings YoY', 'wages', 'medium', '%', 'HAWKISH', 0.3, 'MHLW', [['average cash earnings', 'yoy'], ['cash earnings', 'yoy']]),
  JP_UNEMPLOYMENT_RATE: def('Unemployment Rate', 'employment', 'medium', '%', 'DOVISH', 0.1, 'STAT_JP', [['unemployment rate']]),
  JP_GDP_QOQ_PRELIM: def('GDP Growth Rate QoQ (Preliminary)', 'gdp', 'high', '%', 'HAWKISH', 0.2, 'CAO_JP', [['gdp growth rate', 'qoq', 'prel']]),
  JP_GDP_QOQ_FINAL: def('GDP Growth Rate QoQ (Final)', 'gdp', 'medium', '%', 'HAWKISH', 0.2, 'CAO_JP', [['gdp growth rate', 'qoq', 'final']]),
  JP_JIBUN_MFG_PMI_FLASH: def('au Jibun Bank Manufacturing PMI Flash', 'pmi', 'medium', 'index', 'HAWKISH', 0.8, 'JIBUN', [['jibun bank manufacturing pmi', 'flash']]),
  JP_RETAIL_SALES_YOY: def('Retail Sales YoY', 'consumer', 'medium', '%', 'HAWKISH', 0.5, 'METI', [['retail sales', 'yoy']]),

  // ───────────── Eurozone ─────────────
  EU_HICP_FLASH_HEADLINE_YOY: def('HICP Flash YoY', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'EUROSTAT', [['inflation rate', 'yoy', 'flash', '!core']]),
  EU_HICP_FLASH_CORE_YOY: def('Core HICP Flash YoY', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'EUROSTAT', [['core inflation rate', 'yoy', 'flash']]),
  EU_HICP_FINAL_HEADLINE_YOY: def('HICP Final YoY', 'inflation', 'medium', '%', 'HAWKISH', 0.1, 'EUROSTAT', [['inflation rate', 'yoy', 'final', '!core']]),
  EU_HICP_FINAL_CORE_YOY: def('Core HICP Final YoY', 'inflation', 'medium', '%', 'HAWKISH', 0.1, 'EUROSTAT', [['core inflation rate', 'yoy', 'final']]),
  EU_ECB_RATE_DECISION: def('ECB Interest Rate Decision', 'central_bank', 'high', '%', 'HAWKISH', 0.25, 'ECB', [['ecb interest rate decision'], ['ecb deposit facility rate']]),
  EU_UNEMPLOYMENT_RATE: def('Unemployment Rate', 'employment', 'medium', '%', 'DOVISH', 0.1, 'EUROSTAT', [['unemployment rate']]),
  EU_GDP_QOQ_FLASH: def('GDP Growth Rate QoQ (Flash)', 'gdp', 'high', '%', 'HAWKISH', 0.2, 'EUROSTAT', [['gdp growth rate', 'qoq', 'flash']]),
  EU_HCOB_COMPOSITE_PMI_FLASH: def('HCOB Composite PMI Flash', 'pmi', 'medium', 'index', 'HAWKISH', 0.8, 'HCOB', [['hcob composite pmi', 'flash']]),
  EU_HCOB_MFG_PMI_FLASH: def('HCOB Manufacturing PMI Flash', 'pmi', 'medium', 'index', 'HAWKISH', 0.8, 'HCOB', [['hcob manufacturing pmi', 'flash']]),
  EU_RETAIL_SALES_MOM: def('Retail Sales MoM', 'consumer', 'medium', '%', 'HAWKISH', 0.3, 'EUROSTAT', [['retail sales', 'mom']]),

  // ───────────── United Kingdom ─────────────
  UK_CPI_HEADLINE_YOY: def('CPI YoY', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'ONS', [['inflation rate', 'yoy', '!core', '!services', '!retail price']]),
  UK_CPI_HEADLINE_MOM: def('CPI MoM', 'inflation', 'medium', '%', 'HAWKISH', 0.1, 'ONS', [['inflation rate', 'mom', '!core', '!retail price']]),
  UK_CPI_CORE_YOY: def('Core CPI YoY', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'ONS', [['core inflation rate', 'yoy']]),
  UK_CPI_SERVICES_YOY: def('Services CPI YoY', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'ONS', [['services inflation', 'yoy'], ['cpi services', 'yoy']]),
  UK_BOE_RATE_DECISION: def('BoE Interest Rate Decision', 'central_bank', 'high', '%', 'HAWKISH', 0.25, 'BOE', [['boe interest rate decision']]),
  UK_UNEMPLOYMENT_RATE: def('Unemployment Rate (ILO)', 'employment', 'medium', '%', 'DOVISH', 0.1, 'ONS', [['unemployment rate']]),
  UK_AVG_EARNINGS_YOY: def('Average Earnings incl. Bonus (3m/YoY)', 'wages', 'high', '%', 'HAWKISH', 0.2, 'ONS', [['average earnings incl. bonus']]),
  UK_GDP_MOM: def('GDP MoM', 'gdp', 'medium', '%', 'HAWKISH', 0.2, 'ONS', [['gdp', 'mom']]),
  UK_GDP_QOQ_PRELIM: def('GDP Growth Rate QoQ (Preliminary)', 'gdp', 'high', '%', 'HAWKISH', 0.2, 'ONS', [['gdp growth rate', 'qoq', 'prel']]),
  UK_PMI_MFG_FLASH: def('S&P Global/CIPS Manufacturing PMI Flash', 'pmi', 'medium', 'index', 'HAWKISH', 0.8, 'CIPS', [['manufacturing pmi', 'flash']]),
  UK_RETAIL_SALES_MOM: def('Retail Sales MoM', 'consumer', 'medium', '%', 'HAWKISH', 0.4, 'ONS', [['retail sales', 'mom']]),

  // ───────────── Australia ─────────────
  AU_CPI_MONTHLY_HEADLINE_YOY: def('Monthly CPI Indicator YoY', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'ABS', [['monthly cpi indicator']]),
  AU_CPI_TRIMMED_MEAN_QOQ: def('Trimmed Mean CPI QoQ', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'ABS', [['rba trimmed mean cpi', 'qoq'], ['trimmed mean', 'qoq']]),
  AU_CPI_HEADLINE_QOQ: def('CPI QoQ', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'ABS', [['inflation rate', 'qoq', '!trimmed']]),
  AU_RBA_RATE_DECISION: def('RBA Interest Rate Decision', 'central_bank', 'high', '%', 'HAWKISH', 0.25, 'RBA', [['rba interest rate decision']]),
  AU_EMPLOYMENT_CHANGE: def('Employment Change', 'employment', 'high', 'K', 'HAWKISH', 20, 'ABS', [['employment change']]),
  AU_UNEMPLOYMENT_RATE: def('Unemployment Rate', 'employment', 'high', '%', 'DOVISH', 0.1, 'ABS', [['unemployment rate']]),
  AU_GDP_QOQ: def('GDP Growth Rate QoQ', 'gdp', 'high', '%', 'HAWKISH', 0.2, 'ABS', [['gdp growth rate', 'qoq']]),
  AU_HOUSEHOLD_SPENDING_MOM: def('Monthly Household Spending Indicator MoM', 'consumer', 'medium', '%', 'HAWKISH', 0.3, 'ABS', [['household spending', 'mom'], ['retail sales', 'mom']]),
  AU_PMI_MFG_FLASH: def('S&P Global Manufacturing PMI Flash', 'pmi', 'low', 'index', 'HAWKISH', 0.8, 'JIBUN', [['manufacturing pmi', 'flash']]),

  // ───────────── Canada ─────────────
  CA_CPI_HEADLINE_YOY: def('CPI YoY', 'inflation', 'high', '%', 'HAWKISH', 0.1, 'STATCAN', [['inflation rate', 'yoy', '!core', '!median', '!trim', '!common']]),
  CA_CPI_MEDIAN_YOY: def('CPI Median YoY', 'inflation', 'medium', '%', 'HAWKISH', 0.1, 'STATCAN', [['cpi median']]),
  CA_CPI_TRIM_YOY: def('CPI Trim YoY', 'inflation', 'medium', '%', 'HAWKISH', 0.1, 'STATCAN', [['cpi trimmed-mean'], ['cpi trim']]),
  CA_CPI_COMMON_YOY: def('CPI Common YoY', 'inflation', 'low', '%', 'HAWKISH', 0.1, 'STATCAN', [['cpi common']]),
  CA_BOC_RATE_DECISION: def('BoC Interest Rate Decision', 'central_bank', 'high', '%', 'HAWKISH', 0.25, 'BOC', [['boc interest rate decision']]),
  CA_EMPLOYMENT_CHANGE: def('Employment Change', 'employment', 'high', 'K', 'HAWKISH', 20, 'STATCAN', [['employment change']]),
  CA_UNEMPLOYMENT_RATE: def('Unemployment Rate', 'employment', 'high', '%', 'DOVISH', 0.1, 'STATCAN', [['unemployment rate']]),
  CA_GDP_MOM: def('GDP MoM', 'gdp', 'medium', '%', 'HAWKISH', 0.2, 'STATCAN', [['gdp', 'mom']]),
  CA_GDP_QOQ_ANNUALIZED: def('GDP Growth Rate Annualized', 'gdp', 'high', '%', 'HAWKISH', 0.5, 'STATCAN', [['gdp growth rate annualized']]),
  CA_RETAIL_SALES_MOM: def('Retail Sales MoM', 'consumer', 'medium', '%', 'HAWKISH', 0.4, 'STATCAN', [['retail sales', 'mom']]),
  CA_PMI_MFG: def('S&P Global Manufacturing PMI', 'pmi', 'low', 'index', 'HAWKISH', 0.8, 'JIBUN', [['manufacturing pmi']]),

  // ───────────── China ─────────────
  CN_CPI_HEADLINE_YOY: def('CPI YoY', 'inflation', 'high', '%', 'HAWKISH', 0.2, 'NBS', [['inflation rate', 'yoy', '!core']]),
  CN_CPI_HEADLINE_MOM: def('CPI MoM', 'inflation', 'medium', '%', 'HAWKISH', 0.2, 'NBS', [['inflation rate', 'mom', '!core']]),
  CN_PPI_YOY: def('PPI YoY', 'inflation', 'high', '%', 'HAWKISH', 0.3, 'NBS', [['ppi', 'yoy']]),
  CN_PBOC_LPR_1Y: def('PBoC 1-Year Loan Prime Rate', 'central_bank', 'high', '%', 'HAWKISH', 0.1, 'PBOC', [['loan prime rate 1y']]),
  CN_PBOC_LPR_5Y: def('PBoC 5-Year Loan Prime Rate', 'central_bank', 'medium', '%', 'HAWKISH', 0.1, 'PBOC', [['loan prime rate 5y']]),
  CN_NBS_MFG_PMI: def('NBS Manufacturing PMI', 'pmi', 'high', 'index', 'HAWKISH', 0.5, 'NBS', [['nbs manufacturing pmi']]),
  CN_CAIXIN_MFG_PMI: def('Caixin Manufacturing PMI', 'pmi', 'medium', 'index', 'HAWKISH', 0.5, 'CAIXIN', [['caixin manufacturing pmi'], ['ratingdog manufacturing pmi']]),
  CN_GDP_YOY: def('GDP Growth Rate YoY', 'gdp', 'high', '%', 'HAWKISH', 0.2, 'NBS', [['gdp growth rate', 'yoy']]),
  CN_RETAIL_SALES_YOY: def('Retail Sales YoY', 'consumer', 'medium', '%', 'HAWKISH', 0.5, 'NBS', [['retail sales', 'yoy']]),
  CN_INDUSTRIAL_PRODUCTION_YOY: def('Industrial Production YoY', 'manufacturing', 'medium', '%', 'HAWKISH', 0.5, 'NBS', [['industrial production', 'yoy']]),
  CN_UNEMPLOYMENT_RATE: def('Surveyed Unemployment Rate', 'employment', 'low', '%', 'DOVISH', 0.1, 'NBS', [['unemployment rate']]),

  // ───────────── New Zealand ─────────────
  NZ_CPI_HEADLINE_QOQ: def('CPI QoQ', 'inflation', 'high', '%', 'HAWKISH', 0.2, 'STATSNZ', [['inflation rate', 'qoq', '!tradable']]),
  NZ_CPI_HEADLINE_YOY: def('CPI YoY', 'inflation', 'high', '%', 'HAWKISH', 0.2, 'STATSNZ', [['inflation rate', 'yoy', '!tradable']]),
  NZ_CPI_NONTRADABLE_QOQ: def('Non-Tradable CPI QoQ', 'inflation', 'medium', '%', 'HAWKISH', 0.2, 'STATSNZ', [['non-tradable', 'cpi'], ['non tradable', 'cpi']]),
  NZ_RBNZ_OCR_DECISION: def('RBNZ Official Cash Rate Decision', 'central_bank', 'high', '%', 'HAWKISH', 0.25, 'RBNZ', [['rbnz interest rate decision']]),
  NZ_UNEMPLOYMENT_RATE: def('Unemployment Rate (Quarterly)', 'employment', 'high', '%', 'DOVISH', 0.1, 'STATSNZ', [['unemployment rate']]),
  NZ_EMPLOYMENT_CHANGE_QOQ: def('Employment Change QoQ', 'employment', 'medium', '%', 'HAWKISH', 0.3, 'STATSNZ', [['employment change', 'qoq']]),
  NZ_GDP_QOQ: def('GDP Growth Rate QoQ', 'gdp', 'high', '%', 'HAWKISH', 0.3, 'STATSNZ', [['gdp growth rate', 'qoq']]),
  NZ_RETAIL_SALES_QOQ: def('Retail Sales QoQ', 'consumer', 'medium', '%', 'HAWKISH', 0.5, 'STATSNZ', [['retail sales', 'qoq']]),

  // ───────────── Switzerland ─────────────
  CH_CPI_HEADLINE_YOY: def('CPI YoY', 'inflation', 'medium', '%', 'HAWKISH', 0.1, 'FSO', [['inflation rate', 'yoy', '!core']]),
  CH_SNB_RATE_DECISION: def('SNB Policy Rate Decision', 'central_bank', 'high', '%', 'HAWKISH', 0.25, 'SNB', [['snb interest rate decision']]),
  CH_GDP_QOQ: def('GDP Growth Rate QoQ', 'gdp', 'medium', '%', 'HAWKISH', 0.2, 'FSO', [['gdp growth rate', 'qoq']]),
  CH_UNEMPLOYMENT_RATE: def('Unemployment Rate', 'employment', 'low', '%', 'DOVISH', 0.1, 'FSO', [['unemployment rate']]),
  CH_PMI_MFG: def('procure.ch Manufacturing PMI', 'pmi', 'low', 'index', 'HAWKISH', 1.0, 'FSO', [['manufacturing pmi']]),

  // ───────────── South Korea ─────────────
  KR_CPI_HEADLINE_YOY: def('CPI YoY', 'inflation', 'medium', '%', 'HAWKISH', 0.1, 'KOSTAT', [['inflation rate', 'yoy', '!core']]),
  KR_BOK_RATE_DECISION: def('BoK Base Rate Decision', 'central_bank', 'medium', '%', 'HAWKISH', 0.25, 'BOK', [['interest rate decision']]),
  KR_GDP_QOQ_ADVANCE: def('GDP Growth Rate QoQ (Advance)', 'gdp', 'medium', '%', 'HAWKISH', 0.2, 'BOK', [['gdp growth rate', 'qoq', 'adv']]),

  // ───────────── India ─────────────
  IN_CPI_HEADLINE_YOY: def('CPI YoY', 'inflation', 'medium', '%', 'HAWKISH', 0.2, 'MOSPI', [['inflation rate', 'yoy', '!core', '!wpi']]),
  IN_RBI_RATE_DECISION: def('RBI Repo Rate Decision', 'central_bank', 'medium', '%', 'HAWKISH', 0.25, 'RBI', [['rbi interest rate decision']]),
  IN_GDP_YOY: def('GDP Growth Rate YoY', 'gdp', 'medium', '%', 'HAWKISH', 0.4, 'MOSPI', [['gdp growth rate', 'yoy']]),
};

export function countryOfIndicator(id: string): CountryCode {
  return id.slice(0, 2) as CountryCode;
}

export function getIndicator(id: CanonicalIndicatorId): IndicatorDefinition | null {
  const d = INDICATORS[id];
  return d ? { id, countryCode: countryOfIndicator(id), ...d } : null;
}

export function indicatorIdsFor(countryCode: CountryCode): CanonicalIndicatorId[] {
  return Object.keys(INDICATORS).filter((k) => k.startsWith(`${countryCode}_`));
}

/** Deterministic id for provider rows that do not map to the registry. */
export function unmappedIndicatorId(countryCode: CountryCode, providerEvent: string): CanonicalIndicatorId {
  const slug = providerEvent.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `${countryCode}_UNMAPPED_${slug || 'EVENT'}`;
}

export function isUnmappedIndicator(id: CanonicalIndicatorId): boolean {
  return id.includes('_UNMAPPED_');
}

/**
 * Match a provider (category + event) label to a canonical id for the country.
 * Rule tokens are lower-case substrings that must all be present; tokens
 * prefixed with `!` must be absent. Rules with more positive tokens win, then
 * longer rules.
 */
export function matchIndicator(countryCode: CountryCode, providerEvent: string, providerCategory?: string): CanonicalIndicatorId | null {
  const haystack = `${providerCategory ?? ''} ${providerEvent}`.toLowerCase();
  const candidates = Object.entries(INDICATORS)
    .filter(([k]) => k.startsWith(`${countryCode}_`))
    .flatMap(([k, d]) => (d.match ?? []).map((rule) => ({ id: k, rule })))
    .sort((a, b) => {
      const ap = a.rule.filter((t) => !t.startsWith('!')).length;
      const bp = b.rule.filter((t) => !t.startsWith('!')).length;
      return bp - ap || b.rule.join(' ').length - a.rule.join(' ').length;
    });

  for (const { id, rule } of candidates) {
    const ok = rule.every((kw) => (kw.startsWith('!') ? !haystack.includes(kw.slice(1)) : haystack.includes(kw)));
    if (ok) return id;
  }
  return null;
}

/** Map an arbitrary provider category label to our category set. */
export function categoryFromProvider(category: string, event: string): EventCategory {
  const h = `${category} ${event}`.toLowerCase();
  if (h.includes('interest rate') || h.includes('rate decision') || h.includes('monetary policy') || h.includes('loan prime')) return 'central_bank';
  if (h.includes('inflation') || h.includes('cpi') || h.includes('ppi') || h.includes('pce') || h.includes('hicp')) return 'inflation';
  if (h.includes('earnings') || h.includes('wage')) return 'wages';
  if (h.includes('employment') || h.includes('payroll') || h.includes('jobless') || h.includes('unemployment')) return 'employment';
  if (h.includes('gdp')) return 'gdp';
  if (h.includes('pmi')) return 'pmi';
  if (h.includes('retail') || h.includes('consumer') || h.includes('household')) return 'consumer';
  if (h.includes('industrial') || h.includes('manufacturing')) return 'manufacturing';
  return 'other';
}
