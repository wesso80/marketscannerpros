'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useUserTier } from '@/lib/useUserTier';
import { PUBLIC_DESTINATIONS, PUBLIC_LEGAL_LINKS, publicDestination } from '@/lib/publicDesign';
import styles from './PublicDesign.module.css';
import editorial from './EditorialStudio.module.css';

function Brand() {
  return <Link href="/" className={styles.brand} aria-label="MarketScannerPros home"><span className={styles.mark} aria-hidden="true"><i/><i/><i/></span>MSP<small>RESEARCH</small></Link>;
}
function LegalFooter() {
  return <footer className={styles.footer}><div><Brand/><p>Educational market research. Sources, dates and limitations belong with every observation.</p></div><nav className={styles.footerLinks} aria-label="Legal and support">{PUBLIC_LEGAL_LINKS.map(link=><Link key={link.href} href={link.href}>{link.label}</Link>)}<Link href="/account">Account & billing</Link><Link href="/pricing">Pricing</Link></nav></footer>;
}
export default function PublicDesignShell({children,workspace}:{children:ReactNode;workspace:boolean}) {
  const path=usePathname();
  const params=useSearchParams();
  const secondaryWebsite = !['/', '/pricing', '/auth'].includes(path);
  const active=publicDestination(path,params.get('tab'));
  const {isLoggedIn,isLoading}=useUserTier();
  const navigation=<nav className={styles.railNav} aria-label="Research destinations">{PUBLIC_DESTINATIONS.map(item=><Link key={item.label} href={item.href} aria-current={active===item.label?'page':undefined}>{item.label}</Link>)}</nav>;
  return <div className={styles.root} data-public-design="research-studio">
    <a className={styles.skip} href="#public-research-content">Skip to content</a>
    {workspace ? <div className={styles.shell}>
      <aside className={styles.rail}><Brand/>{navigation}<div className={styles.railFoot}><strong>Evidence. Then perspective.</strong>Understand the observation before the explanation.</div></aside>
      <div className={styles.workspace}><div className={styles.workspaceBar}><span>Workspace / <strong className={styles.crumb}>{active ?? 'Research tools'}</strong></span><nav aria-label="Account"><Link href="/pricing">Plans</Link><Link href={isLoggedIn?'/account':'/auth?next=%2Ftools%2Fcommand-center'}>{isLoading?'Account':isLoggedIn?'Your account':'Sign in'}</Link></nav></div>
        <details key={path+'?'+params.toString()} className={styles.mobileNav}><summary>{active ?? 'Research'} · Browse destinations</summary>{navigation}</details>
        <div id="public-research-content" className={styles.pageBody}>{children}</div><LegalFooter/>
      </div>
    </div> : <><header className={styles.header}><Brand/><nav aria-label="Public website" className={styles.headerNav}><Link href="/">Product</Link><Link href="/pricing">Pricing</Link><Link href="/learn">Learning</Link><Link href={isLoggedIn?'/account':'/auth'}>{isLoggedIn?'Account':'Sign in'}</Link><Link className={styles.primary} href={isLoggedIn?'/tools/command-center':'/auth?next=%2Ftools%2Fcommand-center'}>{isLoggedIn?'Open workspace':'Start free'} ↗</Link></nav></header><div id="public-research-content" className={`${styles.websiteBody} ${secondaryWebsite ? editorial.supporting : ''}`}>{children}</div><LegalFooter/></>}
  </div>;
}
