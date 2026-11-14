# Report (F-07, review part)

**Week or month in review** for one crew member, with detailed charts. Opened from Today ("My week → Open full report").
The SBAR editor and outbox (the other half of F-07) are not built here; "Send summary to Earth" emits `onSendSummary` for that feature.

> Status: working with **simulated data**, same data source as Today. Owner: Omar. PRD: §4.2 F-07, §5.3.

## Use it

```tsx
import { Report } from './features/report'
import { simulatedTodayApi } from './features/today'

<Report
  api={simulatedTodayApi}       // same TodayApi object Today uses
  crewId={crewId}
  day={missionDay}              // optional; last day of the period, default = current day
  initialDays={7}               // 7 = week, 28 = month (toggle on the page)
  onBack={() => goTo('today', crewId)}
  onSendSummary={(crewId, days) => openEarthLink(crewId, days)}   // F-07 SBAR
  onWhy={(metricId) => openWhy(metricId)}                         // F-05
/>
```

`<TodayPreview />` (in `features/today`) has a Today / Report switch for trying it.

## What is on the page

| Section | Shows |
|---|---|
| Header | Person, period (mission days), Week/Month toggle, **Send summary to Earth** |
| Numbers | Days logged, check-in streak, open readings now, career dose % |
| Summary | Three sentences: logging, what is open now, radiation and projection (PRD "sentence summary") |
| What changed | Every move into or out of Watch/Alert in the period, with day and from → to |
| Zones by day | Zone × day ribbon. ▲ Watch, ◆ Alert, hatched = no check-in |
| Trends | One chart per metric: shaded usual band, one point per day (Watch/Alert coloured), gaps for missed days, hover for values; average and change vs the previous period. Abnormal metrics first. |
| Radiation | Career budget bar (earlier missions, this mission, projection, 80% and 600 mSv marks) and daily dose bars (storms in red, dashed average) |

Every chart has a text alternative (`aria-label` / table caption).

## Data

`GET /crew/:crewId/report?day=142&days=7|28 -> ReportView`, as `getReport()` on the `TodayApi` contract.
Types: `ReportView`, `ReportMetric`, `DayPoint`, `ReportEvent` in [`../today/model.ts`](../today/model.ts); validation: `parseReportView` in [`../today/api.ts`](../today/api.ts).

- `metrics[].points` has one entry per day of the period, `value: null` when there was no reading.
- `avg` / `prevAvg` are averages of the period and of the same-length period before it.
- Levels come from the engine, never from the UI. Radiation is in `radiation`, not in `metrics`.
- No advice text; the page only shows numbers, states and labels.

## Files

| File | What it is |
|---|---|
| `index.ts` | Public exports |
| `Report.tsx` | Connected page: fetches, loading / error / retry, Week/Month state |
| `ReportScreen.tsx` | The page (presentational), `ReportActions` |
| `ReportCharts.tsx` | `TrendChart`, `DoseChart`, `BudgetBar`, `ZoneRibbon` (no chart library) |
| `report.module.css` | Styles; shares tokens and controls with Today via CSS `composes` |

## Temporary on purpose

- Reuses Today's model, API, icons and styles by direct import. Move the shared parts to `src/data` / `src/ui` once those exist.
- The radiation Watch rule (80% projected) is the simulation's placeholder (PRD R-15 still OPEN).

## Next steps

1. Wire `onSendSummary` to the SBAR draft / outbox when F-07's Earth link lands.
2. Real data: implement `getReport` over Dexie or the server.
3. Charts: a "Why?" on any point (open F-05 for that day), if time allows.
