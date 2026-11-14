// Types for the NASA DONKI snapshot (public/data/donki_snapshot.json).
// Field names match what NASA returns, exactly, so the JSON can be typed without renaming.
// Source: NASA CCMC DONKI API, https://ccmc.gsfc.nasa.gov/DONKI-API/get/<FLR|CME|GST|SEP>
// This is the FULL shape NASA returns. If we slim the snapshot later, we add a slim type next to these.

// ---------- pieces shared by all event types ----------

/** Instrument that observed the event, e.g. "GOES-P: EXIS 1.0-8.0" or "GOES-P: SEISS >100 MeV". */
export interface DonkiInstrument {
    displayName: string;
}

/** Pointer to another DONKI event. The id ends with the type: "...-FLR-001", "-CME-001", "-IPS-001", "-HSS-001", "-MPC-001".
 *  The linked event may NOT be in our snapshot (it can be outside our date window). */
export interface DonkiLinkedEvent {
    activityID: string;
}

/** An alert NASA sent about the event. */
export interface DonkiNotification {
    messageID: string;         // e.g. "20261008-AL-001"
    messageIssueTime: string;  // UTC, "2026-10-08T15:48Z"
    messageURL: string;
}

/** Fields every DONKI record has. Times are UTC strings like "2026-10-04T06:13Z" (no seconds); new Date() parses them. */
export interface DonkiBase {
    link: string;                                  // page of this event on the DONKI site
    linkedEvents: DonkiLinkedEvent[] | null;
    sentNotifications: DonkiNotification[] | null;
    submissionTime: string;
    versionId: number;                             // NASA can revise an event; higher = newer
}

// ---------- FLR: solar flares ----------
export interface DonkiFlare extends DonkiBase {
    flrID: string;                 // PK, e.g. "2026-10-08T15:29:00-FLR-001"
    catalog: string;               // "M2M_CATALOG"
    instruments: DonkiInstrument[];
    beginTime: string;
    peakTime: string;
    endTime: string;
    classType: string;             // X-ray class: letter + number, e.g. "M6.7". Letters grow A < B < C < M < X.
    sourceLocation: string;        // position on the Sun, e.g. "N12W20"
    activeRegionNum: number;       // sunspot region, e.g. 14549
    note: string;                  // can be ""
}

// ---------- CME: coronal mass ejections ----------

/** One WSA-Enlil model prediction: where and when a CME may arrive. */
export interface DonkiEnlilImpact {
    location: string;              // planet or spacecraft. Seen in our data: Mars, STEREO A, Solar Orbiter, Psyche, Juice, Europa Clipper, ...
    arrivalTime: string;
    isGlancingBlow: boolean;
    isMinorImpact: boolean;
}

export interface DonkiEnlilRun {
    modelCompletionTime: string;
    au: number;
    estimatedShockArrivalTime: string | null;
    isEarthGB: boolean;
    isEarthMinorImpact: boolean;
    rmin_re: number | null;
    kp_18: number | null;
    kp_90: number | null;
    kp_135: number | null;
    kp_180: number | null;
    estimatedDuration: number | null;
    link: string;
    impactList: DonkiEnlilImpact[];
    cmeIDs: string[];
}

/** One measurement of the CME. A CME can have several; use the one with isMostAccurate = true. */
export interface DonkiCmeAnalysis {
    isMostAccurate: boolean;
    levelOfData: number;
    time21_5: string;
    latitude: number;
    longitude: number | null;
    halfAngle: number;
    speed: number;                 // km/s
    type: string;                  // seen: "S", "C", "O"
    featureCode: string;
    imageType: string;
    measurementTechnique: string;
    note: string;
    minorHalfWidth: number | null;
    speedMeasuredAtHeight: number | null;
    tilt: number | null;
    submissionTime: string;
    link: string;
    enlilList: DonkiEnlilRun[];
}

export interface DonkiCme extends DonkiBase {
    activityID: string;            // PK, e.g. "2026-10-10T16:15:00-CME-001"
    catalog: string;
    startTime: string;
    instruments: DonkiInstrument[];
    sourceLocation: string;        // can be ""
    activeRegionNum: number | null;
    note: string;
    cmeAnalyses: DonkiCmeAnalysis[];   // can be empty
}

// ---------- GST: geomagnetic storms ----------
export interface DonkiKpReading {
    kpIndex: number;               // 0 to 9, can be fractional like 5.67
    observedTime: string;
    source: string;                // "NOAA"
}

export interface DonkiGeomagneticStorm extends DonkiBase {
    gstID: string;                 // PK
    startTime: string;
    allKpIndex: DonkiKpReading[];
}

// ---------- SEP: solar energetic particle events ----------
// One real episode shows up as SEVERAL records (one per instrument/channel), e.g. 6 records on 2026-07-30.
// To count episodes, group records by the same linkedEvents (that is a later step).
export interface DonkiSep extends DonkiBase {
    sepID: string;                 // PK, e.g. "2026-09-05T15:45:00-SEP-001"
    eventTime: string;
    instruments: DonkiInstrument[]; // e.g. "GOES-P: SEISS >10 MeV", "GOES-P: SEISS >100 MeV", "SOHO: COSTEP ...", "MODEL: ..."
}

// ---------- the file we ship: public/data/donki_snapshot.json ----------
export interface DonkiSnapshot {
    source: string;                // where the data came from
    generated_at: string;          // "2026-11-14", date we captured it; the UI shows it
    ranges: {                      // window of each list, "yyyy-mm-dd/yyyy-mm-dd". They are NOT the same for all lists.
        flares: string;
        cme: string;
        gst: string;
        sep: string;
    };
    flares: DonkiFlare[];
    cme: DonkiCme[];
    gst: DonkiGeomagneticStorm[];
    sep: DonkiSep[];
}