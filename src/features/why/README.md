# Why? (F-05)

The modal that explains a Watch / Alert. Opens from Today (next-step card and attention cards), from Report (any trend card, and the Radiation panel) and from the Radiation tab.

## What it shows

| Part | Behaviour |
|---|---|
| Reason | One sentence from the evidence (`whySentence`). For `rad`: career dose against the 600 mSv limit; the engine's own reasons are shown under it. |
| Evidence chart | **Frozen**: the snapshot stored on the day the alert was raised (`FrozenEvidence`: raise day, value, usual band, last readings). Tagged "Frozen evidence · as of day N", dashed frame, lock icon; says it does not change with new readings. The latest value is shown apart ("Since then: …"). No snapshot stored: tagged "Live readings · no snapshot stored", never presented as frozen. |
| 3-step ladder | 1 **Do now** (`actionFor`, Alert step for Alert, plus "what helps") → 2 **Measure again** (`measure`) → 3 **Tell the flight surgeon** (`tell`). All text comes from `GUIDANCE`; the UI writes none. |
| Missing guidance | A "Source pending" box says no guidance exists for that metric; no steps are invented. |
| Sources | Listed as chips. `Source pending` / `Design rule` are dashed and labelled "(not a citation)". |

## Where the snapshot comes from

`Reading.alert`, `ReportMetric.alert`, `ReportView.radiation.alert` (all optional, validated by `parseFrozen`). The simulation fills them with `frozenFor()` (start of the current Watch/Alert run). A real backend should store it when the alert is raised (`Alert.evidence` in `src/data/types.ts`).
The Radiation tab has no stored alert, so `radiationEvidence()` re-evaluates earlier days with only the doses known then.

## Decisions to confirm against the PRD

The PRD text was not available when this was written. These follow the code comments and the existing guidance fields:

- **The 3 steps** are Do now / Measure again / Tell the flight surgeon. If the PRD's ladder differs, change the three blocks in `WhyModal.tsx`.
- **250 mSv wording** (`donkiText.ts`): "250 mSv is a spacecraft shielding design target, not a personal dose limit." (verbatim from the "Required wording" comment that was already there). One constant: `STORM_TARGET_WORDING`.
