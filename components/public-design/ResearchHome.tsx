import Link from 'next/link';
import { PUBLIC_DESTINATIONS } from '@/lib/publicDesign';
import styles from './PublicDesign.module.css';

export default function ResearchHome() {
  return <div className={styles.home}>
    <section className={styles.hero}><div><p className={styles.eyebrow}>Evidence first. Explanation second.</p><h1>See the market.<br/>Understand the evidence.</h1><p className={styles.lead}>A considered space for symbol research, macro context and your own thinking. Explore observations, understand their limits and keep your reasoning connected.</p><div className={styles.actions}><Link href="/auth?next=%2Ftools%2Fcommand-center" className={styles.primary}>Start researching ↗</Link><Link href="/tools/golden-egg" className={styles.secondary}>Explore Symbol research</Link></div><p className={styles.note}>Review current access and allowances on the <Link href="/pricing">pricing page</Link>.</p></div>
    <div className={styles.researchPreview} aria-label="Research workflow"><p className={styles.eyebrow}>A clearer research process</p><h2>From a question to understanding.</h2>{[
      ['01','Inspect the observation','Start with the value, its source and the period it describes.'],
      ['02','Check what is missing','A missing reading stays unavailable. It is left blank, and it is not filled in as zero.'],
      ['03','Keep your reasoning','Record what you observed separately from what you expected.'],
    ].map(([step,title,description])=><div className={styles.previewRow} key={step}><span>{step}</span><div><h3>{title}</h3><p>{description}</p></div></div>)}</div></section>
    <section className={styles.section}><h2>One workspace. A clear path through it.</h2><div className={styles.steps}><div><p className={styles.eyebrow}>Observe</p><h3>Investigate a symbol.</h3><p>Explore price, comparisons and the evidence available for the asset you are researching.</p></div><div><p className={styles.eyebrow}>Understand</p><h3>Look at the wider picture.</h3><p>Read macro and liquidity observations with their own dates, definitions and limitations.</p></div><div><p className={styles.eyebrow}>Reflect</p><h3>Connect research to your records.</h3><p>Move between your portfolio, journal and the concepts behind the measurements.</p></div></div></section>
    <section className={styles.section}><h2>Choose your starting point.</h2><nav className={styles.destinations} aria-label="Explore research">{PUBLIC_DESTINATIONS.map(item=><Link key={item.label} href={item.href}>{item.label} ↗</Link>)}</nav><p className={styles.note} style={{marginTop:20}}>Educational research, not a recommendation to buy, sell or hold. Read the <Link href="/disclaimer">research and risk disclosure</Link>.</p></section>
  </div>;
}
