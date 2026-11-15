/** Pure helpers for the hold-to-end button, kept out of the component so they can be tested. */

/** How far through the hold we are, 0–100. Never negative: the first animation frame can be stamped slightly before the press. */
export function holdProgressPct(now: number, start: number, durationMs: number): number {
  if (durationMs <= 0) return 100;
  return Math.min(100, Math.max(0, ((now - start) / durationMs) * 100));
}

/** "2 seconds", "1 second", "1.5 seconds": the label text follows the real duration. */
export function holdSecondsText(durationMs: number): string {
  const seconds = Number((durationMs / 1000).toFixed(1));
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
}
