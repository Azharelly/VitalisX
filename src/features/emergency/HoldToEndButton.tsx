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
  const pointerIdRef = useRef<number | null>(null);

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

  const cancelHold = useCallback((pointerId?: number) => {
    if (pointerId !== undefined && pointerIdRef.current !== pointerId) return;
    stopLoop();
    pointerIdRef.current = null;
    setProgress(0);
  }, [stopLoop]);

  // If the button unmounts mid-hold (e.g. the drawer closes), stop the loop so it can never fire onConfirmEnd.
  useEffect(() => stopLoop, [stopLoop]);

  const startHold = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (startRef.current !== null) return; // already holding
    event.preventDefault();
    pointerIdRef.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable in a few older browser engines; pointer events still work.
    }
    startRef.current = performance.now();
    setProgress(1);
    const tick = (now: number) => {
      const start = startRef.current;
      if (start === null) return;
      const pct = holdProgressPct(now, start, holdDurationMs);
      if (pct >= 100) {
        startRef.current = null;
        rafRef.current = null;
        pointerIdRef.current = null;
        setProgress(100);
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
      onPointerUp={(event) => cancelHold(event.pointerId)}
      onPointerMove={(event) => {
        if (pointerIdRef.current !== event.pointerId) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
          cancelHold(event.pointerId);
        }
      }}
      onPointerCancel={(event) => cancelHold(event.pointerId)}
      onLostPointerCapture={(event) => cancelHold(event.pointerId)}
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
