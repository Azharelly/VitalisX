import type { EmergencyCondition, EmergencyStep } from './model';

export const CONDITION_LABELS: Record<EmergencyCondition, string> = {
  bleeding: 'Bleeding',
  collapsed: 'Collapsed',
  not_breathing: 'Not breathing',
  very_low_sugar: 'Very low sugar',
  other: 'Other',
};

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
      title: 'Check vitals & compare to in-flight normal.',
      detail: 'Measure Heart Rate, Blood Pressure, and SpO₂. Uninjured crew already carry lower plasma volume.',
      checklistRefId: 'MED-CHK-BLD-03',
      vitalsCheckRequired: true,
    },
    {
      id: 'bld-4',
      stepNumber: 4,
      title: 'Open Shock & IV Access Kit if bleeding persists.',
      detail: 'Prepare pressure infusion cuff (gravity drip will not flow). Verify amounts in Medical Checklist.',
      checklistRefId: 'MED-CHK-SHK-04',
    },
    {
      id: 'bld-5',
      stepNumber: 5,
      title: 'Send structured packet to Flight Surgeon.',
      detail: 'Transmit automated log and numbered questions. Keep executing checklist steps without waiting.',
      checklistRefId: 'MED-CHK-COM-05',
    },
  ],
  collapsed: [
    {
      id: 'col-1',
      stepNumber: 1,
      title: 'Check responsiveness and breathing for 10 seconds.',
      detail: 'Tap shoulders firmly and shout name. Look for chest rise.',
      checklistRefId: 'MED-CHK-COL-01',
    },
    {
      id: 'col-2',
      stepNumber: 2,
      title: 'Restrain patient and clear airway.',
      detail: 'Anchor patient to Crew Medical Restraint System (CMRS) before starting airway maneuvers.',
      checklistRefId: 'MED-CHK-COL-02',
    },
    {
      id: 'col-3',
      stepNumber: 3,
      title: 'Record baseline vitals & blood glucose.',
      detail: 'Attach pulse oximeter, BP cuff, and check fingerstick glucose.',
      checklistRefId: 'MED-CHK-COL-03',
      vitalsCheckRequired: true,
    },
  ],
  not_breathing: [
    {
      id: 'nbr-1',
      stepNumber: 1,
      title: 'Anchor patient to restraint & start rescue breaths.',
      detail: 'Use bag-valve-mask (BVM) with O₂ reservoir attached.',
      checklistRefId: 'MED-CHK-AIR-01',
    },
    {
      id: 'nbr-2',
      stepNumber: 2,
      title: 'Attach AED / Defibrillator pads immediately.',
      detail: 'Follow voice prompts. Ensure crew are clear of conductive surfaces before shock.',
      checklistRefId: 'MED-CHK-AED-02',
    },
    {
      id: 'nbr-3',
      stepNumber: 3,
      title: 'Begin microgravity chest compressions.',
      detail: 'Use handstand or reverse bear-hug technique per Medical Checklist.',
      checklistRefId: 'MED-CHK-CPR-03',
    },
  ],
  very_low_sugar: [
    {
      id: 'sug-1',
      stepNumber: 1,
      title: 'Check if patient is awake and able to swallow.',
      detail: 'If unconscious or confused, DO NOT give oral fluids or gel (aspiration risk in zero-G).',
      checklistRefId: 'MED-CHK-GLU-01',
    },
    {
      id: 'sug-2',
      stepNumber: 2,
      title: 'Administer fast sugar per Medical Checklist.',
      detail: 'Use oral glucose tube if alert, or prepare glucagon/dextrose kit per Checklist ID.',
      checklistRefId: 'MED-CHK-GLU-02',
    },
    {
      id: 'sug-3',
      stepNumber: 3,
      title: 'Re-test glucose and vitals in 15 minutes.',
      detail: 'Log post-treatment reading and notify Flight Surgeon.',
      checklistRefId: 'MED-CHK-GLU-03',
      vitalsCheckRequired: true,
    },
  ],
  other: [
    {
      id: 'oth-1',
      stepNumber: 1,
      title: 'Ensure cabin safety & restrain patient.',
      detail: 'Check cabin air/radiation status strip and secure patient to CMRS.',
      checklistRefId: 'MED-CHK-GEN-01',
    },
    {
      id: 'oth-2',
      stepNumber: 2,
      title: 'Capture full vitals against personal baseline.',
      detail: 'Measure Temp, HR, BP, SpO₂, and symptoms.',
      checklistRefId: 'MED-CHK-GEN-02',
      vitalsCheckRequired: true,
    },
  ],
};