export const LIST_NAMES = { flares: 'Solar flares', cme: 'Coronal mass ejections (CMEs)', gst: 'Geomagnetic storms', sep: 'Solar particle events' } as const;

/** "2026-08-01/2026-11-14" -> "2026-08-01 to 2026-11-14". */
export const windowText = (range: string) => range.split('/').join(' to ');

/**
 * Required wording (#21), verbatim, on its own line in the Radiation tab. The NASA-STD-3001 citation is a separate
 * sentence (DESIGN_TARGET_SOURCE) so this sentence stays exactly as required.
 */
export const STORM_TARGET_WORDING = 'NASA short-term limit for a solar particle event: 250 mSv effective dose (design requirement based on the October 1989 event)';
export const DESIGN_TARGET_SOURCE = 'Source: NASA-STD-3001.';
