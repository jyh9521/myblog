const SITE_URL = 'https://blog.blfy.cc/';

export function isExternalWebLink(href: string | undefined, base = SITE_URL): boolean {
  if (!href?.trim()) return false;
  try {
    const url = new URL(href, base);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin !== new URL(base).origin;
  } catch { return false; }
}

export function externalLinkProps(href: string | undefined, rel = '', base = SITE_URL) {
  if (!isExternalWebLink(href, base)) return {};
  const tokens = new Set(rel.toLowerCase().split(/\s+/).filter(token => token && token !== 'opener'));
  tokens.add('noopener'); tokens.add('noreferrer');
  return { target: '_blank', rel: [...tokens].join(' ') };
}

// Covers JSX links and asynchronous cards as well as Markdown's static attributes.
export function installExternalLinkPolicy(doc: Document, base: string): () => void {
  const originals = new WeakMap<Element, { target: string | null; rel: string | null }>();
  const set = (element: Element, key: string, value: string | null) => {
    if (element.getAttribute(key) === value) return;
    if (value === null) element.removeAttribute(key); else element.setAttribute(key, value);
  };
  const apply = (anchor: Element) => {
    const props = externalLinkProps(anchor.getAttribute('href') || '', anchor.getAttribute('rel') || '', base);
    if (props.target) {
      if (!originals.has(anchor)) originals.set(anchor, { target: anchor.getAttribute('target'), rel: anchor.getAttribute('rel') });
      set(anchor, 'target', props.target); set(anchor, 'rel', props.rel);
    } else {
      const original = originals.get(anchor);
      if (original) { originals.delete(anchor); set(anchor, 'target', original.target); set(anchor, 'rel', original.rel); }
    }
  };
  const scan = (root: Document | Element) => {
    if ('matches' in root && root.matches('a[href]')) apply(root);
    root.querySelectorAll('a[href]').forEach(apply);
  };
  scan(doc);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') apply(record.target as Element);
      else record.addedNodes.forEach(node => { if (node.nodeType === 1) scan(node as Element); });
    }
  });
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'target', 'rel'] });
  const onActivate = (event: Event) => {
    const node = event.target as Node | null;
    const element = node?.nodeType === 1 ? node as Element : node?.parentElement;
    const anchor = element?.closest('a[href]');
    if (anchor) apply(anchor);
  };
  doc.addEventListener('click', onActivate, true);
  doc.addEventListener('auxclick', onActivate, true);
  return () => { observer.disconnect(); doc.removeEventListener('click', onActivate, true); doc.removeEventListener('auxclick', onActivate, true); };
}
