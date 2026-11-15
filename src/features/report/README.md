# Report (F-07, review part)

**Week or month in review** for one crew member, with detailed charts. Opened from Today ("My week → Open full report").
"Send summary to Earth" opens the **SBAR editor and outbox** (the other half of F-07) when an `outbox` is passed; it always also emits `onSendSummary`.

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
  onSendSummary={(crewId, days) => log(crewId, days)}             // optional: still emitted
  outbox={dexieOutbox()}        // enables the SBAR editor + outbox (src/data/outbox.ts)
  send={sendToEarth}            // optional: delivery. Omitted = messages stay queued
  commsDelaySec={720}           // optional: one-way delay shown to the crew
  onWhy={(metricId) => openWhy(metricId)}                         // F-05
/>
```

`<AppPreview />` (in `features/shell`) shows it as the Report tab.

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

## SBAR editor and outbox (F-07)

Press **Send summary to Earth**: a dialog opens with four editable boxes, **S**ituation, **B**ackground, **A**ssessment, **R**ecommendation, pre-filled from the report by `draftSbar()` (`sbar.ts`).

- The draft has numbers, states and labels only. No advice text is generated; Recommendation is a request ("Requesting flight surgeon review of: …") the person can change.
- **Every zone is in the draft, Mind & sleep included** (open data, dossier decision D2): it is treated like any other zone. The person can still edit every box before sending.
- **Send to Earth** saves the message first (`kind: 'sbar_outbox'`, `status: 'queued'`, `delay_sec` = comms delay in `action_log`), then tries `send`. If the link is down it stays queued, survives a reload, and the Outbox list shows **Send now** / **Discard**. A message is marked `sent` only after `send` resolves; sent messages stay in the log.
- `flushOutbox()` sends oldest first and stops at the first failure, so Earth receives messages in the order they were written.
- The Send button is disabled for a text that was just queued (no double-queue on a double click).
- **Not ready yet**: with fewer than 3 check-in days (`report.logged < MIN_CHECKIN_DAYS`) the dialog says so and Send is disabled.
- **Countdown**: each outbox item shows "Reaches Earth in m:ss", computed from the stored `created_at + delay_sec` (`arrivalLeftSec`), so it survives a reload.
- **Draft kept**: edits are saved to `localStorage` per person, period and day, restored on the next open, and cleared once queued.

Storage and sending live in [`../../data/outbox.ts`](../../data/outbox.ts): `OutboxPort` (`queue`, `list`, `markSent`, `discard`), `dexieOutbox(db, resolveCrew)`, `flushOutbox`, and `simulatedEarthLink` (demo transport).
`action_log.crew_id` is a number while the simulated crew ids are words ("amara"), so `dexieOutbox` takes a `resolveCrew` lookup; `AppPreview` maps the four founders to 1–4.

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
| `ReportScreen.tsx` | The page (presentational), `ReportActions`, `ReportOutbox` |
| `SbarDialog.tsx` | SBAR editor + outbox list (native `<dialog>`) |
| `sbar.ts` | `draftSbar`, `sbarToText` (pure, tested) |
| `summary.ts` | `openItems`, `radiationLevel`: shared by the page and the draft |
| `ReportCharts.tsx` | `TrendChart`, `DoseChart`, `BudgetBar`, `ZoneRibbon` (no chart library) |
| `report.module.css` | Styles; shares tokens and controls with Today via CSS `composes` |

## Temporary on purpose

- Reuses Today's model, API, icons and styles by direct import. Move the shared parts to `src/data` / `src/ui` once those exist.
- The radiation Watch rule (80% projected) is the simulation's placeholder (PRD R-15 still OPEN).

## Next steps

1. Replace `simulatedEarthLink` with the real Earth link when it lands (same `SendToEarth` signature).
2. Read the comms delay from `mission_config.json` instead of the 720 s default.
4. Real data: implement `getReport` over Dexie or the server.
5. Charts: a "Why?" on any point (open F-05 for that day), if time allows.
