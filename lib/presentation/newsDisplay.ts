export function cleanNewsTitle(title: string, source?: string): string {
  let text = title.replace(/^\s*\[(?:news|guide|rss|feed)\]\s*/i, '').replace(/^\s*(?:news|guide|rss|feed)\s*[:|–—-]\s*/i, '');
  if (source) {
    const prefix = source.trim().toLowerCase();
    if (text.toLowerCase().startsWith(prefix)) {
      const rest = text.slice(prefix.length);
      if (/^\s*[:|–—-]\s*/.test(rest)) text = rest.replace(/^\s*[:|–—-]\s*/, '');
    }
  }
  return text.trim();
}
export function uniqueNews<T extends { title: string; url: string; source_name?: string }>(articles: T[]): T[] {
  const links = new Set<string>(), titles = new Set<string>();
  return articles.filter(article => {
    const title = cleanNewsTitle(article.title, article.source_name).toLowerCase().replace(/\s+/g, ' ');
    let link = article.url.trim();
    try { const url = new URL(link); url.hash = ''; for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key); link = url.toString().replace(/\/$/, ''); } catch { /* Retain provider link. */ }
    const duplicate = (link && links.has(link)) || (title && titles.has(title));
    if (link) links.add(link); if (title) titles.add(title);
    return !duplicate;
  });
}
