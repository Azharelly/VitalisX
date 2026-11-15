import React, { useRef, useState } from 'react';
import styles from './emergency.module.css';

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

  const startHold = () => {
    startRef.current = performance.now();
    const tick = (now: number) => {
      if (!startRef.current) return;
      const pct = Math.min(100, ((now - startRef.current) / holdDurationMs) * 100);
      setProgress(pct);
      if (pct >= 100) {
        cancelHold();
        onConfirmEnd();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const cancelHold = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    setProgress(0);
  };

  return (
    <button
      type="button"
      className={styles.holdEndBtn}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      aria-label="End emergency, hold for 2 seconds"
    >
      <span
        className={styles.holdFill}
        style={{ width: `${progress}%` }}
        aria-hidden="true"
      />
      <span className={styles.holdLabel}>
        {progress > 0 ? 'Keep holding to end…' : 'End emergency · hold 2 seconds'}
      </span>
    </button>
  );
};