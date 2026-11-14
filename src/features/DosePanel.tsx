import { CAREER_LIMIT_MSV, type RadiationEval } from '../../engine/radiation';

const msv = (n: number) => n.toFixed(1);
const pct = (f: number) => `${Math.round(f * 100)}%`;

export function DosePanel({ r, arrivalDay, currentDay }: { r: RadiationEval; arrivalDay: number; currentDay: number }) {
  const fillPct = Math.min(100, r.fraction * 100);
  const projPct = r.projectionFraction === null ? null : Math.min(100, r.projectionFraction * 100);

  let daysText = '—';
  if (r.daysToLimit.status === 'days') daysText = `${Math.round(r.daysToLimit.days)} days`;
  if (r.daysToLimit.status === 'reached') daysText = 'Limit reached';

  return (
    <section className="rad-card" aria-labelledby="rad-dose-h">
      <h2 id="rad-dose-h">Accumulated dose</h2>
      <p className="rad-big">
        <span className="rad-mono">{msv(r.careerMsv)}</span>
        <span className="rad-dim"> / {CAREER_LIMIT_MSV} mSv · {pct(r.fraction)}</span>
      </p>

      <div
        className="rad-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={CAREER_LIMIT_MSV}
        aria-valuenow={Math.round(r.careerMsv)}
        aria-label="Career dose against the 600 mSv limit"
      >
        <div className="rad-bar-fill" style={{ width: `${fillPct}%` }} />
        {projPct !== null && <div className="rad-bar-mark" style={{ left: `${projPct}%` }} title="Projected at arrival" />}
      </div>
      <p className="rad-dim rad-small">Marker = projected dose at arrival (day {arrivalDay}).</p>

      <dl className="rad-stats">
        <div>
          <dt>Dose rate (7-day mean)</dt>
          <dd className="rad-mono">{r.rate === null ? 'No data' : `${r.rate.toFixed(2)} mSv/day`}</dd>
        </div>
        <div>
          <dt>Days to limit</dt>
          <dd className="rad-mono">{daysText}</dd>
        </div>
        <div>
          <dt>Projected at arrival</dt>
          <dd className="rad-mono">
            {r.projectionMsv === null || r.projectionFraction === null
              ? arrivalDay <= currentDay ? 'Arrived' : '—'
              : `${msv(r.projectionMsv)} mSv · ${pct(r.projectionFraction)}`}
          </dd>
        </div>
      </dl>

      {r.reasons.length > 0 && r.state !== 'ok' && (
        <ul className="rad-reasons">
          {r.reasons.map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
    </section>
  );
}
