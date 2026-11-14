import React, { useState } from 'react';
import s from './checkin.module.css';

export interface CheckInEntry {
  crewId: string;
  values: Partial<
    Record<
      | 'sleep'
      | 'hr'
      | 'spo2'
      | 'temp'
      | 'glucose'
      | 'bp_sys'
      | 'bp_dia'
      | 'fluids'
      | 'mood',
      number
    >
  >;
  context: {
    temp?: 'resting' | 'after exercise' | 'after meal';
    glucose?: 'fasting' | 'before meal' | 'after meal';
  };
  symptoms: string[];
}

export interface CheckInScreenProps {
  crewId?: string;
  name?: string;
  onSave?: (entry: CheckInEntry) => void;
}

const SYMPTOM_OPTIONS = [
  'None today',
  'Headache',
  'Congestion',
  'Nausea',
  'Back pain',
  'Vision change',
  'Fever or chills',
  'Other',
];

const toNumber = (text: string): number | undefined => {
  const t = text.trim().replace(',', '.');
  return t === '' ? undefined : Number(t);
};

export function CheckInScreen({
  crewId = 'crew-1',
  name = 'Ravi Menon',
  onSave,
}: CheckInScreenProps) {
  const [sleep, setSleep] = useState('7.5');
  const [hr, setHr] = useState('68');
  const [spo2, setSpo2] = useState('98');
  const [temp, setTemp] = useState('');
  const [tempContext, setTempContext] = useState<
    'resting' | 'after exercise' | 'after meal'
  >('resting');
  const [fluids, setFluids] = useState(0);
  const [mood, setMood] = useState<number | undefined>(undefined);

  const [showGlucose, setShowGlucose] = useState(false);
  const [glucose, setGlucose] = useState('');
  const [glucoseContext, setGlucoseContext] = useState<
    'fasting' | 'before meal' | 'after meal'
  >('fasting');

  const [showBP, setShowBP] = useState(false);
  const [bpSys, setBpSys] = useState('');
  const [bpDia, setBpDia] = useState('');

  const [symptoms, setSymptoms] = useState<string[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleSymptom = (symptom: string) => {
    if (symptom === 'None today') {
      setSymptoms(['None today']);
      return;
    }
    setSymptoms((prev) => {
      const filtered = prev.filter((item) => item !== 'None today');
      if (filtered.includes(symptom)) {
        return filtered.filter((item) => item !== symptom);
      }
      return [...filtered, symptom];
    });
  };

  const handleSave = () => {
    const parsedTemp = toNumber(temp);
    const parsedSleep = toNumber(sleep);
    const parsedHr = toNumber(hr);
    const parsedSpo2 = toNumber(spo2);
    const parsedGlucose = toNumber(glucose);
    const parsedBpSys = toNumber(bpSys);
    const parsedBpDia = toNumber(bpDia);

    if (
      parsedTemp !== undefined &&
      (Number.isNaN(parsedTemp) || parsedTemp < 30 || parsedTemp > 45)
    ) {
      setError('Temperature must be between 30 and 45 °C');
      return;
    }
    if (
      parsedGlucose !== undefined &&
      (Number.isNaN(parsedGlucose) || parsedGlucose < 20 || parsedGlucose > 600)
    ) {
      setError('Glucose must be between 20 and 600 mg/dL');
      return;
    }

    setIsSaving(true);
    setError('');

    const entry: CheckInEntry = {
      crewId,
      values: {
        sleep: parsedSleep,
        hr: parsedHr,
        spo2: parsedSpo2,
        temp: parsedTemp,
        fluids: fluids > 0 ? fluids : undefined,
        mood,
        glucose: parsedGlucose,
        bp_sys: parsedBpSys,
        bp_dia: parsedBpDia,
      },
      context: {
        temp: parsedTemp !== undefined ? tempContext : undefined,
        glucose: parsedGlucose !== undefined ? glucoseContext : undefined,
      },
      symptoms,
    };

    if (onSave) {
      onSave(entry);
    }

    setTimeout(() => {
      setIsSaving(false);
    }, 800);
  };

  return (
    <form
      className={s.form}
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
      {/* Top Banner */}
      <div className={s.banner}>
        Entering for <strong>{name}</strong>
      </div>

      {/* Vitals Card (Sleep, HR, SpO2) */}
      <div className={s.card}>
        <h3>Vitals & Sleep</h3>
        <div className={s.grid3}>
          <div className={s.fieldGroup}>
            <label htmlFor="sleep-input">Sleep (h)</label>
            <input
              id="sleep-input"
              inputMode="decimal"
              value={sleep}
              onChange={(e) => setSleep(e.target.value)}
            />
          </div>
          <div className={s.fieldGroup}>
            <label htmlFor="hr-input">HR (bpm)</label>
            <input
              id="hr-input"
              inputMode="numeric"
              value={hr}
              onChange={(e) => setHr(e.target.value)}
            />
          </div>
          <div className={s.fieldGroup}>
            <label htmlFor="spo2-input">SpO2 (%)</label>
            <input
              id="spo2-input"
              inputMode="numeric"
              value={spo2}
              onChange={(e) => setSpo2(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Body Temperature */}
      <div className={s.card}>
        <h3>Temperature (°C)</h3>
        <div className={s.grid2}>
          <div className={s.fieldGroup}>
            <label htmlFor="temp-input">Body Temp (°C)</label>
            <input
              id="temp-input"
              inputMode="decimal"
              placeholder="e.g. 36.6"
              value={temp}
              onChange={(e) => {
                setError('');
                setTemp(e.target.value);
              }}
            />
          </div>
          <div className={s.fieldGroup}>
            <label htmlFor="temp-ctx">Context</label>
            <select
              id="temp-ctx"
              value={tempContext}
              onChange={(e) =>
                setTempContext(
                  e.target.value as 'resting' | 'after exercise' | 'after meal'
                )
              }
            >
              <option value="resting">Resting</option>
              <option value="after exercise">After exercise</option>
              <option value="after meal">After meal</option>
            </select>
          </div>
        </div>
      </div>

      {/* Fluid Intake */}
      <div className={s.card}>
        <h3>Fluid Intake</h3>
        <div className={s.rowBetween}>
          <span>
            Total: <strong>{fluids} mL</strong>
          </span>
          <button
            type="button"
            className={s.quickBtn}
            onClick={() => setFluids((f) => f + 250)}
          >
            +250 mL
          </button>
        </div>
      </div>

      {/* Mood Assessment */}
      <div className={s.card}>
        <div className={s.rowBetween}>
          <h3>Mood Rating</h3>
          <button
            type="button"
            className={s.linkBtn}
            onClick={() => setMood(undefined)}
          >
            Skip
          </button>
        </div>
        <div className={s.moodRow}>
          {[1, 2, 3, 4, 5].map((val) => (
            <button
              key={val}
              type="button"
              className={`${s.moodBtn} ${mood === val ? s.moodActive : ''}`}
              onClick={() => setMood(val)}
            >
              {['😫', '😕', '😐', '🙂', '🚀'][val - 1]}
            </button>
          ))}
        </div>
      </div>

      {/* Symptom Chips */}
      <div className={s.card}>
        <h3>Symptoms Today</h3>
        <div className={s.chipsGrid}>
          {SYMPTOM_OPTIONS.map((sym) => (
            <button
              key={sym}
              type="button"
              className={`${s.chip} ${
                symptoms.includes(sym) ? s.chipActive : ''
              }`}
              onClick={() => toggleSymptom(sym)}
            >
              {sym}
            </button>
          ))}
        </div>
      </div>

      
      <div className={s.card}>
        <div className={s.rowGap}>
          <button
            type="button"
            className={s.toggleBtn}
            onClick={() => setShowGlucose(!showGlucose)}
          >
            {showGlucose ? '− Hide Glucose' : '+ Glucose'}
          </button>
          <button
            type="button"
            className={s.toggleBtn}
            onClick={() => setShowBP(!showBP)}
          >
            {showBP ? '− Hide Blood Pressure' : '+ Blood Pressure'}
          </button>
        </div>

        {showGlucose && (
          <div className={`${s.grid2} ${s.marginTop}`}>
            <div className={s.fieldGroup}>
              <label htmlFor="glucose-input">Glucose (mg/dL)</label>
              <input
                id="glucose-input"
                inputMode="decimal"
                value={glucose}
                onChange={(e) => {
                  setError('');
                  setGlucose(e.target.value);
                }}
              />
            </div>
            <div className={s.fieldGroup}>
              <label htmlFor="glucose-ctx">Context</label>
              <select
                id="glucose-ctx"
                value={glucoseContext}
                onChange={(e) =>
                  setGlucoseContext(
                    e.target.value as 'fasting' | 'before meal' | 'after meal'
                  )
                }
              >
                <option value="fasting">Fasting</option>
                <option value="before meal">Before meal</option>
                <option value="after meal">After meal</option>
              </select>
            </div>
          </div>
        )}

        {showBP && (
          <div className={`${s.grid2} ${s.marginTop}`}>
            <div className={s.fieldGroup}>
              <label htmlFor="bpsys-input">Systolic (mmHg)</label>
              <input
                id="bpsys-input"
                inputMode="numeric"
                value={bpSys}
                onChange={(e) => setBpSys(e.target.value)}
              />
            </div>
            <div className={s.fieldGroup}>
              <label htmlFor="bpdia-input">Diastolic (mmHg)</label>
              <input
                id="bpdia-input"
                inputMode="numeric"
                value={bpDia}
                onChange={(e) => setBpDia(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}

      {/* Main Submit Button */}
      <button type="submit" disabled={isSaving} className={s.submitBtn}>
        {isSaving ? 'Saving...' : `Save check-in for ${name}`}
      </button>
    </form>
  );
}
