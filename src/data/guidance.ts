/**
 * Guidance texts: the single source of every "what to do" sentence in the app.
 *
 * One entry per metric id (the same ids the data layer uses: `temp`, `hr`, `sleep`, ...).
 * The UI never writes advice itself; it calls `GUIDANCE[metricId]`.
 * To change wording, edit this file only. To add a metric, add an entry here (the Today self-check
 * fails if a metric the data layer can return has no entry).
 *
 * Content rules (PRD R-01, F-11):
 *  - Every entry lists its sources. Use 'Design rule' for our own rules and 'Source pending'
 *    when no citation exists yet; the UI shows those differently.
 *  - Decision support only: no doses, no diagnoses. Real missions follow their own procedures.
 *
 * Seeded from the team prototype ("VitalisX Quiet Flight Deck Simulator"), Nov 14 2026.
 */

export interface MetricGuidance {
  /** The single next step, imperative, short (≤ 120 characters). Shown as the next action and on the card. */
  act: string
  /** Optional stronger step for Alert. Falls back to `act`. */
  actAlert?: string
  /** "What helps": 2–4 short self-care ideas. */
  helps: string[]
  /** "Tell the flight surgeon when": the escalation trigger, one sentence. */
  tell: string
  /** "How to measure": short numbered steps. */
  measure: string[]
  /** "Why space changes this": one or two sentences. */
  why: string
  /** Citation labels. 'Design rule' = our own rule; 'Source pending' = no citation yet. */
  sources: string[]
}

