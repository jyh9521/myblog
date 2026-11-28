'use client';
import { useEffect, useRef } from 'react';
import { createOverlayHistory } from '../lib/overlay-history';
let controller: ReturnType<typeof createOverlayHistory> | undefined;
type PendingNavigation = { href: string; from: string; historyReady: boolean; dialogReady: boolean };
let navigateAfterClose: PendingNavigation | null = null;
function finishNavigation(request: PendingNavigation) {
  if (navigateAfterClose !== request || !request.historyReady || !request.dialogReady) return;
  navigateAfterClose = null;
  if (location.href === request.from) window.dispatchEvent(new CustomEvent('blog:overlay-navigate', { detail: request.href }));
}
function overlays() {
  if (controller) return controller;
  controller = createOverlayHistory({
    url: () => location.href, state: () => history.state,
    push: state => history.pushState(state, '', location.href), back: () => history.back(),
    settled: () => {
      const url = location.href;
      // Native persisted scroll restoration follows popstate dispatch. A TOC
      // jump made inside that event is otherwise overwritten in WebKit.
      setTimeout(() => {
        if (location.href !== url) return;
        window.dispatchEvent(new CustomEvent('blog:overlay-settled', { detail: { url } }));
        if (navigateAfterClose) { navigateAfterClose.historyReady = true; finishNavigation(navigateAfterClose); }
      }, 0);
    },
  });
  window.addEventListener('popstate', event => { if (controller!.pop(event.state)) event.stopImmediatePropagation(); }, true);
  window.addEventListener('click', event => {
    if (!controller?.hasOpen() || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-overlay-navigate]') : null;
    if (!link || link.target && link.target !== '_self' || link.hasAttribute('download')) return;
    const url = new URL(link.href, location.href); if (url.origin !== location.origin) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const dialog = link.closest('dialog');
    const request = { href: url.pathname + url.search + url.hash, from: location.href, historyReady: false, dialogReady: !dialog?.open };
    navigateAfterClose = request;
    // Do not navigate while a native modal makes the destination inert. Wait
    // for close (including its exit spring), not a guessed animation timeout.
    if (dialog?.open) dialog.addEventListener('close', () => { request.dialogReady = true; finishNavigation(request); }, { once: true });
    controller.closeTop();
  }, true);
  return controller;
}
export default function useOverlayHistory(open: boolean, onClose: () => void) {
  const callback = useRef(onClose); callback.current = onClose;
  useEffect(() => { if (open && typeof window !== 'undefined') return overlays().open(() => callback.current()); }, [open]);
}
