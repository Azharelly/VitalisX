import type { EmergencyCondition, EmergencyStep } from './model';

/** In the order the crew sees them: the most time-critical first. */
export const CONDITION_LABELS: Record<EmergencyCondition, string> = {
  cardiac_arrest: 'No pulse',
  not_breathing: 'Not breathing',
  collapsed: 'Collapsed',
  bleeding: 'Bleeding',
  chest_pain: 'Chest pain',
  very_low_sugar: 'Very low sugar',
  fever: 'Fever',
  other: 'Other',
};

/** Dossier R-01: every guide step is shown with this label until the mission's medical lead signs it off. */
export const EXAMPLE_CONTENT_NOTE = 'Example content, not clinically validated. The Medical Checklist wins.';

/**
 * Every protocol ends with the same hand-off: reassess, then tell the Flight Surgeon.
 * The reply is delayed by the one-way light time, so the crew keeps treating meanwhile.
 */
const reassessStep = (id: string, stepNumber: number, checklistRefId: string): EmergencyStep => ({
  id,
  stepNumber,
  title: 'Reassess, then update the flight surgeon.',
  detail:
    'Recheck responsiveness, breathing and vitals, and record them. Send the message to the flight surgeon. Keep treating while you wait: the reply is delayed.',
  checklistRefId,
  vitalsCheckRequired: true,
});

