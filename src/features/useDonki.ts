import { useEffect, useState } from 'react';
import { loadDonkiSnapshot, type DonkiSnapshot } from '../../engine/donki';

export type DonkiState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; snapshot: DonkiSnapshot };

/** Loads the bundled snapshot. Never blocks the screen: errors become a state. */
export function useDonki(): DonkiState {
  const [state, setState] = useState<DonkiState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    loadDonkiSnapshot()
      .then((snapshot) => { if (!cancelled) setState({ status: 'ready', snapshot }); })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : 'Unknown error' });
      });
    return () => { cancelled = true; };
  }, []);
  return state;
}
