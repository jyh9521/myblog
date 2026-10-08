const key = 'gameShelfPosition';
type Position = { y: number; slug?: string; offset?: number };

export function saveShelfPosition() {
  const cards = [...document.querySelectorAll<HTMLElement>('[data-game-slug]')];
  const card = cards.find(item => item.getBoundingClientRect().bottom > 0);
  const position: Position = { y: window.scrollY, slug: card?.dataset.gameSlug, offset: card?.getBoundingClientRect().top };
  history.replaceState({ ...history.state, [key]: position }, '');
}

// Keep the selected card at its viewport offset as the profile above it loads.
// Only a saved history entry restores; deliberate scrolling cancels immediately.
export function restoreShelfPosition(): () => void {
  const position: Position | undefined = history.state?.[key];
  if (!position || !Number.isFinite(position.y)) return () => {};
  let stopped = false;
  let frame = 0;
  const apply = () => {
    if (stopped) return;
    const card = [...document.querySelectorAll<HTMLElement>('[data-game-slug]')].find(item => item.dataset.gameSlug === position.slug);
    const y = card && Number.isFinite(position.offset) ? window.scrollY + card.getBoundingClientRect().top - position.offset! : position.y;
    window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
  };
  const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(apply); };
  const observer = new ResizeObserver(update);
  const stop = () => {
    stopped = true; observer.disconnect(); cancelAnimationFrame(frame); clearTimeout(timer);
    for (const name of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.removeEventListener(name, stop);
  };
  const timer = setTimeout(stop, 20000);
  observer.observe(document.documentElement);
  for (const name of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.addEventListener(name, stop, { passive: true });
  apply(); update();
  return stop;
}
