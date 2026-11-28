type Host = { url: () => string; state: () => Record<string, unknown> | null; push: (state: Record<string, unknown>) => void; back: () => void; settled: () => void };
type Entry = { id: string; url: string; close: () => void; active: boolean; pushed: boolean };
/** A same-URL history entry belongs to the overlay, never to the route beneath it. */
export function createOverlayHistory(host: Host) {
  let sequence = 0, pending: Entry | null = null;
  const stack: Entry[] = [], queue: Entry[] = [];
  const push = (entry: Entry) => { if (!entry.active) return; entry.pushed = true; stack.push(entry); host.push({ ...host.state(), __blogOverlay: entry.id }); };
  function open(close: () => void) {
    const entry = { id: `overlay-${++sequence}`, url: host.url(), close, active: true, pushed: false };
    if (pending) queue.push(entry); else push(entry);
    return () => {
      if (!entry.active) return;
      entry.active = false;
      if (entry.pushed && stack.at(-1) === entry && host.url() === entry.url && host.state()?.__blogOverlay === entry.id) {
        pending = entry; host.back();
      } else if (!entry.pushed && !pending) host.settled();
    };
  }
  function pop(state: Record<string, unknown> | null) {
    const top = stack.at(-1);
    if (!top || state?.__blogOverlay === top.id) return false;
    if (host.url() !== top.url) {
      stack.splice(0).reverse().forEach(entry => { if (entry.active) { entry.active = false; entry.close(); } });
      queue.splice(0); pending = null; return false;
    }
    stack.pop(); pending = null;
    if (top.active) { top.active = false; top.close(); }
    host.settled();
    queue.splice(0).forEach(push);
    return true;
  }
  return { open, pop, closeTop: () => { const top = [...stack, ...queue].findLast(entry => entry.active); top?.close(); }, hasOpen: () => [...stack, ...queue].some(entry => entry.active) };
}
