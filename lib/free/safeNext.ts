/** Only local absolute paths. Reject browser URL-normalization escape hatches too. */
export function safeNext(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || /[\\\u0000-\u001f]/.test(decoded)) return null;
    const url = new URL(value, 'https://msp.invalid');
    return url.origin === 'https://msp.invalid' ? value : null;
  } catch { return null; }
}
