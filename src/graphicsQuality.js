export const GRAPHICS_MODES = ['auto', 'low', 'balanced', 'high'];
export const GRAPHICS_LEVELS = {
  low: {label: 'Low', pixelRatio: .85, shadowSize: 0},
  balanced: {label: 'Balanced', pixelRatio: 1.15, shadowSize: 512},
  high: {label: 'High', pixelRatio: 1.5, shadowSize: 1024},
};
export const graphicsMode = value => GRAPHICS_MODES.includes(value) ? value : 'auto';

// Foreground frame pacing only. Warm-up, hysteresis and a recovery ceiling avoid
// reacting to room compilation, background throttling or repeatedly trying a
// level this device has already struggled to render during the current visit.
export function createQualityController({mode = 'auto', cores, memory} = {}) {
  const levels = ['low', 'balanced', 'high'];
  const initial = (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4) ? 0 : 1;
  let preference = graphicsMode(mode), index = initial, ceiling = 2;
  let previous = null, warmup = 2000, samples = [], elapsed = 0, fastWindows = 0;
  const reset = () => { previous = null; warmup = 2000; samples = []; elapsed = 0; fastWindows = 0; };
  return {
    get level() { return preference === 'auto' ? levels[index] : preference; },
    setMode(value) {
      value = graphicsMode(value);
      if (value === preference) return;
      preference = value; index = initial; ceiling = 2; reset();
    },
    reset,
    sample(time, active = true) {
      if (!active || !Number.isFinite(time)) { reset(); return this.level; }
      const delta = previous == null ? 0 : time - previous; previous = time;
      if (preference !== 'auto' || delta <= 0) return this.level;
      if (delta > 250) { reset(); return this.level; }
      if (warmup > 0) { warmup -= delta; return this.level; }
      samples.push(delta); elapsed += delta;
      if (elapsed < 4000 || samples.length < 30) return this.level;
      const ordered = samples.sort((a, b) => a - b);
      const p75 = ordered[Math.floor(ordered.length * .75)];
      if (p75 > 28 && index > 0) {
        ceiling = Math.min(ceiling, index - 1); index--; reset();
      } else {
        fastWindows = p75 < 18 ? fastWindows + 1 : 0;
        if (fastWindows >= 3 && index < ceiling) { index++; reset(); }
        samples = []; elapsed = 0;
      }
      return this.level;
    },
  };
}
