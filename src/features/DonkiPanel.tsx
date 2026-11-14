import { latestFlares, lastSep, strongestEvents, summary } from '../data/donki';
import type { DonkiSnapshot } from '../data/donki.types';
import { DONKI_NOTE, gScale, isActiveSolarStorm, sepDataCoversNow, snapshotAsOf } from '../engine/donkiRadiation';
import { STORM_DESIGN_TARGET_MSV } from '../engine/radiation';
import type { DonkiState } from './useDonki';

const day = (iso: string) => iso.slice(0, 10);

export function DonkiPanel({ donki }: { donki: DonkiState }) {
  return (
    <section className="rad-card" aria-labelledby="rad-donki-h">
      <h2 id="rad-donki-h">Space weather (NASA DONKI)</h2>
      {donki.status === 'loading' && <p className="rad-dim">Loading saved space-weather data…</p>}
      {donki.status === 'error' && (
        <p role="alert">Space-weather data could not be loaded ({donki.message}). Dose figures above are not affected.</p>
      )}
      {donki.status === 'ready' && <Ready snap={donki.snapshot} />}
    </section>
  );
}

function Ready({ snap }: { snap: DonkiSnapshot }) {
  const asOf = snapshotAsOf(snap);
  const s = summary(snap);
  const ev = strongestEvents(snap);
  const sep = lastSep(snap);
  const flares = latestFlares(snap, 3);
  const covers = sepDataCoversNow(snap, asOf);
  const active = isActiveSolarStorm(snap, asOf);

  return (
    <>
      <p className="rad-dim rad-small">Showing saved data from {s.generatedAt} · works offline</p>

      <p>
        <strong>
          {active
            ? 'Solar particle event in the last 24 h'
            : covers
              ? 'No solar particle event in the last 24 h'
              : 'Current particle events: unknown'}
        </strong>
      </p>
      {!covers && (
        <p className="rad-small rad-dim">
          Saved particle-event data ends on {s.ranges.sep.split('/')[1]}, so it cannot show what happened since.
        </p>
      )}
      {sep && (
        <p className="rad-small rad-dim">
          Last recorded particle event: {day(sep.start)}
          {sep.over100MeV ? ' (reached >100 MeV)' : sep.over10MeV ? ' (reached >10 MeV)' : ''}
          {' '}· {sep.recordCount} NASA records for this one event.
        </p>
      )}

      <dl className="rad-stats">
        <div><dt>Strongest flare</dt><dd className="rad-mono">{ev.flare ? `${ev.flare.classType} · ${day(ev.flare.peakTime)}` : '—'}</dd></div>
        <div><dt>Fastest CME</dt><dd className="rad-mono">{ev.cme ? `${Math.round(ev.cme.speedKmS)} km/s` : '—'}</dd></div>
        <div>
          <dt>Strongest geomagnetic storm</dt>
          <dd className="rad-mono">{ev.storm ? `Kp ${ev.storm.maxKp} · G${gScale(ev.storm.maxKp)}` : '—'}</dd>
        </div>
        <div><dt>Flares / CMEs logged</dt><dd className="rad-mono">{s.counts.flares} / {s.counts.cme}</dd></div>
      </dl>

      {flares.length > 0 && (
        <>
          <h3 className="rad-sub">Latest flares</h3>
          <ul className="rad-reasons">
            {flares.map((f) => (
              <li key={f.id}>
                <span className="rad-mono">{f.classType}</span> · {day(f.peakTime)}{f.hasCme ? ' · CME linked' : ''}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="rad-small rad-dim">
        Flare class, CME speed and Kp describe the Sun and near-Earth space. They cannot be converted into a dose in mSv.
      </p>
      <p className="rad-small rad-dim">{DONKI_NOTE}</p>
      <p className="rad-small rad-dim">
        Reference: shielding is designed for a storm of about {STORM_DESIGN_TARGET_MSV} mSv (NASA-STD-3001).
        That is a design target for the spacecraft, not a personal limit.
      </p>
    </>
  );
}
