import { createContext, useContext } from 'react';

type SoundEvent =
  | 'tick-up'
  | 'tick-down'
  | 'big-up'
  | 'big-down'
  | 'target-hit'
  | 'near-target'
  | 'market-open';

interface SoundContextValue {
  playSound: (event: SoundEvent) => void;
  muted: boolean;
  toggleMute: () => void;
}

export const SoundContext = createContext<SoundContextValue>({
  playSound: () => {},
  muted: false,
  toggleMute: () => {},
});

export function useSoundContext() {
  return useContext(SoundContext);
}
