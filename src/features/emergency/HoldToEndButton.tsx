import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './emergency.module.css';
import { holdProgressPct, holdSecondsText } from './hold';

interface Props {
  onConfirmEnd: () => void;
  holdDurationMs?: number;
}

export const HoldToEndButton: React.FC<Props> = ({
  onConfirmEnd,
  holdDurationMs = 2000,
}) => {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  // Always call the latest callback, without restarting a hold in progress when the parent re-renders.
  const onConfirmRef = useRef(onConfirmEnd);
  useEffect(() => {
    onConfirmRef.current = onConfirmEnd;
  }, [onConfirmEnd]);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
  }, []);

  const cancelHold = useCallback(() => {
    stopLoop();
    setProgress(0);
  }, [stopLoop]);

  // If the button unmounts mid-hold (e.g. the drawer closes), stop the loop so it can never fire onConfirmEnd.
  useEffect(() => stopLoop, [stopLoop]);

  const startHold = () => {
    if (startRef.current !== null) return; // already holding
    startRef.current = performance.now();
    const tick = (now: number) => {
      const start = startRef.current;
      if (start === null) return;
      const pct = holdProgressPct(now, start, holdDurationMs);
      if (pct >= 100) {
        cancelHold();
        onConfirmRef.current();
      } else {
        setProgress(pct);
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const holdText = holdSecondsText(holdDurationMs);

  return (
    <button
      type="button"
      className={styles.holdEndBtn}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      // A long press opens the context menu on Android; that would cancel the hold.
      onContextMenu={(e) => e.preventDefault()}
      aria-label={`End emergency, hold for ${holdText}`}
    >
      <span
        className={styles.holdFill}
        style={{ width: `${progress}%` }}
        aria-hidden="true"
      />
      <span className={styles.holdLabel}>
        {progress > 0 ? 'Keep holding to end…' : `End emergency · hold ${holdText}`}
      </span>
    </button>
  );
};
