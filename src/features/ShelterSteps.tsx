// R-01: no clinical/safety instruction without a source or this label.
const STEPS = [
  'Move to the most shielded area of the vehicle, the storm shelter named in your mission procedures.',
  'Bring the crew medical kit, water and food. Tell the crew you are sheltering.',
  'Stay until the dosimeters and Mission Control report the event is over.',
  'Log any symptoms in your next check-in and include them in the report to Earth.',
];

export function ShelterSteps() {
  return (
    <section className="rad-card" aria-labelledby="rad-shelter-h">
      <h2 id="rad-shelter-h">If a solar storm hits</h2>
      <ol className="rad-steps">{STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
      <p className="rad-small rad-dim">
        Example content, not clinically validated. Decision support only: follow the mission’s own procedures.
      </p>
    </section>
  );
}
