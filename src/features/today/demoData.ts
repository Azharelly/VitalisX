import type { TodayView } from './model'

// Simulated (is_simulated = true). Ravi's story from the dossier: fever Alert, heart rate Watch, symptoms logged.
// shortcut: hand-written fixture, replace with the engine/Dexie output once src/engine lands.
export const raviToday: TodayView = {
  person: { name: 'Ravi Menon', role: 'Systems engineer' },
  missionDay: 142,
  nextAction: {
    text: 'Re-measure your temperature in 1 hour and send a report to the flight surgeon.',
    metricId: 'temp',
  },
  readings: [
    { id: 'temp', label: 'Temperature', zone: 'immune', value: 38.2, unit: '°C', decimals: 1, level: 'alert', priority: 4, usual: [36.8, 37.3], context: 'resting', measured: 'Day 142, 07:40', action: 'Rest, drink fluids and re-measure in 1 hour.' },
    { id: 'hr', label: 'Resting heart rate', zone: 'heart', value: 84, unit: 'bpm', decimals: 0, level: 'watch', priority: 3, usual: [61, 70], context: 'resting', measured: 'Day 142, 07:40', action: 'Re-check after the temperature reading; fever raises pulse.' },
    { id: 'symptoms', label: 'Symptoms', zone: 'immune', value: 2, unit: 'of 3', decimals: 0, level: 'watch', priority: 5, measured: 'Day 142, 07:45', note: 'Headache, chills', action: 'Log any change in the next check-in.' },
    { id: 'spo2', label: 'SpO₂', zone: 'heart', value: 97, unit: '%', decimals: 0, level: 'ok', priority: 1, usual: [96, 99], context: 'resting', measured: 'Day 142, 07:40' },
    { id: 'glucose', label: 'Glucose', zone: 'meta', value: 94, unit: 'mg/dL', decimals: 0, level: 'ok', priority: 2, usual: [86, 102], context: 'fasting', measured: 'Day 142, 07:30' },
    { id: 'bp_sys', label: 'Blood pressure, systolic', zone: 'heart', value: 114, unit: 'mmHg', decimals: 0, level: 'ok', priority: 3, usual: [106, 120], context: 'resting', measured: 'Day 142, 07:40' },
    { id: 'bp_dia', label: 'Blood pressure, diastolic', zone: 'heart', value: 72, unit: 'mmHg', decimals: 0, level: 'ok', priority: 3, usual: [65, 77], context: 'resting', measured: 'Day 142, 07:40' },
    { id: 'vision', label: 'Vision self-check', zone: 'eyes', value: 0, unit: 'of 3', decimals: 0, level: 'ok', priority: 6, measured: 'Day 142, 07:45', note: 'No blur reported' },
    { id: 'rad', label: 'Career dose', zone: 'radiation', value: 291, unit: 'mSv', decimals: 0, level: 'ok', priority: 7, measured: 'Day 142', note: '49% of the 600 mSv career limit' },
    { id: 'sleep', label: 'Sleep', zone: 'mind', value: 6.3, unit: 'h', decimals: 1, level: 'ok', priority: 8, usual: [5.8, 7.0], measured: 'Night of day 141' },
    { id: 'mood', label: 'Mood', zone: 'mind', value: 3, unit: 'of 5', decimals: 0, level: 'ok', priority: 8, usual: [3, 4], measured: 'Day 142, 07:45' },
    { id: 'weight', label: 'Weight', zone: 'bone', value: 71.4, unit: 'kg', decimals: 1, level: 'ok', priority: 8, usual: [70.9, 72.2], context: 'morning', measured: 'Day 142, 07:20' },
    { id: 'exercise', label: 'Exercise sessions', zone: 'bone', value: 5, unit: 'of 6 this week', decimals: 0, level: 'ok', priority: 8, measured: 'Day 141' },
    { id: 'fluids', label: 'Fluids', zone: 'meta', value: 2.2, unit: 'L', decimals: 1, level: 'ok', priority: 8, usual: [2.0, 2.6], measured: 'Day 141' },
  ],
}
