# Check-in (F-03)

The daily form for **one crew member on one mission day**. It turns what they type into readings, catches typos before they reach the engine, saves through `saveCheckIn()` and then shows what changed and what to do now.

> Status: done and tested on the seeded database (`connect.test.ts`). The app preview still uses simulated data and stores nothing until `App.tsx` mounts `CheckInConnected` (issue #46). Owner: Omar. Spec: PRD §4.2 F-03, §5.2, R-07, R-08.

---

## Wire it (App.tsx, real data)

`CheckInConnected` is the ready-made piece: it loads everything from the database and saves with `saveCheckIn()`.
One slot in `App.tsx`:

```tsx
import { CheckInConnected } from './features/checkin'

<AppShell
  /* …crewApi, todayApi = dexieTodayApi({ mission })… */
  screens={{
    checkin: ({ crewId, day, go }) => (
      <CheckInConnected
        todayApi={todayApi}                    // the same dexieTodayApi the Today tab uses
        crewId={crewId}                        // a database id ("1".."4"); simulated ids are refused
        day={day}                              // undefined = current mission day
        launchDate={mission.launch_date}       // new check-ins are stamped on the mission calendar
        onDone={() => go('today')}             // Today remounts, so it refetches and shows the new state
        onEmergency={() => openEmergency(crewId)}               // F-08, shown on Alert only
        onWhy={(metricId) => openWhy(crewId, metricId)}         // F-05
        onNoteForEarth={(metricId) => openNote(crewId, metricId)} // F-07
      />
    ),
  }}
/>
```

`onEmergency`, `onWhy` and `onNoteForEarth` are optional: a button only shows when its handler is given.
`database` is optional too (defaults to the app's `db`; tests pass their own).

### What it does

| Step | How |
|---|---|
| Name, mission day, personal bands | `todayApi.getToday(crewId, day)`: `person.name`, `missionDay`, `readings[].usual` (`bp_sys`/`bp_dia` mapped back to `sys`/`dia`) |
| Today's check-in (Edit) | `measurement` rows of that person and day with `source = 'checkin'`; the latest `taken_at` is today's check-in |
| Time stamp | Reuses today's `taken_at`, so every later save **edits** those rows (PRD F-03 uniqueness). A new check-in gets the mission-calendar date of the day plus the current time |
| Save | `saveCheckIn(Number(crewId), answers, takenAt, day)` |
| Result | `toOutcomes(result)`: alerts opened, escalated or resolved, **and alerts still open** for what was just logged (a repeated fever stays on screen; it is not "nothing new") |
| Loading / error | "Loading the check-in…"; on failure the message and **Try again** |

> ⚠️ If you build your own wiring with `CheckInScreen`, reuse the original `taken_at` for edits. A new time stamp adds a **second** reading for the same day. `loadCheckIn()` and `saveAndExplain()` in `connect.ts` do this for you.

`CheckInScreen` on its own takes everything as props (`name`, `day`, `existing`, `usual`, `onSave`), for other data sources. `CheckInPreview` is the simulated version used by `AppPreview`.

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

Plausible ranges catch typos (370 for 37.0) and are **not** clinical limits; those stay in the engine (`abs_low`, `abs_high`). Example payload:

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

**Result** (after saving), built from `saveCheckIn(...).results` by `toOutcomes()`:

- Alerts the saved readings opened, escalated, resolved or kept open (systolic + diastolic shown once). Most urgent first: level (Alert, then Watch, then resolved), then PRD metric priority (SpO₂ 1, glucose 2, heart rate / blood pressure 3, temperature 4, symptoms 5, vision 6, the rest 8).
- Headline ("Temperature is far above your usual"), the engine's rule ("Fever from 38.0 °C."), **Do this now** from `GUIDANCE` (`src/data/guidance.ts`), then **Get help now** (Alert only), **Why am I seeing this?**, **Message flight surgeon**, the 3-step ladder, and "Also: …" for the other changes.
- Nothing changed: "Nothing new to act on", N readings saved.
- Anything left empty is named: "12 of 13 readings saved … Temperature was left empty." (also under an alert).
- **Back to Today** remounts Today, so it refetches and shows the new state.

## Try it

- `npm run dev`, open `/#checkin`. The preview (`CheckInPreview`) uses Today's simulated bands and a rough stand-in for the engine; it stores nothing.
- Ravi, day 142: Demo fill, temperature `39,2`, symptoms Moderate, Save → double-check → Save anyway → red Alert result.
- Lucía, day 142: Demo fill, Save → "Nothing new to act on".

## Test it

`npm test` runs `model.test.ts` (form rules, result ordering) and `connect.test.ts` (load and save on the seeded database) with the rest of the suite.

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
| `CheckInConnected.tsx` | **Use this in `App.tsx`.** Loads from the database, saves with `saveCheckIn()`, loading / error states. |
| `connect.ts` | `loadCheckIn`, `saveAndExplain`, `newTakenAt`: the database side, no React. |
| `connect.test.ts` | Runs against the seeded `public/data` (edit keeps one row per metric, repeated fever stays an Alert, new member, ids). |
| `CheckInPreview.tsx` | Demo only: the screen inside `AppPreview` on simulated data. |
| `checkin.module.css` | Layout and form controls. Colours, cards and buttons come from `today.module.css`. |
| `index.ts` | Public exports. |

## Known gaps

- **Which symptom** (headache, nausea…) is not stored: `measurement` holds only the 0–3 severity. The emergency summary wants "last check-in and symptoms"; that needs a note field on the reading.
- `GUIDANCE` still uses the old ids `bp_sys` / `bp_dia`; the result screen maps `sys` / `dia` to them. Rename them in `src/data/guidance.ts` to drop the mapping.
- The "Please double-check" step needs `usual`; without bands only the plausible ranges protect the data.
