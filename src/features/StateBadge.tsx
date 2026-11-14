import type { State } from '../data/types';

// State = color + shape + text (PRD section 7: never color alone).
const META: Record<State, { label: string; shape: string; color: string }> = {
  ok: { label: 'Normal', shape: '●', color: 'var(--vx-ok)' },
  watch: { label: 'Watch', shape: '◆', color: 'var(--vx-watch)' },
  alert: { label: 'Alert', shape: '■', color: 'var(--vx-alert)' },
  learn: { label: 'Learning', shape: '○', color: 'var(--vx-learn)' },
  none: { label: 'No data', shape: '○', color: 'var(--vx-learn)' },
};

export function StateBadge({ state }: { state: State }) {
  const m = META[state];
  return (
    <span className="rad-badge" style={{ color: m.color, borderColor: m.color }}>
      <span aria-hidden="true">{m.shape}</span> {m.label}
    </span>
  );
}
