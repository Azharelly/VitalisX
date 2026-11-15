// scripts/generate_data.mjs
// Builds the simulated data files for the demo. EVERYTHING HERE IS MADE UP (is_simulated = true).
//
//   node scripts/generate_data.mjs
//
// Writes to public/data/:
//   crew_member.json  metric.json  reference_source.json  measurement.json  radiation_dose_log.json
//   mission_config.json   (configuration, not a table)
// alert.json and action_log.json are NOT written here: alerts must come from the real engine, so they are
// built by replaying these readings through recompute(). See src/data/replayAlerts.test.ts.
// (If either file is missing, an empty list is created so the seed never fails on a missing file.)
//
// The series follow the same model as src/features/today/simulate.ts (same seeds, same stories), so the
// Today screen shows the same people whether it reads simulated memory or this data.
// The values are calibrated to published orders of magnitude (see reference_source.json), not real astronauts.
//
// Bump DATASET_VERSION in src/data/seed.ts every time these files change.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'public/data/';

// ---------- the mission (matches mission_config.json) ----------
const MISSION = {
  environment: 'mars_transit',
  today_mission_day: 142,
  arrival_day: 210,
  launch_date: '2031-02-01', // fictional
  comms_delay_sec: 720,
};
const FIRST_DAY = 80; // readings start here: enough for a 28-day baseline plus a 28-day "previous period"
const STORM_DAYS = [38, 77, 115, 150, 181]; // simulated solar particle events (only those <= today are logged)
const MISS_RATE = 0.08; // about 8% of days have no check-in, never on a story day

// ---------- deterministic randomness (same functions as simulate.ts) ----------
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const round = (v, d) => Number(v.toFixed(d));
const clamp = (v, lo = -Infinity, hi = Infinity) => Math.min(hi, Math.max(lo, v));

// ---------- the crew: four stories ----------
// simId is the id used for the random seeds (kept equal to simulate.ts so the numbers match).
const CREW = [
  { id: 1, simId: 'amara', name: 'Amara Okafor', role: 'Commander', sex: 'F', initials: 'AO', prior: 25, doseRate: 1.84, shift: { hr: -4, sleep: 0.1, bp_sys: -3 } },
  { id: 2, simId: 'kenji', name: 'Kenji Tanaka', role: 'Flight engineer', sex: 'M', initials: 'KT', prior: 130, doseRate: 1.88, shift: { hr: 2, weight: 6, sleep: -0.1 } },
  { id: 3, simId: 'lucia', name: 'Lucía Fernández', role: 'Mission specialist', sex: 'F', initials: 'LF', prior: 10, doseRate: 1.82, shift: { hr: -2, weight: -9 } },
  { id: 4, simId: 'ravi', name: 'Ravi Menon', role: 'Systems engineer', sex: 'M', initials: 'RM', prior: 35, doseRate: 1.85, shift: {} },
];

const range = (from, to, v) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, v]));

// Story events: crew -> metric (simId) -> mission day -> offset (or severity 0..3 for symptoms and vision).
const EVENTS = {
  ravi: {
    temp: { 140: 0.15, 141: 0.55, 142: 1.25, 143: 0.8, 144: 0.35 },
    hr: { 140: 2.5, 141: 3, 142: 3, 143: 2.5, 144: 1 },
    fluids: { 142: -0.2 },
    symptoms: { 141: 1, 142: 2, 143: 2, 144: 1 },
  },
  amara: { sleep: range(136, 146, -0.85), mood: range(139, 146, -0.7), vision: { 95: 1 } },
  kenji: { exercise: range(120, 127, -1) },
  lucia: { symptoms: { 88: 1 } },
};

