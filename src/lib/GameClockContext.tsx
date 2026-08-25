import { createContext, useContext } from 'react';
import type { ClockSpeed } from '@/lib/gameTime';
import { tickToDate } from '@/lib/gameTime';

export interface GameClockValue {
  tick: number;
  gameNow: Date;
  running: boolean;
  speed: ClockSpeed;
  setRunning: (running: boolean) => void;
  setSpeed: (speed: ClockSpeed) => void;
}

const GameClockContext = createContext<GameClockValue | null>(null);

export const GameClockProvider = GameClockContext.Provider;

export function useGameClock(): GameClockValue {
  const ctx = useContext(GameClockContext);
  if (ctx) return ctx;
  return {
    tick: 0,
    gameNow: tickToDate(0),
    running: false,
    speed: 1,
    setRunning: () => {},
    setSpeed: () => {},
  };
}
