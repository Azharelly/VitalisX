// Public surface of the Crew feature (crew board, avatar row, add / remove, shared person selection).
export { CrewProvider } from './CrewProvider'
export { useCrew, type CrewContextValue, type CrewBoardState } from './useCrew.ts'
export { AvatarRow } from './AvatarRow'
export { CrewScreen, type CrewActions } from './CrewScreen'
export { httpCrewApi, parseCrewBoard, type CrewApi } from './api.ts'
export { simulatedCrewApi } from '../today/simulate.ts'
export { checkNewMember, NAME_MAX, ROLE_MAX, type CrewBoard, type CrewCard, type NewMember } from './model.ts'
