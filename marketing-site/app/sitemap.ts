export default function sitemap() {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://marketscannerpros.app";
  return [{ url: base + "/", priority: 1 }];
}
