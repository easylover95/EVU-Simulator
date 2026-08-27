import { useEffect, useRef } from 'react';

import { playTerminalSound, soundForTerminalEvent } from '@/lib/terminalAudio';
import { useTerminalSimulation } from '@/state/terminalSimulationStore';

/**
 * Observes only newly appended, already validated terminal events. The initial
 * persisted history is intentionally silent, so loading a save never replays old alarms.
 */
export function TerminalAudioBridge() {
  const events = useTerminalSimulation((state) => state.eventLog);
  const lastEventId = useRef<string | null>(null);
  const hasHydrated = useRef(false);

  useEffect(() => {
    if (!hasHydrated.current) {
      lastEventId.current = events.length > 0 ? events[events.length - 1].id : null;
      hasHydrated.current = true;
      return;
    }
    const startIndex = lastEventId.current
      ? events.findIndex((event) => event.id === lastEventId.current) + 1
      : 0;
    const newEvents = startIndex > 0 ? events.slice(startIndex) : events;
    for (const event of newEvents) {
      const sound = soundForTerminalEvent(event);
      if (sound) playTerminalSound(sound);
    }
    lastEventId.current = events.length > 0 ? events[events.length - 1].id : lastEventId.current;
  }, [events]);

  return null;
}
