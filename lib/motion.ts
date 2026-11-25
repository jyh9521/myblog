/** M3 Expressive v0_14_0. Damping is a ratio, mass = 1. */
export type Spring = { stiffness: number; damping: number };
export type SpringState = { value: number; velocity: number };
export const motion = {
  spatial: { fast: { stiffness: 800, damping: .6 }, default: { stiffness: 380, damping: .8 }, slow: { stiffness: 200, damping: .8 } },
  effects: { fast: { stiffness: 3800, damping: 1 }, default: { stiffness: 1600, damping: 1 }, slow: { stiffness: 800, damping: 1 } },
  duration: { short: 160, medium: 260, long: 420 },
  easing: { standard: 'cubic-bezier(.2,0,0,1)', exit: 'cubic-bezier(.3,0,1,1)' },
  stagger: { step: 35, max: 140 },
  interaction: { controlLift: 2, controlHoverScale: .012, controlPressScale: .035, cardLift: 4, cardPressScale: .008, hoverShade: .1, pressShade: .14 },
} as const;
export const staggerDelay = (index: number) => Math.min(motion.stagger.max, Math.max(0, index) * motion.stagger.step);

export type InteractionTargets = { hover: number; press: number };
export type InteractionState = { hover: SpringState; press: SpringState; hoverEffect: SpringState; pressEffect: SpringState };
export function createInteraction(hover = 0, press = 0): InteractionState {
  return { hover: {value:hover,velocity:0}, press: {value:press,velocity:0}, hoverEffect: {value:hover,velocity:0}, pressEffect: {value:press,velocity:0} };
}
/** Spatial and effects channels retain their own momentum across input changes. */
export function stepInteraction(state: InteractionState, target: InteractionTargets, elapsed: number): InteractionState {
  return {
    hover: stepSpring(state.hover,target.hover,elapsed,motion.spatial.default),
    press: stepSpring(state.press,target.press,elapsed,motion.spatial.fast),
    hoverEffect: stepSpring(state.hoverEffect,target.hover,elapsed,motion.effects.slow),
    pressEffect: stepSpring(state.pressEffect,target.press,elapsed,motion.effects.fast),
  };
}
export function interactionSettled(state: InteractionState, target: InteractionTargets): boolean {
  return (Object.keys(state) as (keyof InteractionState)[]).every(key => Math.abs(state[key].value-target[key.startsWith('hover')?'hover':'press'])<.001 && Math.abs(state[key].velocity)<.01);
}
export function interactionVisuals(state: InteractionState, card = false) {
  const clamp=(value:number)=>Math.min(1,Math.max(0,value));
  const h=state.hover.value,p=state.press.value,he=clamp(state.hoverEffect.value),pe=clamp(state.pressEffect.value),token=motion.interaction;
  return {
    scale: 1 + (card?0:token.controlHoverScale)*h*(1-clamp(p)) - (card?token.cardPressScale:token.controlPressScale)*p,
    lift: -(card?token.cardLift:token.controlLift)*h*(1-clamp(p)),
    shade: token.hoverShade*he*(1-pe)+token.pressShade*pe,
    elevation: he*(1-.8*pe),
  };
}

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
