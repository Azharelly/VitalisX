import { AppPreview } from './features/shell'

// shortcut: full app on simulated data (Radiation sits in its slot); swap to <AppShell> with the Dexie TodayApi when #46 lands.
export default function App() {
  return <AppPreview />
}
