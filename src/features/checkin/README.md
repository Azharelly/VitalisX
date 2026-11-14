# Check-in (F-03)

The daily form for **one crew member on one mission day**. It turns what they type into readings, catches typos before
they reach the engine, saves through `saveCheckIn()` and then shows what changed and what to do now.

> Status: UI done and tested. In the app preview it runs on **simulated data and stores nothing**. Plugging in the real
> save is the wiring below (needs the Dexie Today data, issue #46). Owner: Omar. Spec: PRD §4.2 F-03, §5.2, R-07, R-08.

---

## Wire it (App.tsx, real data)

The screen does not read the database itself. It gets everything as props, so the data side stays in `src/data`.

```tsx
import { saveCheckIn } from './data/checkin'
import { CheckInScreen, toOutcomes } from './features/checkin'

<AppShell
  /* …crewApi, todayApi… */
  screens={{
    checkin: ({ crewId, day = config.today_mission_day, go }) => ( // the slot's day is undefined for "today"
      <CheckInScreen
        key={`${crewId}@${day}`}            // fresh form per person and day
        name={person.name}                   // e.g. from useCrew().selected
        day={day}
        existing={today.answers}             // undefined if no check-in yet today (see "Edit" below)
        usual={bands}                        // personal bands; {} is fine (see "usual" below)
        onSave={async (answers) =>
          toOutcomes(await saveCheckIn(Number(crewId), answers, today.takenAt ?? new Date().toISOString(), day))}
        onDone={() => go('today')}
        onEmergency={() => openEmergency(crewId)}            // F-08, shown on Alert only
        onWhy={(metricId) => openWhy(crewId, metricId)}      // F-05
        onNoteForEarth={(metricId) => openNote(crewId, metricId)} // F-07
      />
    ),
  }}
/>
```

`onEmergency`, `onWhy` and `onNoteForEarth` are optional: a button only shows when its handler is given.
If `onSave` throws, the form keeps every entry and says "Could not save … please try again" (nothing is lost).

### What the props need from the data side

| Prop | Where it comes from |
|---|---|
| `name` | `crew_member.name` (already in the shell: `useCrew().selected.name`) |
| `day` | the mission day on screen (`MissionConfig.today_mission_day` by default) |
| `existing` + `takenAt` | today's check-in readings, see below |
| `usual` | the personal band per metric, see below |

**Today's check-in (`existing`, `takenAt`).** One query, then a reshape:

```ts
const rows = await db.measurement.where('crew_id').equals(crewId)
  .filter((m) => m.mission_day === day && m.source === 'checkin').toArray()
const existing = rows.length ? Object.fromEntries(rows.map((m) => [m.metric_id, { value: m.value, context: m.context }])) : undefined
const takenAt = rows[0]?.taken_at // reuse it when saving an edit
```

> ⚠️ **Edits must reuse the original `takenAt`.** `saveCheckIn` treats person + metric + `taken_at` as the same
> reading (PRD F-03 uniqueness) and corrects it. A new timestamp would add a **second** reading for the same day.

**Personal band (`usual`).** `{ [metricId]: [low, high] }` with `low/high = median ∓ 1.5 × scale` from the engine's
baseline (`computeBaseline`, same context, last 28 days). It is the same band Today shows as "your usual range", so
taking it from `TodayView.readings[].usual` is enough (map `bp_sys` → `sys` and `bp_dia` → `dia`: Today's
readings still use the old blood-pressure ids; `CheckInPreview` shows the mapping). Leave a metric out while it is still learning. The form uses it
for the "Your usual …" hint and for the "Please double-check" step; with `{}` both simply do not appear.

## Data contract (what `onSave` receives)

`answers` is `CheckInAnswers` from `src/data/checkin.ts`: one entry per metric the person filled in.
**Blank fields are left out, never sent as 0** (R-07).

| Metric id | Input | Stored as | Plausible range (typo guard) | Context |
|---|---|---|---|---|
| `sleep` | number | h | 0–24 | — |
| `mood` | 5 faces, optional | 1–5 | — | — |
| `hr` | number | bpm | 25–250 | resting · after_exercise |
| `spo2` | number | % | 50–100 | (metric default: resting) |
| `temp` | number | °C | 30–45 | resting · after_exercise · after_meal |
| `symptoms` | None / Mild / Moderate / Severe | 0–3 | — | — |
| `vision` | None / Mild / Moderate / Severe | 0–3 | — | — |
| `weight` | number | kg | 30–250 | (metric default: morning) |
| `exercise` | number | min | 0–600 | — |
| `fluids` | −/+250 mL stepper | **L** (1750 mL → 1.75) | — | — |
| `glucose` | number, optional section | mg/dL | 20–600 | fasting · after_meal · other |
| `sys`, `dia` | two numbers, optional section | mmHg | 50–260 / 30–160 | one shared: resting · after_exercise |

Plausible ranges catch typos (370 for 37.0) and are **not** clinical limits; those stay in the engine (`abs_low`,
`abs_high`). Example payload:

```json
{ "sleep": { "value": 6.5 }, "hr": { "value": 64, "context": "resting" }, "temp": { "value": 37.2, "context": "resting" },
  "fluids": { "value": 1.75 }, "symptoms": { "value": 0 } }
```

## What the person sees

**Form** (one column, each reading on its own row, "Taken" choices beside the box):

| Rule | Behaviour |
|---|---|
| Decimal comma | "37,5" is read as 37.5 |
| Junk or out of range | Red message under the field (e.g. "Temperature must be between 30 and 45 °C"); Save moves focus to the first wrong field |
| Blood pressure | Needs both numbers; diastolic must be lower than systolic |
| Very unusual but possible | Value at least 3 × the person's usual variation from their median (the Alert line): a "Please double-check" card; the button becomes **Save anyway** |
| Nothing filled in | "Fill in at least one reading." |
| Double click | Ignored while saving; the button shows "Saving…" (R-08) |
| Already checked in today | Form opens on today's values; button says **Update check-in for {name}** |
| Demo | "Fill typical values", clearly tagged **Demo** (PRD F-03) |

**Result** (after saving), built from `saveCheckIn(...).changed` by `toOutcomes()`:

- Most urgent change first: level (Alert, then Watch, then resolved), then PRD metric priority
  (SpO₂ 1, glucose 2, heart rate / blood pressure 3, temperature 4, symptoms 5, vision 6, the rest 8).
- Headline ("Temperature is far above your usual"), the engine's rule ("Fever from 38.0 °C."), **Do this now** from
  `GUIDANCE` (`src/data/guidance.ts`), then **Get help now** (Alert only), **Why am I seeing this?**,
  **Message flight surgeon**, the 3-step ladder, and "Also: …" for the other changes.
- Nothing changed: "Nothing new to act on", N readings saved.
- **Back to Today** remounts Today, so it refetches and shows the new state.

## Try it

- `npm run dev`, open `/#checkin`. The preview (`CheckInPreview`) uses Today's simulated bands and a rough stand-in
  for the engine; it stores nothing.
- Ravi, day 142: Demo fill, temperature `39,2`, symptoms Moderate, Save → double-check → Save anyway → red Alert result.
- Lucía, day 142: Demo fill, Save → "Nothing new to act on".

## Test it

`npm test` runs `model.test.ts` (form rules and result ordering) with the rest of the suite.

Manual checks before the demo (from the PRD's manual test list), once the real save is wired:

1. Type `37,5` → saved as 37.5. Type `370` → refused with a message, nothing saved.
2. Leave a field blank → that metric is **not** in IndexedDB for today (DevTools → Application → IndexedDB → `measurement`).
3. Double-click Save → one row per metric, one open alert per person + metric (R-08).
4. Save, then Edit and save again → still one row per metric for today (same `taken_at`), values updated.
5. Ravi with a fever → result shows Alert; Today and Crew show it after Back to Today.
6. Phone width (390 px) and keyboard only (Tab, Space, Enter): every control reachable, focus visible.

## Files

| File | |
|---|---|
| `CheckInScreen.tsx` | Form, double-check step, result screen. Props only, no database. |
| `model.ts` | Pure logic: fields and ranges, `toAnswers` / `fromAnswers`, `atypical`, `toOutcomes`, `outcomeHeadline`. |
| `model.test.ts` | Unit tests for the above. |
| `CheckInPreview.tsx` | Demo only: the screen inside `AppPreview` on simulated data. |
| `checkin.module.css` | Layout and form controls. Colours, cards and buttons come from `today.module.css`. |
| `index.ts` | Public exports. |

## Known gaps

- **Which symptom** (headache, nausea…) is not stored: `measurement` holds only the 0–3 severity. The emergency
  summary wants "last check-in and symptoms"; that needs a note field on the reading.
- `GUIDANCE` still uses the old ids `bp_sys` / `bp_dia`; the result screen maps `sys` / `dia` to them. Rename them in
  `src/data/guidance.ts` to drop the mapping.
- The "Please double-check" step needs `usual`; without bands only the plausible ranges protect the data.
