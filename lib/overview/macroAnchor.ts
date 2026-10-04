/** Open the collapsed Macro fold that contains a hash target. */
export function openMacroAnchor(hash: string, root: ParentNode = document): boolean {
  const id = decodeURIComponent(hash.replace(/^#/, ''));
  if (!/^[A-Za-z][\w-]*$/.test(id)) return false;
  const target = root instanceof Document ? root.getElementById(id) : root.querySelector(`[id="${id}"]`);
  const fold = target?.closest('details');
  if (!(fold instanceof HTMLDetailsElement)) return false;
  fold.open = true;
  return true;
}
