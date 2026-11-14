import type { RadiationDose } from '../data/types';

/** Daily dosimeter readings for one person, oldest first. Solar-particle-event days are highlighted. */
export function DailyDoseChart({ doses }: { doses: RadiationDose[] }) {
  const days = [...doses].sort((a, b) => a.mission_day - b.mission_day);
  if (days.length === 0) return null;
  const top = Math.max(...days.map((d) => d.dose_msv), 0.01);
  const avg = days.reduce((a, d) => a + d.dose_msv, 0) / days.length;
  const storms = days.filter((d) => d.sep_flag);
  const h = (v: number) => `${(v / (top * 1.1)) * 100}%`;
  return (
    <section className="rad-card" aria-labelledby="rad-daily-h">
      <h2 id="rad-daily-h">Daily dose</h2>
      <div
        className="rad-chart"
        role="img"
        aria-label={`Daily dose over ${days.length} days, average ${avg.toFixed(2)} mSv per day${storms.length ? `, solar particle event on day ${storms.map((d) => d.mission_day).join(', ')}` : ''}`}
      >
        <div className="rad-chart-axis" aria-hidden="true">
          <span>{top.toFixed(2)}</span>
          <span>0</span>
        </div>
        <div className="rad-chart-bars" style={{ ['--avg' as string]: h(avg) }}>
          {days.map((d) => (
            <span
              key={d.id}
              className={`rad-chart-bar${d.sep_flag ? ' is-storm' : ''}`}
              style={{ height: h(d.dose_msv) }}
              title={`Day ${d.mission_day}: ${d.dose_msv.toFixed(2)} mSv${d.sep_flag ? ' · solar particle event' : ''}`}
            />
          ))}
        </div>
      </div>
      <p className="rad-dim rad-small rad-chart-x">
        <span>Day {days[0].mission_day}</span>
        <span>mSv per day · dashed line = average {avg.toFixed(2)}{storms.length ? ' · red = solar particle event' : ''}</span>
        <span>Day {days[days.length - 1].mission_day}</span>
      </p>
    </section>
  );
}