// ---------- the metrics ----------
// Baseline (robust z) metrics. `sim*` is the generating model; the rest goes into metric.json.
// id is the id in src/data/types.ts (MetricId); simId is the id used by simulate.ts for the seeds.
const Z_METRICS = [
  { id: 'spo2', simId: 'spo2', label: 'SpO₂', zone: 'heart', unit: '%', decimals: 0, priority: 1, mean: 97.6, sd: 0.6, minSd: 1, direction: 'low_is_bad', absLow: 92, absRule: 'Below 92% is outside the safe range (our own design rule)', context: 'resting', max: 100, sources: ['nasa_std_3001_v2'] },
  { id: 'glucose', simId: 'glucose', label: 'Glucose', zone: 'meta', unit: 'mg/dL', decimals: 0, priority: 2, mean: 93, sd: 4, minSd: 4, direction: 'both', absLow: 70, absHigh: 180, absRule: 'Outside 70 to 180 mg/dL (Earth reference range)', context: 'fasting', sources: ['battelino_2019', 'design_rule'] },
  { id: 'hr', simId: 'hr', label: 'Resting heart rate', zone: 'heart', unit: 'bpm', decimals: 0, priority: 3, mean: 66, sd: 1.6, minSd: 2.5, direction: 'both', context: 'resting', sources: ['norsk_2015'] },
  { id: 'sys', simId: 'bp_sys', label: 'Systolic BP', zone: 'heart', unit: 'mmHg', decimals: 0, priority: 3, mean: 113, sd: 3, minSd: 3, direction: 'both', context: 'resting', sources: ['norsk_2015'] },
  { id: 'dia', simId: 'bp_dia', label: 'Diastolic BP', zone: 'heart', unit: 'mmHg', decimals: 0, priority: 3, mean: 71, sd: 2, minSd: 2.5, direction: 'both', context: 'resting', sources: ['norsk_2015'] },
  { id: 'temp', simId: 'temp', label: 'Temperature', zone: 'immune', unit: '°C', decimals: 1, priority: 4, mean: 36.95, sd: 0.1, minSd: 0.12, direction: 'high_is_bad', absHigh: 37.9, absRule: 'Fever from 38.0 °C', context: 'resting', sources: ['stahn_2017', 'design_rule'] },
  { id: 'sleep', simId: 'sleep', label: 'Sleep', zone: 'mind', unit: 'h', decimals: 1, priority: 8, mean: 6.5, sd: 0.25, minSd: 0.25, direction: 'low_is_bad', min: 0, max: 12, sources: ['barger_2014', 'otsuka_2021'] },
  { id: 'mood', simId: 'mood', label: 'Mood', zone: 'mind', unit: '/5', decimals: 0, priority: 8, mean: 3.6, sd: 0.4, minSd: 0.7, direction: 'low_is_bad', min: 1, max: 5, sources: ['design_rule'] },
  { id: 'weight', simId: 'weight', label: 'Weight', zone: 'bone', unit: 'kg', decimals: 1, priority: 8, mean: 71.5, sd: 0.2, minSd: 0.3, direction: 'both', context: 'morning', sources: ['lang_2004'] },
  { id: 'fluids', simId: 'fluids', label: 'Fluids', zone: 'meta', unit: 'L', decimals: 1, priority: 8, mean: 2.3, sd: 0.12, minSd: 0.15, direction: 'low_is_bad', min: 0, sources: ['design_rule'] },
];

// Rule-only metrics: no personal band, fixed rules live in the engine (evaluate.ts).
const RULE_ONLY = [
  { id: 'symptoms', label: 'Symptoms', zone: 'immune', unit: '/3', decimals: 0, priority: 5, sources: ['design_rule'] },
  { id: 'vision', label: 'Vision self-check', zone: 'eyes', unit: '/3', decimals: 0, priority: 6, sources: ['gew_2026'] },
  { id: 'exercise', label: 'Exercise', zone: 'bone', unit: 'min', decimals: 0, priority: 8, sources: ['design_rule'] },
];

const metricRows = [
  ...Z_METRICS.map((d) => ({
    id: d.id, label: d.label, unit: d.unit, zone: d.zone, direction: d.direction,
    min_sd: d.minSd, abs_low: d.absLow ?? null, abs_high: d.absHigh ?? null, abs_rule: d.absRule ?? null,
    default_context: d.context ?? null, decimals: d.decimals, priority: d.priority, source_ids: d.sources,
  })),
  ...RULE_ONLY.map((d) => ({
    id: d.id, label: d.label, unit: d.unit, zone: d.zone, direction: 'rule_only',
    min_sd: null, abs_low: null, abs_high: null, abs_rule: null,
    default_context: null, decimals: d.decimals, priority: d.priority, source_ids: d.sources,
  })),
  {
    id: 'rad_projection', label: 'Career dose', unit: 'mSv', zone: 'radiation', direction: 'rule_only',
    min_sd: null, abs_low: null, abs_high: null,
    abs_rule: 'Career limit 600 mSv (NASA-STD-3001 Vol. 1). Watch from 80% projected at arrival (our own design rule)',
    default_context: null, decimals: 0, priority: 7, source_ids: ['nasa_std_3001_v1', 'zeitlin_2013', 'guo_2015'],
  },
];

