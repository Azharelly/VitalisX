# Today (F-02)

The full page for **one crew member on one mission day**: what Crew opens when you tap a person.
It answers three questions in order: *Is anything wrong? What do I do now? What is fine?*

> Status: working with **simulated data**. Swap in a real data source without touching the UI (see [Data contract](#data-contract)).
> Owner: Omar. Decisions and open items: PRD §4.2 F-02, §5, §7.

---

## Use it

```tsx
import { Today, simulatedTodayApi } from './features/today'

<Today
  api={simulatedTodayApi}        // or httpTodayApi('/api'), or a Dexie implementation
  crewId={selectedCrewId}        // 'amara' | 'kenji' | 'lucia' | 'ravi' in the simulation
  day={missionDay}               // optional; omitted = current mission day
  onBack={() => goTo('crew')}
  onEmergency={(crewId) => openEmergency(crewId)}            // F-08
  onWhy={(metricId) => openWhy(metricId)}                    // F-05
  onStart={(crewId, metricId) => logAction(crewId, metricId)}
  onNoteForEarth={(crewId, metricId) => openEarthLink(crewId, metricId)} // F-07
  onStartCheckIn={(crewId) => goTo('checkin', crewId)}      // F-03
  onOpenReport={(crewId) => goTo('report', crewId)}          // week / month report (features/report)
/>
```

Every callback is optional, so you can wire them one feature at a time.
To try it with no wiring: render `<AppPreview />` from `features/shell` (the whole app on simulated data, with a "Demo" chip in the header for the mission day and a log of every action the page emits).

Good days to try in the preview:

| Person | Day | What you see |
|---|---|---|
| Ravi | 142 | Fever **Alert** (red Immune aura), heart rate **Watch**, symptoms |
| Amara | 142 | Sleep **Watch** |
| Kenji | 142 | Radiation projection **Watch** (yellow outer field) |
| Lucía | 142 | All normal ("Good news") |
| Anyone | 150–151 | Solar particle event: radiation **Watch** that day and the next (engine rule: `sep_flag` in the last 24 h) |
| Anyone | 1–15 | "Learning your normal" |

## What is on the page

| Section | Shows | Component |
|---|---|---|
| Top bar | Back to Crew, **Emergency** button | `TodayScreen` |
| Viewing banner | Who is on screen (no sign-in, so this matters most), overall status, mission day, check-in time or "Check-in due" | `TodayScreen` |
| Body | Female or male drawing (from `person.sex`). Status colour and shape on every zone. Local glows: Mind, Eyes, Heart, Bones, Metabolism (core). Whole-body auras: **Immune** (outline), **Radiation** (outer field). Tap a zone to filter. | `BodyFigure` |
| Next best action | One step, its headline, *Start*, *Why am I seeing this?*, *Note for Earth*, "Then: …" | `NextActionCard` |
| Zone detail | Picked zone + What helps / Tell the flight surgeon when / How to measure / Why space changes this + sources | `GuidancePanel` |
| Needs attention | Watch/Alert readings: value, distance from the usual band, 7-day trend, next step, Why? | `AttentionCard` |
| Good news | Count in range, zones all normal, check-in streak, quiet tiles with mini trend and range bar | `GoodNews` |
| My week | Zone × last 7 days grid, days logged, streak, link to the full **Report** (charts) | `MyWeek` |

Colour always comes with a shape and a word: ● Normal, ▲ Watch, ◆ Alert, dashed ○ Learning.

## Data contract

Today and Report need three endpoints. Any backend can implement them; the UI does not care which.

```
GET /crew                                  -> CrewSummary[]
GET /crew/:crewId/today?day=142            -> TodayView   (day omitted = current mission day)
GET /crew/:crewId/report?day=142&days=7    -> ReportView  (days = 7 or 28; see ../report/README.md)
```

Types are in [`model.ts`](./model.ts) (`TodayView`, `Reading`, `NextAction`, `WeekDay`) and [`api.ts`](./api.ts) (`TodayApi`, `CrewSummary`).
Responses are validated by `parseTodayView` before anything renders; bad data shows the error state, never a broken page.

Example `TodayView` (trimmed):

```json
{
  "person": { "id": "ravi", "name": "Ravi Menon", "role": "Systems engineer" },
  "missionDay": 142,
  "isSimulated": true,
  "checkIn": { "doneAt": "07:19", "streakDays": 31 },
  "nextAction": { "kind": "metric", "metricId": "temp" },
  "readings": [
    {
      "id": "temp", "label": "Temperature", "zone": "immune",
      "value": 38.2, "unit": "°C", "decimals": 1, "level": "alert", "priority": 4,
      "usual": [36.7, 37.1], "trend": [36.9, 36.8, 36.9, 36.9, 37.0, 37.5, 38.2],
      "context": "resting", "measured": "Today, 07:19"
    }
  ],
  "week": [{ "day": 142, "zones": { "mind": "ok", "eyes": "ok", "heart": "watch", "bone": "ok", "immune": "alert", "meta": "ok", "radiation": "ok" } }]
}
```

Rules for whoever implements it:

- `level` is one of `ok | watch | alert | learn | none`, computed by the engine (PRD §5), never by the UI.
- `usual` is the person's own band (median ± 1.5 × scale over the last 28 days, same context). Omit it while learning or for rule-only metrics (symptoms, vision, exercise, radiation).
- `nextAction` is one of `{kind:'metric', metricId}`, `{kind:'learning', checkInsLeft}` or `{kind:'all-clear'}`.
- **No advice text in the data.** The backend sends ids and numbers; the words come from `GUIDANCE`.

Implementations today:

| | Where | Use |
|---|---|---|
| `simulatedTodayApi` | [`simulate.ts`](./simulate.ts) | Default. 4 crew, days 1–210, PRD rules, deterministic. |
| `httpTodayApi(baseUrl)` | [`api.ts`](./api.ts) | A real server that implements the two endpoints. |
| Dexie / IndexedDB | not built | Implement `TodayApi` over the 7 stores (PRD §6.2) once `src/data` lands. |

## Guidance texts

All "what to do" sentences live in **[`src/data/guidance.ts`](../../data/guidance.ts)**, one entry per metric id:

```ts
GUIDANCE.temp = { act, actAlert?, helps[], tell, measure[], why, sources[] }
```

The UI only reads `GUIDANCE[metricId]` (via `actionFor(id, level)` and `<GuidancePanel metricId>`). To change wording, edit that file and nothing else.
Sources labelled `Design rule` or `Source pending` are shown with a dashed outline so nobody mistakes them for citations (PRD R-01).

## Files

| File | What it is |
|---|---|
| `index.ts` | Public exports. Import from here. |
| `Today.tsx` | Connected page: fetches through `TodayApi`, loading / error / retry. |
| `TodayScreen.tsx` | The page layout (presentational). `TodayActions` callback types. |
| `sections.tsx` | `NextActionCard`, `AttentionCard`, `GoodNews`, `MyWeek`. |
| `BodyFigure.tsx` | Body drawing, auras, markers, callouts, `ZoneButton`. |
| `GuidancePanel.tsx` | Renders `GUIDANCE[metricId]`. |
| `Charts.tsx` | `Sparkline` (trend vs usual band), `RangeBar`. |
| `ZoneIcon.tsx`, `StatusIcon.tsx` | Icons (no icon library). |
| `useToday.ts` | Data hook used by `Today`. |
| `api.ts` | `TodayApi` contract, HTTP client, response validation. |
| `simulate.ts` | Simulated backend (replace with the engine when it lands). |
| `model.ts` | View-model types and small pure helpers. |
| `today.module.css` | Styles, scoped to this feature (Flight deck palette). |
| `model.check.mjs` | Self-check (see below). |

## Check it

```sh
npm run build && npm run lint
node src/features/today/model.check.mjs   # helpers, the 4 crew stories, storm day, learning, response validation, guidance coverage
```

The self-check fails if a metric the data layer returns has no `GUIDANCE` entry.

## Temporary on purpose (search `shortcut:`)

- `model.ts` types are local until `src/data/types.ts` lands. `Level` uses the same names as its `State`.
- `simulate.ts` has its own mini-evaluator and mission constants. Replace with `src/engine` + `mission_config.json`.
- Palette tokens live in `today.module.css`. Move to `src/ui` tokens when they exist.
- Fonts fall back to system fonts until the bundled fonts land (F-09).

## Next steps

1. **Wire it in App** (owner of `App.tsx`): Crew row tap → `<Today crewId>`; connect `onEmergency`, `onWhy`, `onStartCheckIn`, `onNoteForEarth` as those features land.
2. **Real data**: implement `TodayApi` over Dexie (or the server), using `src/engine` for levels; keep `simulatedTodayApi` for the demo "Reset".
3. **Guidance review**: research/science pass on `src/data/guidance.ts`; replace every `Source pending` with a citation or keep it visibly tentative (PRD D13, R-01).
4. **Open decision**: radiation Watch threshold. The simulation uses 80% projected at arrival (PRD R-15 is still OPEN).
6. **QA**: the PRD §11 manual checklist (offline, screen reader on body zones and the Emergency button, mobile Safari).
