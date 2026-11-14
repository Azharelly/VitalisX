# App shell

The frame every screen lives in: one sticky header and the five tabs from the PRD (Crew, Today, Check-in, Radiation, Report).

```
┌ VitalisX · Day 142 ── [Crew 3] [Today ▲] [Check-in] [Radiation] [Report] ── [⚠ EMERGENCY] ┐  wide screens
│ (AO) Amara Okafor · Commander · Watch   (KT) (LF) (RM) (+)                                 │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ page                                                                                       │
└────────────────────────────────────────────────────────────────────────────────────────────┘
On phones and tablets (< 1024 px) the tabs move to a bottom bar, within thumb reach.
```

## Use it (one line in `App.tsx`)

```tsx
import { AppShell } from './features/shell'
import { simulatedCrewApi, simulatedTodayApi } from './features/today'

<AppShell
  crewApi={simulatedCrewApi}
  todayApi={simulatedTodayApi}
  screens={{
    checkin: ({ crewId, day, go }) => <CheckIn crewId={crewId} day={day} onDone={() => go('today')} />,
    radiation: ({ crewId }) => <RadiationScreen crewId={crewId} />,
  }}
  onEmergency={(crewId) => openEmergency(crewId)}
/>
```

To try it without wiring: `<AppPreview />` (simulated data, a "Demo" chip in the header with the mission-day slider and a log of every action).

## What it does

| Part | Behaviour |
|---|---|
| **Header** | Sticky. Mission day, the crew avatar row (selected person shows name and role; "+" adds a member) and **Emergency**, visible on every tab (PRD: fixed Emergency button). |
| **Tabs** | In the header on wide screens; a bottom bar on phones and tablets. Crew shows how many people need attention; Today shows the selected person's ▲ / ◆. |
| **Person** | One chosen person for the whole app (`useCrew().selected`). Changing it keeps the current tab. |
| **URL** | The open tab is the hash (`#today`), so refresh, deep links and the browser Back button work. |
| **Links between tabs** | Crew "Open profile" → Today. Today "Start check-in" → Check-in; "Open full report" → Report. Slots get `go(tab)` to do the same. |
| **Empty states** | No crew yet → Today / Report / slots say so and link to Crew. A missing slot shows "being built by the team", never a blank page. |
| **Accessibility** | "Skip to content" link; the active tab has `aria-current="page"`; after switching tabs, focus moves to the page so screen readers start there; all targets ≥ 44 px; badges have text for screen readers. |

## Slots

`screens.checkin` and `screens.radiation` are functions `({ crewId, day, go }) => ReactNode`.

- `crewId`: the chosen person (always set inside a slot).
- `day`: the mission day being shown (undefined = today).
- `go(tab)`: switch tab, e.g. back to Today after saving a check-in.

Screens inside the shell should use `<section>` as their outer element: the shell already provides `<main>`. (The Radiation screen currently uses `<main>`; worth changing when it is wired.)

## Files

| File | |
|---|---|
| `AppShell.tsx` | Header, tabs, content, slots, Add dialog from "+". |
| `tabs.ts` | Tab list and the URL-hash helpers. |
| `AppPreview.tsx` | Demo only. |
| `shell.module.css` | Styles (tokens from `today.module.css`). |