// NOTE: checklistRefId values must match the real Medical Checklist binder. Ids on steps added in this
// revision (tourniquet, cardiac arrest, glucose confirm) are placeholders until they are aligned.
// Clinical content must be reviewed and signed off by the mission's medical lead before use.
export const EMERGENCY_PROTOCOLS: Record<EmergencyCondition, EmergencyStep[]> = {
  bleeding: [
    {
      id: 'bld-1',
      stepNumber: 1,
      title: 'Apply firm direct pressure to the wound.',
      detail: 'Use sterile gauze from the Trauma Pack. Do not remove soaked dressings; stack fresh gauze on top.',
      checklistRefId: 'MED-CHK-BLD-01',
    },
    {
      id: 'bld-2',
      stepNumber: 2,
      title: 'Strap patient to the medical restraint.',
      detail: 'Secure torso and pelvis straps so both patient and medic remain anchored in microgravity.',
      checklistRefId: 'MED-CHK-BLD-02',
      zeroGNote: 'Do not elevate legs — fluid shifts are already headward in zero-G.',
    },
    {
      id: 'bld-3',
      stepNumber: 3,
      title: 'Bleeding not stopping? Tourniquet or pack the wound.',
      detail:
        'Arm or leg, spurting or soaking through: apply a tourniquet above the wound, tighten until bleeding stops, and note the time. Wound you cannot tourniquet: pack it with hemostatic gauze and hold pressure.',
      checklistRefId: 'MED-CHK-BLD-06',
    },
    {
      id: 'bld-4',
      stepNumber: 4,
      title: 'Check vitals & compare to in-flight normal.',
      detail: 'Measure Heart Rate, Blood Pressure, and SpO₂. Uninjured crew already carry lower plasma volume.',
      checklistRefId: 'MED-CHK-BLD-03',
      vitalsCheckRequired: true,
      escalations: [{ to: 'collapsed', label: 'Patient no longer responds → Collapsed' }],
    },
    {
      id: 'bld-5',
      stepNumber: 5,
      title: 'Open Shock & IV Access Kit if bleeding persists or shock signs appear.',
      detail: 'Prepare pressure infusion cuff (gravity drip will not flow). Verify amounts in Medical Checklist.',
      checklistRefId: 'MED-CHK-SHK-04',
    },
    reassessStep('bld-6', 6, 'MED-CHK-COM-05'),
  ],
  collapsed: [
    {
      id: 'col-1',
      stepNumber: 1,
      title: 'Check responsiveness, breathing and pulse for up to 10 seconds.',
      detail: 'Tap shoulders firmly and shout name. Look for chest rise. Feel for a neck (carotid) pulse at the same time.',
      checklistRefId: 'MED-CHK-COL-01',
      escalations: [
        { to: 'cardiac_arrest', label: 'No pulse → start CPR' },
        { to: 'not_breathing', label: 'Pulse, but not breathing → rescue breaths' },
      ],
    },
    {
      id: 'col-2',
      stepNumber: 2,
      title: 'Restrain patient and open the airway.',
      detail:
        'Anchor patient to Crew Medical Restraint System (CMRS) before starting airway maneuvers. Head-tilt chin-lift; use jaw-thrust if a neck injury is possible.',
      checklistRefId: 'MED-CHK-COL-02',
    },
    {
      id: 'col-3',
      stepNumber: 3,
      title: 'Record baseline vitals & blood glucose.',
      detail: 'Attach pulse oximeter, BP cuff, and check fingerstick glucose.',
      checklistRefId: 'MED-CHK-COL-03',
      vitalsCheckRequired: true,
      escalations: [{ to: 'very_low_sugar', label: 'Glucose is low → Very low sugar' }],
    },
    reassessStep('col-4', 4, 'MED-CHK-COM-05'),
  ],
  not_breathing: [
    {
      id: 'nbr-1',
      stepNumber: 1,
      title: 'Anchor patient to restraint. Check for a pulse (up to 10 seconds).',
      detail: 'Feel for a neck (carotid) pulse. Pulse present: carry on. No pulse: switch to CPR now.',
      checklistRefId: 'MED-CHK-AIR-01',
      escalations: [{ to: 'cardiac_arrest', label: 'No pulse → start CPR' }],
    },
    {
      id: 'nbr-2',
      stepNumber: 2,
      title: 'Open the airway and give rescue breaths.',
      detail:
        'Bag-valve-mask (BVM) with O₂ reservoir attached. One breath about every 6 seconds; watch for chest rise.',
      checklistRefId: 'MED-CHK-AIR-02',
      escalations: [{ to: 'cardiac_arrest', label: 'Pulse lost → start CPR' }],
    },
    {
      id: 'nbr-3',
      stepNumber: 3,
      title: 'Attach monitor and recheck pulse every 2 minutes.',
      detail: 'Pulse oximeter on. Keep breathing for the patient until they breathe on their own.',
      checklistRefId: 'MED-CHK-AIR-03',
      vitalsCheckRequired: true,
      escalations: [{ to: 'cardiac_arrest', label: 'Pulse lost → start CPR' }],
    },
    reassessStep('nbr-4', 4, 'MED-CHK-COM-05'),
  ],
  cardiac_arrest: [
    {
      id: 'arr-1',
      stepNumber: 1,
      title: 'Anchor patient and rescuer. Start chest compressions now.',
      detail:
        'Handstand or reverse bear-hug technique per Medical Checklist. Push hard and fast: 100–120 per minute, at least 5 cm deep. Do not stop to set up equipment.',
      checklistRefId: 'MED-CHK-CPR-03',
    },
    {
      id: 'arr-2',
      stepNumber: 2,
      title: 'Attach AED pads while compressions continue.',
      detail:
        'Follow voice prompts. Before any shock, everyone lets go of the patient and is clear of them. Restart compressions straight after.',
      checklistRefId: 'MED-CHK-AED-02',
    },
    {
      id: 'arr-3',
      stepNumber: 3,
      title: 'Add breaths: 30 compressions, then 2 breaths with the BVM.',
      detail: 'BVM with O₂ reservoir attached. Swap the person doing compressions every 2 minutes.',
      checklistRefId: 'MED-CHK-AIR-02',
    },
    reassessStep('arr-4', 4, 'MED-CHK-COM-05'),
  ],
  very_low_sugar: [
    {
      id: 'sug-1',
      stepNumber: 1,
      title: 'Check blood glucose to confirm it is low.',
      detail:
        'Fingerstick reading. If the meter is not working and the patient has classic signs, treat anyway.',
      checklistRefId: 'MED-CHK-GLU-01',
      vitalsCheckRequired: true,
    },
    {
      id: 'sug-2',
      stepNumber: 2,
      title: 'Check if patient is awake and able to swallow.',
      detail: 'If unconscious or confused, DO NOT give oral fluids or gel (aspiration risk in zero-G).',
      checklistRefId: 'MED-CHK-GLU-02',
      escalations: [{ to: 'collapsed', label: 'Patient does not respond → Collapsed' }],
    },
    {
      id: 'sug-3',
      stepNumber: 3,
      title: 'Administer fast sugar per Medical Checklist.',
      detail: 'Use oral glucose tube if alert, or prepare glucagon/dextrose kit per Checklist ID.',
      checklistRefId: 'MED-CHK-GLU-03',
    },
    {
      id: 'sug-4',
      stepNumber: 4,
      title: 'Re-test glucose and vitals in 15 minutes.',
      detail: 'Still low? Repeat the treatment. Log post-treatment reading and notify Flight Surgeon.',
      checklistRefId: 'MED-CHK-GLU-04',
      vitalsCheckRequired: true,
    },
    reassessStep('sug-5', 5, 'MED-CHK-COM-05'),
  ],
  chest_pain: [
    {
      id: 'chp-1',
      stepNumber: 1,
      title: 'Stop all activity. Anchor the patient and keep them still.',
      detail: 'Strap them to the medical restraint, loosen tight clothing and keep them calm. Ask when it started and what it feels like.',
      checklistRefId: 'MED-CHK-CHP-01',
      escalations: [
        { to: 'cardiac_arrest', label: 'No pulse → start CPR' },
        { to: 'collapsed', label: 'Stops responding → Collapsed' },
      ],
    },
    {
      id: 'chp-2',
      stepNumber: 2,
      title: 'Check vitals and attach the heart monitor.',
      detail: 'Heart rate, blood pressure and oxygen. Compare them with their own in-flight usual, not Earth numbers.',
      checklistRefId: 'MED-CHK-CHP-02',
      vitalsCheckRequired: true,
      escalations: [{ to: 'not_breathing', label: 'Not breathing → rescue breaths' }],
    },
    {
      id: 'chp-3',
      stepNumber: 3,
      title: 'Open the Medical Checklist for chest pain and follow it.',
      detail: 'Any medicine and its dose come from the Checklist only. This app gives no doses.',
      checklistRefId: 'MED-CHK-CHP-03',
    },
    {
      id: 'chp-4',
      stepNumber: 4,
      title: 'Keep the AED close and stay with the patient.',
      detail: 'Recheck vitals every 5 minutes. Pain spreading, sweating or breathlessness: tell the Flight Surgeon now.',
      checklistRefId: 'MED-CHK-CHP-04',
      vitalsCheckRequired: true,
      escalations: [{ to: 'cardiac_arrest', label: 'No pulse → start CPR' }],
    },
    reassessStep('chp-5', 5, 'MED-CHK-COM-05'),
  ],
  fever: [
    {
      id: 'fev-1',
      stepNumber: 1,
      title: 'Measure the temperature and compare it with their usual.',
      detail: 'Bodies run warmer in flight, so their own in-flight usual matters more than 37 °C. Note the time.',
      checklistRefId: 'MED-CHK-FEV-01',
      vitalsCheckRequired: true,
    },
    {
      id: 'fev-2',
      stepNumber: 2,
      title: 'Rest, fluids, and keep some distance from the crew.',
      detail: 'In a closed cabin an infection spreads easily. Mask on if the Checklist says so, and use a separate sleep area if possible.',
      checklistRefId: 'MED-CHK-FEV-02',
    },
    {
      id: 'fev-3',
      stepNumber: 3,
      title: 'Look for danger signs.',
      detail: 'Trouble breathing, confusion, a stiff neck, a new rash, or a very fast heart rate.',
      checklistRefId: 'MED-CHK-FEV-03',
      escalations: [
        { to: 'not_breathing', label: 'Not breathing → rescue breaths' },
        { to: 'collapsed', label: 'Confused or not responding → Collapsed' },
      ],
    },
    {
      id: 'fev-4',
      stepNumber: 4,
      title: 'Open the Medical Checklist for fever and follow it.',
      detail: 'Any medicine and its dose come from the Checklist only. Recheck the temperature in 30 minutes.',
      checklistRefId: 'MED-CHK-FEV-04',
      vitalsCheckRequired: true,
    },
    reassessStep('fev-5', 5, 'MED-CHK-COM-05'),
  ],
  other: [
    {
      id: 'oth-1',
      stepNumber: 1,
      title: 'Ensure cabin safety & restrain patient.',
      detail: 'Check cabin air/radiation status strip and secure patient to CMRS.',
      checklistRefId: 'MED-CHK-GEN-01',
      escalations: [
        { to: 'cardiac_arrest', label: 'No pulse → start CPR' },
        { to: 'not_breathing', label: 'Not breathing → rescue breaths' },
        { to: 'bleeding', label: 'Heavy bleeding → Bleeding' },
      ],
    },
    {
      id: 'oth-2',
      stepNumber: 2,
      title: 'Capture full vitals against personal baseline.',
      detail: 'Measure Temp, HR, BP, SpO₂, and symptoms.',
      checklistRefId: 'MED-CHK-GEN-02',
      vitalsCheckRequired: true,
    },
    reassessStep('oth-3', 3, 'MED-CHK-COM-05'),
  ],
};

/** Every step of every protocol, for looking a step up by its id. */
export const ALL_STEPS_BY_ID: ReadonlyMap<string, EmergencyStep> = new Map(
  Object.values(EMERGENCY_PROTOCOLS).flatMap((steps) => steps.map((s) => [s.id, s] as const)),
);
