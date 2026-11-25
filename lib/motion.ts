/** M3 Expressive v0_14_0. Damping is a ratio, mass = 1. */
export type Spring = { stiffness: number; damping: number };
export type SpringState = { value: number; velocity: number };
export const motion = {
  spatial: { fast: { stiffness: 800, damping: .6 }, default: { stiffness: 380, damping: .8 }, slow: { stiffness: 200, damping: .8 } },
  effects: { fast: { stiffness: 3800, damping: 1 }, default: { stiffness: 1600, damping: 1 }, slow: { stiffness: 800, damping: 1 } },
  duration: { short: 120, medium: 220, long: 360 },
  easing: { standard: 'cubic-bezier(.2,0,0,1)', exit: 'cubic-bezier(.3,0,1,1)' },
  stagger: { step: 35, max: 140 },
} as const;
export const staggerDelay = (index: number) => Math.min(motion.stagger.max, Math.max(0, index) * motion.stagger.step);

/** Exact damped oscillator solution; elapsed seconds, not frame-count integration.
 * Retarget by supplying a new target with the existing state (including velocity).
 */
export function stepSpring(state: SpringState, target: number, elapsed: number, spring: Spring): SpringState {
  if (elapsed <= 0) return state;
  const w = Math.sqrt(spring.stiffness), z = spring.damping;
  const x = state.value - target, v = state.velocity, decay = Math.exp(-z * w * elapsed);
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z), a = (v + z * w * x) / wd;
    const cos = Math.cos(wd * elapsed), sin = Math.sin(wd * elapsed);
    return { value: target + decay * (x * cos + a * sin), velocity: decay * (v * cos - (z * w * a + wd * x) * sin) };
  }
  const a = v + w * x;
  return { value: target + decay * (x + a * elapsed), velocity: decay * (v - w * a * elapsed) };
}

/** Sample the same physical model for compositor-owned one-shot animations. */
export function springFrames(spring: Spring, duration = .6, count = 60): number[] {
  return Array.from({ length: count + 1 }, (_, i) => i === count ? 1 : stepSpring({ value: 0, velocity: 0 }, 1, duration * i / count, spring).value);
}
