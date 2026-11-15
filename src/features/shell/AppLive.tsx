import { useEffect, useMemo, useState } from 'react'
import { db } from '../../data/db'
import { dexieOutbox, simulatedEarthLink } from '../../data/outbox'
import { getRadiationDoses } from '../../data/queries'
import { ensureSeeded, loadMissionConfig, resetDemo } from '../../data/seed'
import type { MissionConfig, RadiationDose } from '../../data/types'
import { RadiationScreen } from '../RadiationScreen'
import { CheckInConnected } from '../checkin'
import type { CrewApi } from '../crew/api.ts'
import { dexieCrewApi } from '../crew/dexieCrewApi.ts'
import { dexieTodayApi } from '../today/dexieTodayApi.ts'
import { AppShell } from './AppShell'
import s from './shell.module.css'

// One boot for the whole page, so React StrictMode (which runs effects twice in development) seeds only once.
let boot: Promise<MissionConfig> | null = null
const start = () => (boot ??= ensureSeeded().then(() => loadMissionConfig()))

const outbox = dexieOutbox(db) // crew ids are the numeric crew_member ids, as strings

/** The Radiation tab for the chosen person, with their real dose log up to the chosen day. */
function LiveRadiation({ crewId, day, arrivalDay }: { crewId: string; day: number; arrivalDay: number }) {
    const [data, setData] = useState<{ prior: number; doses: RadiationDose[] } | null>(null)
    useEffect(() => {
        let live = true
        Promise.all([db.crew_member.get(Number(crewId)), getRadiationDoses(Number(crewId))]).then(([crew, doses]) => {
            if (live) setData({ prior: crew?.prior_dose_msv ?? 0, doses: doses.filter((d) => d.mission_day <= day) })
        })
        return () => {
            live = false
        }
    }, [crewId, day])
    if (!data) return <p role="status">Loading radiation data…</p>
    return <RadiationScreen key={crewId} doses={data.doses} priorDoseMsv={data.prior} currentDay={day} arrivalDay={arrivalDay} />
}

/**
 * The full app on the local database: seeds on first run, then Crew, Today, Report, Check-in and Radiation read
 * and write the same data through the engine. Includes the small floating "Demo" panel (mission day, Reset demo).
 * Not product UI.
 */
export function AppLive() {
    const [mission, setMission] = useState<MissionConfig | null>(null)
    const [failed, setFailed] = useState<string | null>(null)
    useEffect(() => {
        start().then(setMission, (e: unknown) => setFailed(e instanceof Error ? e.message : String(e)))
    }, [])

    if (failed) {
        return (
            <p role="alert">
                Could not load the demo data: {failed}.{' '}
                <button type="button" onClick={() => resetDemo().then(() => window.location.reload(), () => undefined)}>Try again</button>
            </p>
        )
    }
    if (!mission) return <p role="status">Loading the mission…</p>
    return <Live mission={mission} />
}

function Live({ mission }: { mission: MissionConfig }) {

    const baseCrewApi = useMemo(() => dexieCrewApi({ mission }), [mission])
    // The crew board (avatars, Crew tab) reloads whenever the CrewProvider gets a new api object. After a reading is
    // written we hand it a fresh one, so the rings update right after a check-in without losing who is chosen.
    const [crewApi, setCrewApi] = useState<CrewApi>(baseCrewApi)
    useEffect(() => {
        let timer: number | undefined
        const bump = () => {
            window.clearTimeout(timer)
            timer = window.setTimeout(() => setCrewApi({ ...baseCrewApi }), 150) // one reload per check-in, not one per metric
        }
        db.measurement.hook('creating', bump)
        db.measurement.hook('updating', bump)
        return () => {
            window.clearTimeout(timer)
            db.measurement.hook('creating').unsubscribe(bump)
            db.measurement.hook('updating').unsubscribe(bump)
        }
    }, [baseCrewApi])
    const todayApi = useMemo(() => dexieTodayApi({ mission }), [mission])
    const [day, setDay] = useState(mission.today_mission_day)
    const [event, setEvent] = useState('Actions you trigger appear here.')
    const log = (name: string, ...args: (string | number | undefined)[]) =>
        setEvent(`${name}(${args.filter((a) => a !== undefined).map((a) => `'${a}'`).join(', ')})`)

    return (
        <>
            <AppShell
                crewApi={crewApi}
                todayApi={todayApi}
                day={day}
                screens={{
                    radiation: ({ crewId, day: d = mission.today_mission_day }) => <LiveRadiation crewId={crewId} day={d} arrivalDay={mission.arrival_day} />,
                    checkin: ({ crewId, day: d, go, noteForEarth }) => (
                        <CheckInConnected
                            todayApi={todayApi}
                            crewId={crewId}
                            day={d}
                            launchDate={mission.launch_date}
                            onDone={() => go('today')}
                            onEmergency={() => log('onEmergency', crewId)}
                            onWhy={(m) => log('onWhy', m)}
                            onNoteForEarth={noteForEarth}
                        />
                    ),
                }}
                onEmergency={(id) => log('onEmergency', id)}
                onPersistLog={(entry) => log('onPersistLog', entry.event, entry.sessionId)}
                onWhy={(m) => log('onWhy', m)}
                onStart={(id, m) => log('onStart', id, m)}
                onNoteForEarth={(id, m) => log('onNoteForEarth', id, m)}
                onSendSummary={(id, d) => log('onSendSummary', id, d)}
                outbox={outbox}
                send={simulatedEarthLink} // no real Earth link yet
                commsDelaySec={mission.comms_delay_sec}
            />
            <details className={s.demo}>
                <summary>
                    <span className={s.demoTag}>Demo</span> Day {day}
                </summary>
                <div className={s.demoPanel}>
                    <label className={s.demoDay}>
                        <span>
                            Mission day <strong>{day}</strong>
                        </span>
                        <input type="range" min={1} max={mission.arrival_day} value={day} onChange={(e) => setDay(Number(e.target.value))} />
                    </label>
                    <button type="button" className={s.demoBtn} onClick={() => setDay(mission.today_mission_day)}>
                        Back to day {mission.today_mission_day}
                    </button>
                    <button type="button" className={s.demoBtn} onClick={() => resetDemo().then(() => window.location.reload())}>
                        Reset demo
                    </button>
                    <output className={s.demoLog} aria-live="polite">
                        {event}
                    </output>
                </div>
            </details>
        </>
    )
}