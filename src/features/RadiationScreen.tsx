import { useMemo, useState } from 'react';
import type { RadiationDose } from '../data/types';
import { activeSepEpisode } from '../engine/donkiRadiation';
import { evaluateRadiation } from '../engine/radiation';
import { WhyModal } from './why/WhyModal';
import { radiationEvidence } from './why/radiationEvidence';
import { MOCK } from './mock';
import { useDonki } from './useDonki';
import { StateBadge } from './StateBadge';
import { DosePanel } from './DosePanel';
import { DonkiPanel } from './DonkiPanel';
import { DailyDoseChart } from './DailyDoseChart';
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

  const input = useMemo(
    () => ({ doses, priorDoseMsv, currentDay, arrivalDay, activeStormEpisode }),
    [doses, priorDoseMsv, currentDay, arrivalDay, activeStormEpisode],
  );
  const result = useMemo(() => evaluateRadiation(input), [input]);
  // F-05: Why? for a Watch / Alert, with the evidence frozen at the day it started.
  const evidence = useMemo(() => radiationEvidence(input, result), [input, result]);
  const [whyOpen, setWhyOpen] = useState(false);

  return (
    <main className="rad-screen">
      <header className="rad-head">
        <h1>Radiation</h1>
        <StateBadge state={result.state} />
        {evidence && (
          <button type="button" className="rad-why" onClick={() => setWhyOpen(true)}>
            Why?
          </button>
        )}
        <span className="rad-sim">Simulated crew data</span>
      </header>

      {doses.length === 0 ? (
        <section className="rad-card"><p>No dose data yet. Doses appear after the first dosimeter reading.</p></section>
      ) : (
        <>
          <DosePanel r={result} arrivalDay={arrivalDay} currentDay={currentDay} />
          <DailyDoseChart doses={doses} />
        </>
      )}
      <DonkiPanel donki={donki} />
      <ShelterSteps />
      {whyOpen && evidence && <WhyModal e={evidence} onClose={() => setWhyOpen(false)} />}
    </main>
  );
}