// ---------- the references ----------
// APA 7 citations, checked against each paper's DOI record on 2026-11-15. `citation` marks italics with *asterisks*.
// link_or_doi holds the DOI link (or the document URL for NASA documents) and nothing else.
const referenceRows = [
  { id: "barger_2014", title: "Barger et al., Lancet Neurology 2014", citation: "Barger, L. K., Flynn-Evans, E. E., Kubey, A., Walsh, L., Ronda, J. M., Wang, W., Wright, K. P., Jr., & Czeisler, C. A. (2014). Prevalence of sleep deficiency and use of hypnotic drugs in astronauts before, during, and after spaceflight: An observational study. *The Lancet Neurology, 13*(9), 904–912.", finding: "Orders of magnitude for in-flight sleep; used to set the simulated mean of about 6.5 h.", link_or_doi: "https://doi.org/10.1016/S1474-4422(14)70122-X", used_for: "sleep" },
  { id: "otsuka_2021", title: "Otsuka et al., Scientific Reports 2021", citation: "Otsuka, K., Cornelissen, G., Furukawa, S., Kubo, Y., Shibata, K., Mizuno, K., Ohshima, H., & Mukai, C. (2021). Astronauts well-being and possibly anti-aging improved during long-duration spaceflight. *Scientific Reports, 11*(1), Article 14907.", finding: "Sleep data in spaceflight; used with Barger 2014 to calibrate simulated sleep.", link_or_doi: "https://doi.org/10.1038/s41598-021-94478-w", used_for: "sleep" },
  { id: "norsk_2015", title: "Norsk et al., Journal of Physiology 2015", citation: "Norsk, P., Asmar, A., Damgaard, M., & Christensen, N. J. (2015). Fluid shifts, vasodilatation and ambulatory blood pressure reduction during long duration spaceflight. *The Journal of Physiology, 593*(3), 573–584.", finding: "Reference for heart rate and blood pressure in flight: heart rate unchanged and blood pressure about 10 mmHg lower than on the ground. The simulated values are our own approximation.", link_or_doi: "https://doi.org/10.1113/jphysiol.2014.284869", used_for: "hr, sys, dia" },
  { id: "nasa_std_3001_v1", title: "NASA-STD-3001 Volume 1 (Rev C)", citation: "National Aeronautics and Space Administration. (2023). *NASA spaceflight human-system standard: Volume 1—Crew health* (NASA-STD-3001, Vol. 1, Rev. C). Office of the Chief Health and Medical Officer.", finding: "Requirement V1 4030 (section 4.8.2): a crewmember's total career effective dose from spaceflight radiation shall be less than 600 mSv, the same for all ages and sexes. Requirement V1 4031 (section 4.8.3): protect crewmembers from the design reference solar particle event (the October 1989 events combined) to less than 250 mSv effective dose. That 250 mSv is a design target, not a personal dose limit.", link_or_doi: "https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf", used_for: "rad_projection" },
  { id: "nasa_std_3001_v2", title: "NASA OCHMO-TB-003 Habitable Atmosphere", citation: "National Aeronautics and Space Administration. (2023). *Habitable atmosphere* (OCHMO-TB-003, Rev. A) [Technical brief]. Office of the Chief Health and Medical Officer.", finding: "Technical brief derived from NASA-STD-3001 Volume 2 (Rev D), requirement V2 6003: defines the allowed oxygen range in the cabin air (inspired oxygen partial pressure). Our 92% SpO2 alert limit is our own design rule, not a NASA limit.", link_or_doi: "https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-003-habitable-atmosphere.pdf", used_for: "spo2" },
  { id: "zeitlin_2013", title: "Zeitlin et al., Science 2013", citation: "Zeitlin, C., Hassler, D. M., Cucinotta, F. A., Ehresmann, B., Wimmer-Schweingruber, R. F., Brinza, D. E., Kang, S., Weigle, G., Böttcher, S., Böhm, E., Burmeister, S., Guo, J., Köhler, J., Martin, C., Posner, A., Rafkin, S., & Reitz, G. (2013). Measurements of energetic particle radiation in transit to Mars on the Mars Science Laboratory. *Science, 340*(6136), 1080–1084.", finding: "Dose-equivalent rate measured on the way to Mars (MSL RAD), about 1.8 mSv/day; used for the simulated transit rate.", link_or_doi: "https://doi.org/10.1126/science.1235989", used_for: "rad_projection" },
  { id: "guo_2015", title: "Guo et al., Astronomy & Astrophysics 2015", citation: "Guo, J., Zeitlin, C., Wimmer-Schweingruber, R. F., Hassler, D. M., Posner, A., Heber, B., Köhler, J., Rafkin, S., Ehresmann, B., Appel, J. K., Böhm, E., Böttcher, S., Burmeister, S., Brinza, D. E., Lohf, H., Martin, C., & Reitz, G. (2015). Variations of dose rate observed by MSL/RAD in transit to Mars. *Astronomy & Astrophysics, 577*, Article A58.", finding: "Dose rate measured inside a spacecraft on the way to Mars, including short jumps during solar particle events; used as background for the simulated storm spikes. The size of the spikes is simulated.", link_or_doi: "https://doi.org/10.1051/0004-6361/201525680", used_for: "rad_projection" },
  { id: "stahn_2017", title: "Stahn et al., Scientific Reports 2017", citation: "Stahn, A. C., Werner, A., Opatz, O., Maggioni, M. A., Steinach, M., Weller von Ahlefeld, V., Moore, A., Crucian, B. E., Smith, S. M., Zwart, S. R., Schlabs, T., Mendt, S., Trippel, T., Koralewski, E., Koch, J., Choukèr, A., Reitz, G., Shang, P., Röcker, L., . . . Gunga, H.-C. (2017). Increased core body temperature in astronauts during long-duration space missions. *Scientific Reports, 7*(1), Article 16180.", finding: "Reference for body temperature in spaceflight. The 38.0 °C fever limit is our own design rule.", link_or_doi: "https://doi.org/10.1038/s41598-017-15560-w", used_for: "temp" },
  { id: "lang_2004", title: "Lang et al., Journal of Bone and Mineral Research 2004", citation: "Lang, T., LeBlanc, A., Evans, H., Lu, Y., Genant, H., & Yu, A. (2004). Cortical and trabecular bone mineral loss from the spine and hip in long-duration spaceflight. *Journal of Bone and Mineral Research, 19*(6), 1006–1012.", finding: "Reference for bone loss in long-duration spaceflight (Bones and muscle zone).", link_or_doi: "https://doi.org/10.1359/JBMR.040307", used_for: "weight" },
  { id: "battelino_2019", title: "Battelino et al., Diabetes Care 2019 (Earth reference)", citation: "Battelino, T., Danne, T., Bergenstal, R. M., Amiel, S. A., Beck, R. W., Biester, T., Bosi, E., Buckingham, B. A., Cefalu, W. T., Close, K. L., Cobelli, C., Dassau, E., DeVries, J. H., Donaghue, K. C., Dovč, K., Doyle, F. J., Garg, S. K., Grunberger, G., Heller, S., . . . Phillip, M. (2019). Clinical targets for continuous glucose monitoring data interpretation: Recommendations from the international consensus on time in range. *Diabetes Care, 42*(8), 1593–1603.", finding: "Earth consensus range for glucose targets (70 to 180 mg/dL). Not validated for spaceflight.", link_or_doi: "https://doi.org/10.2337/dci19-0028", used_for: "glucose" },
  { id: "gew_2026", title: "Gew et al., Eye 2026", citation: "Gew, J., Hyder, Y. F., Grech, O., Brunstetter, T., Tarver, W., Mason, S. S., Gibson, C. R., Polk, J. D., Schneider, V. S., van Baalen, M., Mitchell, J. L., Yiangou, A., Mollan, S. P., & Sinclair, A. J. (2026). Spaceflight-associated neuro-ocular syndrome (SANS): Expert consensus on diagnosis and management. *Eye, 40*(12), 1794–1805.", finding: "Expert consensus on diagnosing and managing spaceflight-associated neuro-ocular syndrome (SANS); reference for the vision self-check.", link_or_doi: "https://doi.org/10.1038/s41433-026-04651-6", used_for: "vision" },
  { id: "design_rule", title: "Design rule (our own design, not NASA's)", citation: "Design rule (our own design, not NASA's)", finding: "Thresholds chosen by the team for this demo. Decision support only.", link_or_doi: "", used_for: "mood, fluids, exercise, symptoms, glucose, temp" },
];

