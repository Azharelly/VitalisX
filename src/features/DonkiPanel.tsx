import { DONKI_NOTE, summarizeDonki } from '../engine/donki';
import { STORM_DESIGN_TARGET_MSV } from '../engine/radiation';
import type { DonkiState } from './useDonki';

export function DonkiPanel({ donki }: { donki: DonkiState }) {
  return (
    <section className="rad-card" aria-labelledby="rad-donki-h">
      <h2 id="rad-donki-h">Space weather (NASA DONKI)</h2>

      {donki.status === 'loading' && <p className="rad-dim">Loading saved space-weather data…</p>}
      {donki.status === 'error' && (
        <p role="alert">Space-weather data could not be loaded ({donki.message}). Dose figures above are not affected.</p>
      )}
      {donki.status === 'ready' && <Ready snapshot={donki.snapshot} />}
    </section>
  );
}

function Ready({ snapshot }: { snapshot: Extract<DonkiState, { status: 'ready' }>['snapshot'] }) {
  const s = summarizeDonki(snapshot);
  return (
    <>
      <p className="rad-dim rad-small">Showing saved data from {s.capturedOn} · last {s.windowDays} days · works offline</p>
      <p>
        <strong>{s.activeSolarStorm ? 'Solar particle event in the last 24 h' : 'No solar particle event in the last 24 h'}</strong>
        {s.sep.latest && s.sep.daysSinceLatest !== null && (
          <span className="rad-dim"> · last one {s.sep.daysSinceLatest} days before capture</span>
        )}
      </p>
      <dl className="rad-stats">
        <div><dt>Strong flares (M/X)</dt><dd className="rad-mono">{s.flares.strong}</dd></div>
        <div>
          <dt>Strongest flare</dt>
          <dd className="rad-mono">{s.flares.strongest ? s.flares.strongest.classType : '—'}</dd>
        </div>
        <div><dt>CMEs observed</dt><dd className="rad-mono">{s.cmes.total}</dd></div>
        <div>
          <dt>Geomagnetic storms</dt>
          <dd className="rad-mono">{s.geomagnetic.total === 0 ? '0' : `${s.geomagnetic.total} · max G${s.geomagnetic.maxG}`}</dd>
        </div>
      </dl>
      <p className="rad-small rad-dim">{DONKI_NOTE}</p>
      <p className="rad-small rad-dim">
        Reference: shielding is designed for a storm of about {STORM_DESIGN_TARGET_MSV} mSv (NASA-STD-3001).
        That is a design target for the spacecraft, not a personal limit.
      </p>
    </>
  );
}
