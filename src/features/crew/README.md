# Crew (F-01)

The crew board, the avatar row shown at the top of every tab, and adding / removing crew members.

## Use it

Wrap the app once. Every tab then reads the same chosen person:

```tsx
import { CrewProvider, AvatarRow, CrewScreen, useCrew, simulatedCrewApi } from './features/crew'

<CrewProvider api={simulatedCrewApi}>   {/* or httpCrewApi('/api') */}
  <AvatarRow />                         {/* top of every tab */}
  <CrewScreen onOpenPerson={() => goTo('today')} />
</CrewProvider>

// inside any tab:
const { selected } = useCrew()          // selected.id → <Today crewId={selected.id} … />
```

To try it with no wiring: render `<TodayPreview />` (from `features/today`). It has the avatar row and the Crew / Today / Report tabs.

## What's on the page

| Part | What it does |
|---|---|
| **Avatar row** | One avatar per current crew member. The ring shows the state three ways: colour, a shape badge (● ▲ ◆, dashed for learning / no data) and a word. Choosing one switches the person on every tab. |
| **Summary strip** | How many people are Alert, Watch, Normal (and Learning / No data when any), and how many checked in today. |
| **Needs attention** | Every Watch / Alert reading across the crew, Alert first. Choosing a row opens that person's Today. |
| **Zones by person** | One row per person, one column per zone, each cell with shape + word. Each row has the check-in status and **Remove**. |
| **Add crew member** | Name required, max 40 characters, exact duplicates refused. Role is free text, max 30. Also asks which body drawing Today should use (`sex` in `types.ts`). |
| **Remove** | Asks first, then sets `removed_at`. The person leaves the board and the avatar row; their data is kept and Today / Report can still load it. |

**Privacy:** Mind & sleep is private (`PRIVATE_ZONES` in `src/data/types.ts`). It is never sent to the board, does not count in the ring, and shows as "Private" in the grid. The HTTP parser also drops it if a server sends it by mistake.

## Data contract

```
GET  /crew/board?day=N     -> CrewBoard     (day omitted = today)
POST /crew                 -> { id, name, role }   body { name, role, sex }
POST /crew/:id/remove      -> 204           sets removed_at, deletes nothing
```

Example `CrewBoard`:

```json
{
  "missionDay": 142,
  "isSimulated": true,
  "members": [
    {
      "id": "ravi", "name": "Ravi Menon", "role": "Systems engineer", "initials": "RM", "sex": "M",
      "status": "alert",
      "zones": { "eyes": "ok", "heart": "watch", "bone": "ok", "immune": "alert", "meta": "ok", "radiation": "ok" },
      "checkIn": { "doneAt": "07:19", "lastDay": 142 },
      "attention": [{ "id": "temp", "label": "Temperature", "zone": "immune", "value": 38.2, "unit": "°C", "decimals": 1, "level": "alert", "priority": 4 }]
    }
  ]
}
```

`attention` items use the same shape as a Today reading. The add-member rules live in `checkNewMember` (`model.ts`): the form uses them, and the simulated backend runs them again.

## Files

| File | |
|---|---|
| `model.ts` | Board types, add-member rules, check-in wording, summary counts. |
| `api.ts` | `CrewApi` contract, `httpCrewApi`, validation of server data. |
| `CrewProvider.tsx` / `useCrew.ts` | Shared board + chosen person for the whole app. |
| `AvatarRow.tsx`, `Avatar.tsx` | The avatar row and the ring. |
| `CrewScreen.tsx` | The Crew tab. |
| `dialogs.tsx` | Add and Remove dialogs (native `<dialog>`: focus stays inside, Escape closes). |
| `crew.module.css` | Styles; tokens and shared pieces come from `today.module.css`. |
| `crew.check.mjs` | Self-check: `node src/features/crew/crew.check.mjs` |

The simulated backend is `simulatedCrewApi` in `features/today/simulate.ts`, next to the Today simulator, so both read the same people. Add and remove only change the open browser tab's memory.

## Open

- `CrewMember` in `src/data/types.ts` needs `removed_at: number | null` (task 5a, Azharelly).
- Emergency view of private zones (types.ts: "In an emergency it is shown") is not built yet.
