import { useMemo } from 'react';
import type { RadiationDose } from '../data/types';
import { activeSepEpisode } from '../engine/donkiRadiation';
import { evaluateRadiation } from '../engine/radiation';
import { MOCK } from './mock';
import { useDonki } from './useDonki';
import { StateBadge } from './StateBadge';
import { DosePanel } from './DosePanel';
import { DonkiPanel } from './DonkiPanel';
import { ShelterSteps } from './ShelterSteps';
import './radiation.css';

export interface RadiationScreenProps {
  doses?: RadiationDose[];       // ONE crew member's doses
  priorDoseMsv?: number;
  currentDay?: number;
  arrivalDay?: number;
}

export function RadiationScreen({
  doses = MOCK.doses,
  priorDoseMsv = MOCK.priorDoseMsv,
  currentDay = MOCK.currentDay,
  arrivalDay = MOCK.arrivalDay,
}: RadiationScreenProps) {
  const donki = useDonki();
  // The episode itself, not just yes/no, so the warning can name it. asOf is the real clock for live data.
  const activeStormEpisode = donki.status === 'ready' ? activeSepEpisode(donki.snapshot, donki.asOf) : null;

  const result = useMemo(
    () => evaluateRadiation({ doses, priorDoseMsv, currentDay, arrivalDay, activeStormEpisode }),
    [doses, priorDoseMsv, currentDay, arrivalDay, activeStormEpisode],
  );

  return (
    <main className="rad-screen">
      <header className="rad-head">
        <h1>Radiation</h1>
        <StateBadge state={result.state} />
        <span className="rad-sim">Simulated data</span>
      </header>

      {doses.length === 0 ? (
        <section className="rad-card"><p>No dose data yet. Doses appear after the first dosimeter reading.</p></section>
      ) : (
        <DosePanel r={result} arrivalDay={arrivalDay} currentDay={currentDay} />
      )}
      <DonkiPanel donki={donki} />
      <ShelterSteps />
    </main>
  );
}