// ---------- dates ----------
const dayMs = 86_400_000;
const launchMs = Date.parse(`${MISSION.launch_date}T00:00:00Z`);
const isoDay = (missionDay) => new Date(launchMs + (missionDay - 1) * dayMs).toISOString().slice(0, 10);

// ---------- the model (same as simulate.ts) ----------
const eventOn = (c, day) => Object.values(EVENTS[c.simId] ?? {}).some((m) => day in m);

/** A check-in is missed about 8% of days, never on a story day. Shared by all metrics of that person. */
function missed(c, day) {
  return !eventOn(c, day) && rng(`${c.simId}:miss:${day}`)() < MISS_RATE;
}

function checkInTime(c, day) {
  const mins = 6 * 60 + 50 + Math.floor(rng(`${c.simId}:time:${day}`)() * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/** Daily series for one metric, days 1..today (index = mission day), with AR(1) day-to-day memory. */
function series(c, d) {
  const r = rng(`${c.simId}:${d.simId}`);
  const out = [null];
  let x = 0;
  for (let day = 1; day <= MISSION.today_mission_day; day++) {
    x = 0.6 * x + 0.8 * gauss(r);
    const v = d.mean + (c.shift[d.simId] ?? 0) + x * d.sd + (EVENTS[c.simId]?.[d.simId]?.[day] ?? 0);
    out.push(missed(c, day) ? null : round(clamp(v, d.min, d.max), d.decimals));
  }
  return out;
}

const exerciseDone = (c, day) =>
  rng(`${c.simId}:ex:${day}`)() < (EVENTS[c.simId]?.exercise?.[day] ? 0.15 : 0.85);
const exerciseMinutes = (c, day) => 30 + Math.floor(rng(`${c.simId}:exmin:${day}`)() * 31);

const dailyDose = (c, day) =>
  c.doseRate + (rng(`${c.simId}:dose:${day}`)() - 0.5) * 0.2 + (STORM_DAYS.includes(day) ? 2.6 : 0);

// ---------- build the tables ----------
const crew_member = CREW.map((c) => ({
  id: c.id, name: c.name, role: c.role, sex: c.sex, initials: c.initials,
  prior_dose_msv: c.prior, joined_mission_day: 0, removed_at: null, is_simulated: true,
}));

const zSeries = new Map(CREW.flatMap((c) => Z_METRICS.map((d) => [`${c.id}:${d.id}`, series(c, d)])));

const measurement = [];
let nextId = 1;
const push = (c, metricId, day, value, context) => {
  measurement.push({
    id: nextId++, crew_id: c.id, metric_id: metricId, mission_day: day,
    taken_at: `${isoDay(day)}T${checkInTime(c, day)}:00Z`, context, value, source: 'checkin', is_simulated: true,
  });
};
for (let day = FIRST_DAY; day <= MISSION.today_mission_day; day++) {
  for (const c of CREW) {
    if (missed(c, day)) continue;
    for (const d of Z_METRICS) push(c, d.id, day, zSeries.get(`${c.id}:${d.id}`)[day], d.context ?? null);
    for (const id of ['symptoms', 'vision']) {
      push(c, id, day, clamp(EVENTS[c.simId]?.[id]?.[day] ?? 0, 0, 3), null);
    }
    push(c, 'exercise', day, exerciseDone(c, day) ? exerciseMinutes(c, day) : 0, null);
  }
}

const radiation_dose_log = [];
for (const c of CREW) {
  for (let day = 1; day <= MISSION.today_mission_day; day++) {
    const storm = STORM_DAYS.indexOf(day);
    radiation_dose_log.push({
      id: radiation_dose_log.length + 1, crew_id: c.id, mission_day: day, date: isoDay(day),
      dose_msv: round(dailyDose(c, day), 2), environment: 'mars_transit',
      sep_flag: storm >= 0, event_id: storm >= 0 ? `SEP-${storm + 1}` : null, is_simulated: true,
    });
  }
}

// ---------- write ----------
mkdirSync(OUT, { recursive: true });
const write = (name, data) => writeFileSync(`${OUT}${name}.json`, JSON.stringify(data));
write('crew_member', crew_member);
write('metric', metricRows);
write('reference_source', referenceRows);
write('measurement', measurement);
write('radiation_dose_log', radiation_dose_log);
write('mission_config', MISSION);
for (const name of ['alert', 'action_log']) {
  if (!existsSync(`${OUT}${name}.json`)) write(name, []);
}

console.log('OK:', {
  crew_member: crew_member.length, metric: metricRows.length, reference_source: referenceRows.length,
  measurement: measurement.length, radiation_dose_log: radiation_dose_log.length,
});
