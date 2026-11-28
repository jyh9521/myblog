/** Content-derived anchors survive inserting an unrelated paragraph earlier. */
export function paragraphIds(texts: string[]) {
  const seen = new Map<string, number>();
  return texts.map(text => {
    let hash = 2166136261;
    for (const char of text.normalize('NFKC').replace(/\s+/g, ' ').trim()) { hash ^= char.codePointAt(0)!; hash = Math.imul(hash, 16777619); }
    const key = `paragraph-${(hash >>> 0).toString(36)}`, occurrence = (seen.get(key) || 0) + 1; seen.set(key, occurrence);
    return occurrence === 1 ? key : `${key}-${occurrence}`;
  });
}

type Node = { type: string; value?: string; url?: string; children?: Node[]; data?: { hProperties?: Record<string, unknown> } };
export function remarkParagraphLinks() {
  return (tree: Node) => {
    const text = (node: Node): string => node.value || (node.children || []).map(text).join('');
    const media = (node: Node): boolean => node.type === 'image' || node.type === 'html' || /(?:game-frame|image-compare)\.invalid/.test(node.url || '') || (node.children || []).some(media);
    const nodes = (tree.children || []).filter(node => node.type === 'paragraph' && text(node).trim() && !media(node));
    const ids = paragraphIds(nodes.map(text));
    nodes.forEach((node, index) => { node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: ids[index] } }; });
  };
}
