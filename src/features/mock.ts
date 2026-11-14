// TEMPORARY mock data (Kenji's story) until the real data layer exists.
// Replace with doses from IndexedDB + mission_config.json.
import type { RadiationDose } from '../../data/types';

export const MOCK = {
  priorDoseMsv: 130,
  currentDay: 142,
  arrivalDay: 210,
  doses: Array.from({ length: 142 }, (_, i): RadiationDose => ({
    id: i + 1,
    crew_id: 2,
    mission_day: i + 1,
    date: '',
    dose_msv: 275 / 142,
    environment: 'mars_transit',
    sep_flag: false,
    event_id: null,
    is_simulated: true,
  })),
};