export const GUIDANCE: Record<string, MetricGuidance> = {
  sleep: {
    act: 'Bring lights-out 20 minutes earlier tonight and dim the cabin an hour before.',
    helps: ['Earlier lights-out, dim lights an hour before', 'Protect rest before critical tasks', 'Talk it through with a crewmate'],
    tell: 'Short sleep on 5 or more nights, or any sleep medication use.',
    measure: ['Sleep comes from the wrist device.', 'Correct it in check-in if it looks wrong.'],
    why: 'Crews on the ISS averaged about 6 hours of sleep against 8.5 scheduled.',
    sources: ['Barger et al., Lancet Neurology 2014'],
  },
  mood: {
    act: 'Take 10 quiet minutes and plan a call or a recorded message home.',
    helps: ['Time with a crewmate', 'A recorded message home (Earth is minutes away)', 'Exercise and daylight-like lighting'],
    tell: 'Low mood most days for a week.',
    measure: ['Pick the face that fits today.', 'You can skip it.'],
    why: 'Isolation and confinement wear on mood over months.',
    sources: ['Design rule'],
  },
  vision: {
    act: 'Repeat the vision check tomorrow in the same lighting.',
    helps: ['Same lighting each time', 'Report headaches too'],
    tell: 'Any new blur that lasts 2 checks.',
    measure: ["Read the near chart at arm's length.", 'Pick Same or Blurrier.'],
    why: 'Fluid shifts toward the head can change eyesight in flight.',
    sources: ['Norsk et al. (2015)', 'Gew et al. (2026)', 'NASA HRP Evidence Report (SANS)'],
  },
  hr: {
    act: 'Rest 10 minutes strapped in, drink water, then measure again.',
    helps: ['Hydrate', "Check last night's sleep", 'Ease off exercise today'],
    tell: 'Resting rate above your usual on 3 readings, or with chest symptoms.',
    measure: ['Measure after 5 minutes at rest.', 'Same time each day.'],
    why: 'Fluid shift and deconditioning change resting heart rate in flight.',
    sources: ['Design rule'],
  },
  bp_sys: {
    act: 'Measure again after 5 minutes at rest, cuff level with the heart.',
    helps: ['Stay still and strapped in', 'Repeat once'],
    tell: 'Two readings far from your usual.',
    measure: ['Cuff on bare upper arm.', 'Rest 5 minutes first.'],
    why: 'Blood pressure adapts to weightlessness (24-hour pressure runs 8–10 mmHg lower), so your own baseline matters.',
    sources: ['Norsk et al., J Physiol 2015'],
  },
  bp_dia: {
    act: 'Measure again after 5 minutes at rest, cuff level with the heart.',
    helps: ['Stay still and strapped in', 'Repeat once'],
    tell: 'Two readings far from your usual.',
    measure: ['Cuff on bare upper arm.', 'Rest 5 minutes first.'],
    why: 'Blood pressure adapts to weightlessness (24-hour pressure runs 8–10 mmHg lower), so your own baseline matters.',
    sources: ['Norsk et al., J Physiol 2015'],
  },
  spo2: {
    act: 'Check the cabin air panel, move to a ventilated spot and measure again.',
    helps: ['Check cabin CO₂ and alarms', 'Warm your finger before measuring'],
    tell: 'Below 92% on a repeat reading.',
    measure: ['Clip on a warm, still finger.', 'Wait for a steady number.'],
    why: 'A closed cabin can build up CO₂ and affect breathing.',
    sources: ['NASA-STD-3001 Vol. 2'],
  },
  temp: {
    act: 'Rest, drink fluids, keep some distance from others and measure again in 30 minutes.',
    actAlert: 'Measure again in 30 minutes and send a note to the flight surgeon.',
    helps: ['Rest and fluids', 'Skip hard exercise today', 'Log any symptoms'],
    tell: 'Two readings well above your own usual, or with chills.',
    measure: ['Use the forehead thermometer.', 'Add when it was taken: resting, after exercise or after a meal.'],
    why: 'Bodies run about 1 °C warmer on long flights, so we compare you with your own in-flight level, not 37 °C.',
    sources: ['Stahn et al., Scientific Reports 2017'],
  },
  glucose: {
    act: 'Follow the Medical Checklist for blood sugar, then test again in 15 minutes.',
    helps: ['Test again in 15 minutes', 'Note your last meal'],
    tell: 'Any reading below 54 or above 250, or a repeat out of range.',
    measure: ['Follow the crew procedure for the finger-prick.', 'Tag it: fasting, before meal or after meal.'],
    why: 'Limits shown are Earth reference values (70 to 180 target) used as adjustable space placeholders until the flight surgeon sets mission-specific values.',
    sources: ['Battelino et al. 2019 (Earth reference)', 'Earth reference / placeholder (adjustable by the flight surgeon)', 'Design rule: repeat out-of-range readings'],
  },
  fluids: {
    act: 'Drink 500 mL over the next hour.',
    helps: ['Keep a drink bag at your station', 'Check the urine colour chart'],
    tell: 'Low intake 3 days running.',
    measure: ['Tap +250 mL each time you finish a bag.'],
    why: 'Thirst is blunted in weightlessness.',
    sources: ['Design rule'],
  },
  weight: {
    act: 'Check food intake against your plan this week.',
    helps: ['Log every meal pack', 'Ask the crew medic about intake targets'],
    tell: 'A 2% change in body mass within two weeks.',
    measure: ['Weekly, on the body-mass device, before breakfast.'],
    why: 'Appetite and muscle mass both tend to drop on long flights.',
    sources: ['Design rule'],
  },
  exercise: {
    act: 'Make up one resistance session this week.',
    helps: ['Swap sessions with a crewmate', 'A shorter session is better than none'],
    tell: 'Missed 3 or more sessions in a week.',
    measure: ['Comes from the exercise device log.'],
    why: 'Without loading, hip bone density can fall about 1 to 1.5% a month.',
    sources: ['Lang et al., J Bone Miner Res 2004'],
  },
  symptoms: {
    act: 'Log any change in your next check-in.',
    actAlert: 'Tell the crew medic now.',
    helps: ['Rest', 'Fluids', 'Note when it started'],
    tell: 'Any symptom rated 3, or one that lasts more than 2 days.',
    measure: ['Pick symptoms in the check-in.', 'Rate how strong they are, 0 to 3.'],
    why: 'Immune function changes in flight, and small infections can spread in a closed cabin.',
    sources: ['Design rule'],
  },
  rad: {
    act: 'Review the dose plan with the commander and limit time outside shielded areas.',
    actAlert: 'Move to the storm shelter now and stay until the all-clear.',
    helps: ['Shelter during particle events', 'Sleep in the most shielded bunk'],
    tell: 'Projected career dose above 600 mSv.',
    measure: ['Read from the personal dosimeter.', 'The app records it; it does not measure radiation.'],
    why: 'NASA limits career exposure to 600 mSv.',
    sources: ['NASA-STD-3001 Vol. 1'],
  },
}

/** The step to show for a reading at a given level (Alert uses `actAlert` when present). */
export const actionFor = (metricId: string, level: string): string | undefined => {
  const g = GUIDANCE[metricId]
  return g && (level === 'alert' ? g.actAlert ?? g.act : g.act)
}
