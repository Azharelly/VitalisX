# DONKI contract for the front

What the Radiation screen (and anyone else) can rely on from the solar-event data. Everything here is plain
TypeScript with no React; the UI only draws what these functions return.

## 1. Loading the data

```ts
const load = await loadDonki()   // src/engine/donkiRadiation.ts
// or in a component: const state = useDonki()  // src/features/useDonki.ts
```

`loadDonki()` tries NASA live first and falls back to the saved snapshot on ANY failure (offline, timeout, HTTP
error, bad data). It throws only if both fail.

| Field | Meaning |
|---|---|
| `snapshot` | The data (`DonkiSnapshot`, section 2) |
| `origin` | `'live'` or `'saved'`. The UI must show which one it got, never old data as if it were live |
| `asOf` | "Now" for the rules: the real clock for live data, the end of the capture day for the saved snapshot |
| `liveError` | Why the live call was not used (only when `origin` is `'saved'`), otherwise `null` |

`useDonki()` returns `{ status: 'loading' }`, `{ status: 'error', message }` or `{ status: 'ready', ...load }`.
It never blocks the screen: errors are a state.

Live calls use one request per event type (FLR, CME, GST, SEP) over the last 30 days, with an 8 s timeout.
The key is `VITE_NASA_API_KEY`, or NASA's shared `DEMO_KEY`, which is rate limited (HTTP 429).

## 2. The snapshot (`DonkiSnapshot`)

- `source`: where it came from. `generated_at`: capture date, "yyyy-mm-dd". The UI must show it.
- `ranges`: window of each list, "yyyy-mm-dd/yyyy-mm-dd". **They are not the same for all lists.**
  In the bundled snapshot (captured 2026-11-14) flares, CME and geomagnetic storms cover 2026-10-01 to
  2026-11-14, but SEP covers only 2026-07-17 to 2026-09-15.
- `flares`, `cme`, `gst`, `sep`: slimmed records (only the fields we use; the raw files stay in `public/data`).

Helpers in `src/data/donki.ts` (pure): `summary`, `latestFlares(snap, n)`, `sepEpisodes`, `lastSep`,
`strongestFlare`, `fastestCme`, `strongestStorm`, `strongestEvents`. Counts of SEP are **records**, not
episodes: one episode produces several records, so use `sepEpisodes()` to say how often it happens.

### SEP episode (`SepEpisode`)

Records that share a linked flare or CME belong to the same episode (our own grouping rule, not NASA's).
Fields: `id`, `start`, `end` (UTC), `recordCount`, `channels`, `over10MeV`, `over100MeV` (an observing
instrument, not a model, reported that channel), `linkedEventIds`, `links` (DONKI pages).

## 3. Active solar storm

```ts
activeSepEpisode(snapshot, asOf, windowHours = 24): SepEpisode | null
isActiveSolarStorm(snapshot, asOf, windowHours = 24): boolean
sepDataCoversNow(snapshot, asOf): boolean
```

The active storm is the most recent SEP episode that ended in the last 24 h before `asOf`.
Geomagnetic storms do not count: SEP is the radiation hazard.
`sepDataCoversNow` is false when the saved SEP window ended more than a day before `asOf`.

## 4. The warning (`sepWarning`)

```ts
sepWarning(snapshot, now, windowHours = 24): { level, episode, rule }
```

| `level` | When | What the UI should say |
|---|---|---|
| `alert` | an episode ended in the last 24 h AND an observing instrument reported a >100 MeV channel | Alert |
| `watch` | an episode ended in the last 24 h | Watch |
| `none` | no episode, and the saved data reaches now | No event reported |
| `no_data` | no episode, but the saved data stops before now | **"No data", never "all clear"** |

- `rule` is a plain-language reason for the "Why?" view. `episode` is the one behind a Watch or an Alert.
- **This is our own design rule, not a NASA threshold.** The text must say so (the `rule` string already does).
- With the bundled snapshot the SEP window ends 2026-09-15 and `asOf` is the capture day, so offline
  `sepWarning` returns `no_data`. Live data (`origin: 'live'`) can return the other three.
- `sepWarning` is not wired to a screen yet. The Radiation tab uses `activeSepEpisode` today.

## 5. Labels

- `DONKI_NOTE` (donkiRadiation.ts): DONKI reports solar events observed from near Earth. On Mars transit it is a
  proxy for what the Sun is doing, not a measurement of the dose on board.
- Show `origin` (live or saved) and the capture date `generated_at` next to the data.
- The 250 mSv figure is a design target for the reference solar particle event (NASA-STD-3001 Vol. 1, V1 4031),
  not a personal dose limit.