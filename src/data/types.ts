// One type per data store. Field names match the data files exactly.

// ---------- shared words ----------
export type Zone = 'mind' | 'eyes' | 'heart' | 'bone' | 'immune' | 'meta';
export type MetricId =
    | 'sleep' | 'mood' | 'vision' | 'hr' | 'sys' | 'dia' | 'spo2'
    | 'exercise' | 'weight' | 'temp' | 'symptoms' | 'glucose' | 'fluids'
    | 'rad_projection';                       // radiation uses its own metric id
export type Level = 'watch' | 'alert';       // what is stored in an alert
export type State = 'ok' | 'watch' | 'alert' | 'learn' | 'none';   // what the engine returns

export type Context =
    | 'fasting' | 'after_meal' | 'resting' | 'after_exercise' | 'morning' | 'other';

export type EmergencyCategory =
    | 'unresponsive' | 'chest_pain' | 'injury' | 'breathing' | 'fever' | 'other';

// Mind data is private in Crew and in the avatar status. In an emergency it is shown.
export const PRIVATE_ZONES: Zone[] = ['mind'];

// ---------- the 7 data stores ----------
export interface CrewMember {
    id: number;                // PK
    name: string;
    role: string;              // Commander, Flight engineer, ...
    sex: 'F' | 'M';            // picks the body drawing in Today
    initials: string;
    prior_dose_msv: number;    // radiation from earlier missions
    joined_mission_day: number;
    is_simulated: boolean;
}

export interface Metric {
    id: MetricId;              // PK (text)
    label: string;
    unit: string;
    zone: Zone | 'radiation';
    direction: 'low_is_bad' | 'high_is_bad' | 'both' | 'rule_only';
    min_sd: number | null;     // floor for the variation, so a flat series is not hypersensitive
    abs_low: number | null;    // lowest acceptable value; below it = Alert
    abs_high: number | null;   // highest acceptable value; above it = Alert (temp: 37.9 means fever from 38.0)
    abs_rule: string | null;   // plain-language rule, shown in "Why?" (soft rules stay in code)
    default_context: Context | null;  // used when a reading has no context
    decimals: number;
    priority: number;          // 1 = most urgent. Sort: level, then priority, then |z|
    source_ids: string[];      // -> ReferenceSource.id
}

export interface Measurement {
    id: number;                // PK
    crew_id: number;           // FK -> CrewMember.id
    metric_id: MetricId;       // FK -> Metric.id
    mission_day: number;
    taken_at: string;          // ISO date-time. Unique per crew_id + metric_id + taken_at
    context: Context | null;   // null = use Metric.default_context
    value: number;
    source: 'checkin' | 'device';   // 'device' is for the future Sync device feature
    is_simulated: boolean;
}

export interface RadiationDose {
    id: number;                // PK
    crew_id: number;           // FK
    mission_day: number;
    date: string;
    dose_msv: number;          // dose equivalent for that day
    environment: 'iss' | 'mars_transit' | 'mars_surface';
    sep_flag: boolean;         // solar particle event day
    event_id: string | null;   // e.g. "SEP-3"
    is_simulated: boolean;
}

export interface EvidencePoint {
    mission_day: number;
    value?: number;            // for normal metrics
    career_msv?: number;       // for the radiation alert
}

export interface Alert {
    id: number;                // PK
    crew_id: number;           // FK
    metric_id: MetricId;       // FK. Sources come from the metric
    zone: Zone | 'radiation';
    level: Level;
    raised_day: number;
    resolved_day: number | null;
    status: 'open' | 'resolved';
    rule: string | null;
    value: number | null;
    z: number | null;
    baseline_median: number | null;
    baseline_sd: number | null;
    evidence: EvidencePoint[]; // feeds the chart in "Why?"
    is_simulated: boolean;
}

export type ActionKind = 'recommended' | 'done' | 'sbar_outbox' | 'emergency';
export type ActionStatus = 'shown' | 'done' | 'queued' | 'sent' | 'resolved';

// Which statuses are valid for each kind.
export const VALID_STATUS: Record<ActionKind, ActionStatus[]> = {
    recommended: ['shown', 'done'],
    done: ['done'],
    sbar_outbox: ['queued', 'sent'],
    emergency: ['queued', 'sent', 'resolved'],
};

export interface ActionLog {
    id: number;                // PK
    crew_id: number;           // FK (pending: optional if "whole crew" emergencies are kept)
    alert_id: number | null;   // FK, optional
    mission_day: number;
    created_at: string;        // ISO date-time
    kind: ActionKind;
    category: EmergencyCategory | null;  // only for kind = 'emergency'
    text: string;              // for emergency: final message to Earth (SBAR + free note)
    status: ActionStatus;
    delay_sec: number | null;  // communication delay for the outbox
    is_simulated: boolean;
}

export interface ReferenceSource {
    id: string;                // PK (text)
    title: string;
    finding: string;
    link_or_doi: string;
    used_for: string;
}

// ---------- what the detection engine returns ----------
export interface Baseline {
    median: number;
    sd: number;                // 1.4826 x MAD, never below min_sd
    n: number;                 // data points used (needs 14 or more), same context only
}

export interface MetricEval {
    state: State;
    value: number | null;
    z: number | null;
    baseline: Baseline | null;
    rule: string | null;       // which rule fired
}

export type ZoneStates = Record<Zone, State>;

// ---------- config file (not a table): mission_config.json ----------
export interface MissionConfig {
    environment: 'iss' | 'mars_transit' | 'mars_surface';
    today_mission_day: number;
    arrival_day: number;
    launch_date: string;       // fictional
    comms_delay_sec: number;
}
