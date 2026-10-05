/**
 * Writes the static 1200x630 share cards to public/og.
 * Usage: npx tsx scripts/render-link-previews.ts
 * Symbol tickers are not written here; /og/symbol/[symbol] paints those on request.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SHARE_PREVIEW_CARDS } from '@/lib/og/linkPreview';
import { linkPreviewImageResponse } from '@/lib/og/linkPreviewCard';

async function main() {
  const outDir = path.join(process.cwd(), 'public/og');
  mkdirSync(outDir, { recursive: true });
  for (const spec of Object.values(SHARE_PREVIEW_CARDS)) {
    const png = Buffer.from(await linkPreviewImageResponse(spec).arrayBuffer());
    const file = path.join(outDir, spec.file);
    writeFileSync(file, png);
    console.log(`${spec.file} ${png.length} bytes`);
  }
}

main();
