"use client";
import Link from 'next/link';
import { PLAN_PRICES } from '@/lib/planPrices';
import { PUBLIC_DAILY_LIMITS, PUBLIC_FREE_RECORD_LIMITS } from '@/lib/publicPlans';
import styles from './ResearchAccount.module.css';

type Props = {
  cycle: 'monthly' | 'yearly'; onCycle: (cycle: 'monthly' | 'yearly') => void;
  onChoose: (plan: 'free' | 'pro') => void; loading: string | null; error: string | null;
  tier: string | null; quotasEnabled: boolean | null;
};
export default function ResearchPricing({cycle,onCycle,onChoose,loading,error,tier,quotasEnabled}: Props) {
  const paid = tier === 'pro' || tier === 'pro_trader';
  return <section className={styles.root} data-research-pricing>
    <header className={styles.hero}><p className={styles.eyebrow}>MEMBERSHIP / RESEARCH WITH CONTEXT</p>
      <h1>Understand more.<br/><span>Make room for perspective.</span></h1>
      <p>Start with the evidence. Choose Pro for deeper research and more room to keep track.</p>
    </header>
    <div className={styles.billing} role="group" aria-label="Billing period">
      {(['monthly','yearly'] as const).map(value=><button key={value} aria-pressed={cycle===value} onClick={()=>onCycle(value)}>{value==='monthly'?'Monthly':'Annual'}</button>)}
      <span>All prices in US dollars</span>
    </div>
    {error && <p role="alert" className={styles.notice}>{error}</p>}
    <div className={styles.plans}>
      <article className={styles.card}><p className={styles.eyebrow}>01 / BUILD YOUR RESEARCH HABIT</p><h2>Free</h2>
        <p className={styles.price}>US$0 <small>/ month</small></p><p>Explore, record and learn at your own pace.</p>
        <button className={styles.secondary} disabled={!!loading} onClick={()=>onChoose('free')}>{tier?'Open Overview':'Create a free account'}</button>
        <p className={styles.fine}>No card needed for Free.</p>
        <ul>
          <li>Overview and Daily Radar highlights</li>
          {quotasEnabled===true && <li>{PUBLIC_DAILY_LIMITS.free.symbol} Symbol reports per day</li>}
          <li>Macro and Global M2 summaries, plus Learning basics</li>
          <li>Portfolio tracker: {PUBLIC_FREE_RECORD_LIMITS.positions} open positions</li>
          <li>Journal: {PUBLIC_FREE_RECORD_LIMITS.openJournalEntries} open entries</li>
          <li>Sources, observation dates and missing-data notes where supplied</li>
        </ul>
      </article>
      <article className={`${styles.card} ${styles.pro}`}><p className={styles.eyebrow}>02 / GO DEEPER</p><h2>Pro</h2>
        <p className={styles.price}>US{cycle==='monthly'?PLAN_PRICES.pro.monthly:PLAN_PRICES.pro.yearly} <small>/ {cycle==='monthly'?'month':'year'}</small></p>
        <p>{cycle==='yearly'?`Billed annually. Equivalent to US$${(PLAN_PRICES.pro.yearlyRaw/12).toFixed(2)} a month.`:'Billed monthly. Review the total before subscribing.'}</p>
        {paid?<Link className={styles.primary} href="/account">Manage your Pro plan</Link>:<button className={styles.primary} disabled={!!loading} onClick={()=>onChoose('pro')}>{loading==='pro'?'Opening checkout…':'Continue to Pro checkout'}</button>}
        <p className={styles.fine}>Subscription details are shown at checkout.</p>
        <p className={styles.fine}>Pro includes a 7-day free trial, matching the <Link href="/terms">Terms</Link>.</p>
        <ul>
          {quotasEnabled===true && <li>Unlimited Symbol reports</li>}
          <li>Options research</li>
          <li>Stored M2 history by economic bloc</li>
          <li>Portfolio and Journal advanced analysis</li>
          <li>Unlimited open portfolio positions and journal entries</li>
          <li>Exports and paid workspace tools</li>
          {quotasEnabled===true && <li>Educational MSP Copilot: {PUBLIC_DAILY_LIMITS.pro.ai} questions per day</li>}
        </ul>
      </article>
    </div>
    <section className={styles.details}><h2>Clear limits. Clear context.</h2>
      {quotasEnabled===true && <details><summary>How are Symbol reports counted?</summary><p>One new symbol uses one report that day. Reopening, refreshing or changing sections on that symbol does not use another. Signed-out visitors get one daily report. Limits reset at midnight US Eastern; your report counter shows the reset in your local time.</p></details>}
      <details><summary>What happens to my records if I downgrade?</summary><p>Your saved records are kept. Free limits new open entries and positions; close existing records to make room. Pro adds advanced analysis and exports.</p></details>
      <details><summary>Can I cancel anytime?</summary><p>Yes. Access lasts until the end of the current billing period. Cancel from Account &gt; Manage Billing.</p></details>
      <details><summary>Do you offer refunds?</summary><p>If you are not satisfied with your subscription, you may request a full refund within 7 days of your first payment. This guarantee applies to first-time subscribers only.</p></details>
      <details><summary>Do you provide financial advice?</summary><p>No. General information only, not financial advice.</p></details>
      <p className={styles.fine}>Read our <Link href="/terms">terms</Link>, <Link href="/privacy">privacy policy</Link>, <Link href="/refund-policy">refund policy</Link> and <Link href="/disclaimer">research disclosure</Link>. <Link href="/contact">Contact support</Link> for account help.</p>
    </section>
  </section>;
}
