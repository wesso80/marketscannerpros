// Inspect actual EDGAR EFTS response structure in detail
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function run() {
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const url = `https://efts.sec.gov/LATEST/search-index?q=%228-K%22&dateRange=custom&startdt=${sevenDaysAgo}&enddt=${today}&forms=8-K`;
  
  const res = await fetch(url, {
    headers: { 
      'User-Agent': 'MarketScannerPros/1.0 (contact@marketscannerpros.app)', 
      Accept: 'application/json' 
    },
  });
  
  const data = await res.json();
  
  // Show first 3 hits in full
  console.log(`Total hits: ${data.hits.total.value}`);
  console.log(`Hits returned: ${data.hits.hits.length}`);
  
  for (let i = 0; i < Math.min(3, data.hits.hits.length); i++) {
    const hit = data.hits.hits[i];
    console.log(`\n=== Hit ${i + 1} ===`);
    console.log(`_id: ${hit._id}`);
    console.log(`_source keys: ${Object.keys(hit._source).join(', ')}`);
    console.log(JSON.stringify(hit._source, null, 2));
  }

  // Check if any hit has items (8-K specific)
  const withItems = data.hits.hits.filter((h: any) => h._source.items);
  console.log(`\n\nHits with items: ${withItems.length} / ${data.hits.hits.length}`);
  if (withItems.length > 0) {
    console.log('Sample items value:', JSON.stringify(withItems[0]._source.items));
    console.log('Sample items _id:', withItems[0]._id);
    console.log('Sample items display_names:', JSON.stringify(withItems[0]._source.display_names));
    console.log('Sample items ciks:', JSON.stringify(withItems[0]._source.ciks));
  }

  // Check pagination - does EFTS support size param?
  const url2 = `https://efts.sec.gov/LATEST/search-index?q=%228-K%22&dateRange=custom&startdt=${sevenDaysAgo}&enddt=${today}&forms=8-K&from=0&size=100`;
  const res2 = await fetch(url2, {
    headers: { 
      'User-Agent': 'MarketScannerPros/1.0 (contact@marketscannerpros.app)', 
      Accept: 'application/json' 
    },
  });
  const data2 = await res2.json();
  console.log(`\nWith size=100: returned ${data2.hits?.hits?.length ?? 0} hits`);
}

run().catch(console.error);
