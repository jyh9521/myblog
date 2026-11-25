type Point = { x: number; y: number };
/** Horizontal intent wins only beyond a useful distance and clear axis bias. */
export function gallerySwipe(start: Point | null, end: Point): -1 | 0 | 1 {
  if (!start) return 0;
  const dx = end.x - start.x, dy = end.y - start.y;
  return Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.25 ? (dx < 0 ? 1 : -1) : 0;
}
