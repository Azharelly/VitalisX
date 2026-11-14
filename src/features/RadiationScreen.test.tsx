import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DonkiSnapshot } from '../data/donki.types';
import { DonkiPanel } from './DonkiPanel';
import { DailyDoseChart } from './DailyDoseChart';
import { MOCK } from './mock';

import raw from '../../public/data/donki_snapshot.json';

const snap = raw as unknown as DonkiSnapshot;

describe('Radiation tab (#21)', () => {
  const html = renderToStaticMarkup(
    <DonkiPanel donki={{ status: 'ready', snapshot: snap, asOf: new Date(snap.generated_at), origin: 'snapshot' } as never} />,
  );

  it('shows the window of each DONKI list', () => {
    for (const k of ['flares', 'cme', 'gst', 'sep'] as const) {
      expect(html).toContain(snap.ranges[k].split('/').join(' to '));
    }
  });

  it('says 250 mSv is the NASA short-term limit (exact wording)', () => {
    expect(html).toContain('NASA short-term limit for a solar particle event: 250 mSv effective dose (design requirement based on the October 1989 event)');
    expect(html).toContain('Real NASA data');
  });

  it('draws one bar per daily dose and marks storm days', () => {
    const chart = renderToStaticMarkup(<DailyDoseChart doses={MOCK.doses} />);
    expect(chart.match(/class="rad-chart-bar[" ]/g)?.length).toBe(MOCK.doses.length);
    expect(chart.match(/is-storm/g)?.length ?? 0).toBe(MOCK.doses.filter((d) => d.sep_flag).length);
  });
});
