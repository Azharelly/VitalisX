import { useEffect, useState } from 'react';
import { loadDonki, type DonkiLoad } from '../engine/donkiRadiation';

export type DonkiState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | ({ status: 'ready' } & DonkiLoad);   // snapshot, origin ('live' | 'saved'), asOf, liveError

/** Tries NASA live, falls back to the bundled snapshot. Never blocks the screen: errors become a state. */
export function useDonki(): DonkiState {
  const [state, setState] = useState<DonkiState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    loadDonki()
      .then((load) => { if (!cancelled) setState({ status: 'ready', ...load }); })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : 'Unknown error' });
      });
    return () => { cancelled = true; };
  }, []);
  return state;
}
