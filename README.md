# VitalisX

Health monitoring for a crew on a long space mission. Each astronaut's daily readings are compared with **their own
normal**, not Earth averages, and the app says what to do next, why, and how to tell Earth when a message takes
12 minutes each way.

**Live demo:** https://vitalisx.vercel.app (no sign-up; works offline once loaded)

> Hackathon prototype. Decision support, **not a medical device**. The crew and their readings are **simulated**.
> It does not call anyone: in a real emergency the crew follows the mission's own procedures.

## What it does

- **Crew board**: who needs attention now, with Watch / Alert / Normal at a glance.
- **Today**: one person's body map by zone, the most urgent reading, and the next action.
- **Check-in**: a one-minute daily form; values are checked for typos, and a blank is never saved as 0.
- **Why?**: every flag explains itself with the person's own trend and the rule that fired.
- **Radiation**: career dose against the 600 mSv limit, plus live NASA DONKI space-weather data (saved copy offline).
- **Report**: week or month in review, and a summary for the flight surgeon.
- **Messages to Earth**: every message with its delay (sent, on its way, arrived, reply).
- **Emergency**: who and what, one step at a time read aloud, roles, vitals against the person's usual, a message
  to the flight surgeon, and a log of what happened.

How a flag is decided: a person's normal is learned from their last 28 days (14 readings needed first). **Watch** is
3 readings in a row clearly away from it; **Alert** is one reading far away, or a fixed safety limit. These limits are
the team's own design rules; the app's **Sources & AI use** page lists every source and rule.

## Run it locally

Needs Node.js 22.12 or newer (Vite and Vitest require it).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run lint
npm run build      # type-check and production build into dist/
```

The first load fills the browser's database from `public/data/`. **Reset demo** (in the Demo menu) puts it back.

## Project layout

```
src/
  data/       types, IndexedDB (Dexie) access, seeding, check-in saving, outbox
  engine/     pure rules: personal baseline, evaluate, radiation, solar-storm warning
  features/   one folder per screen: crew, today, checkin, radiation, report, messages, emergency, why, sources, shell
public/data/  simulated crew data, metrics and references, DONKI snapshot
scripts/      simulated-data generator and DONKI snapshot merging
docs/         contracts between the data layer and the screens
```

## Technology and data sources

### Languages

- TypeScript for the application and detection engine
- JavaScript (`.mjs`) for simulated-data generation and DONKI snapshot merging

### Frameworks and libraries

- React and React DOM
- Vite
- Dexie.js and Dexie React Hooks for client-side IndexedDB storage
- Vitest for unit tests
- Vite PWA for offline service-worker support
- Bundled open-license fonts: Space Grotesk, Inter, and IBM Plex Mono

Licenses are listed in the app (Sources & AI use page): React, Vite, Vitest, vite-plugin-pwa and ESLint are MIT;
Dexie and TypeScript are Apache-2.0; the fonts are SIL OFL 1.1.

### NASA data and references

- NASA DONKI (CCMC) data for solar flares, CMEs, geomagnetic storms, and solar energetic particle events
- Bundled DONKI snapshots so the app remains usable offline
- NASA-STD-3001 references for radiation limits
- NOAA Space Weather Scales (G1 to G5) for naming geomagnetic storms from the Kp index

### Tools and deployment

- Node.js and npm
- GitHub for source control and collaboration
- Vercel for deployment
- Visual Studio Code for development

### Presentation tools

The project presentation materials were created with Canva, Google Sheets, FlipaClip, a photo editor, and Gemini.

## Sources and AI use

The full list of references, the team's own design rules, the software licenses and the AI-use declaration are in the
app on the **Sources & AI use** page (link at the bottom of every screen), and in `src/features/sources/`.
