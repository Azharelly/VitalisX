// Public surface of the Check-in feature (F-03).
export { CheckInConnected, type CheckInConnectedProps } from './CheckInConnected' // real data: use this in App.tsx
export { CheckInScreen, type CheckInScreenProps } from './CheckInScreen'
export { CheckInPreview } from './CheckInPreview' // simulated data, AppPreview only
export { loadCheckIn, saveAndExplain, newTakenAt, type CheckInData } from './connect'
export { toOutcomes, outcomeHeadline, FIELDS, type CheckInAnswers, type Outcome } from './model'
