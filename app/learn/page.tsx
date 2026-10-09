import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicDesignEnabled } from '@/lib/publicDesign';
import styles from '@/components/public-design/PublicDesign.module.css';

export const metadata={title:'Learning',description:'Understand market measurements, observation dates and the limits of research evidence.'};
const lessons=[
  {title:'Correlation versus performance',body:'Performance describes a change over a period. Correlation describes how paired returns move together. Two assets can have a positive correlation and different total returns. Correlation does not establish causation or predict the next move.',href:'/tools/golden-egg',link:'Explore Symbol comparisons'},
  {title:'What Bollinger band width percentile measures',body:'BBWP places current band width within a historical sample. A low percentile describes relatively narrow bands within that sample. It does not, by itself, identify a future price direction. Look at the timeframe, lookback and available history before interpreting a reading.',href:'/tools/golden-egg',link:'Explore volatility evidence'},
  {title:'Reading dates and missing data',body:'Observation time belongs to the measured value. Publication time is when it was released. Capture time is when a platform retrieved or assembled it. A recent capture does not make an older observation current. Missing values must remain unavailable rather than being filled with zero.',href:'/tools/macro',link:'Explore Macro Outlook'},
  {title:'Open interest is not trading intent',body:'Open interest counts outstanding contracts. Volume counts contracts traded over a period. Neither measurement alone identifies who initiated a position or why. Expiry selection and contract coverage matter when comparing totals or put/call ratios.',href:'/tools/golden-egg',link:'Explore Symbol evidence'},
  {title:'Portfolio value versus investment return',body:'Deposits, withdrawals and changes in asset prices can all change portfolio value. Comparing value with net contributions is not the same as calculating a time-weighted return. Check how cash flows, fees and currencies are treated before comparing performance.',href:'/tools/workspace?tab=Portfolio',link:'Open your portfolio'},
];
export default function LearningPage(){
  if(!publicDesignEnabled())notFound();
  return <article className={styles.learning}><p className={styles.eyebrow}>Build understanding, one observation at a time</p><h1>Learning</h1><p className={styles.lead}>The concepts behind the research. Clear definitions, useful examples and the limits that matter.</p><section className={styles.lessonHero}><p className={styles.eyebrow}>Research foundations</p><h2>What does this measurement actually tell you?</h2><p>Separate the observation, your interpretation and what the evidence cannot establish. These lessons provide general education; they do not recommend an investment or a course of action.</p></section>{lessons.map(lesson=><details key={lesson.title} className={styles.lesson}><summary>{lesson.title}</summary><p>{lesson.body}</p><Link href={lesson.href}>{lesson.link}</Link></details>)}<p className={styles.note} style={{marginTop:25}}>Definitions do not replace the source, timeframe or methodology shown with a particular reading. <Link href="/disclaimer">Read the research disclosure.</Link></p></article>;
}
