import { lazy, Suspense, useState } from 'react';
import { MainMenuScreen } from '@/components/MainMenuScreen';
import {
  DEFAULT_EVU_NAME,
  DEFAULT_HQ_LOCATION,
  loadCompanyProfile,
} from '@/lib/companyProfile';
import { loadCompanyEconomy } from '@/lib/economy';
import { isSessionActive, setSessionActive } from '@/lib/session';

const SimulatorRuntime = lazy(() => import('@/SimulatorRuntime'));

function RuntimeLoadingFallback() {
  return (
    <div className="app-shell flex min-h-[100dvh] items-center justify-center px-4">
      <div
        className="app-glass flex items-center gap-3 rounded-xl border border-amber-400/30 px-4 py-3 text-sm font-semibold text-amber-100 shadow-2xl"
        role="status"
        aria-live="polite"
      >
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" aria-hidden />
        Leitstelle wird vorbereitet …
      </div>
    </div>
  );
}

/**
 * Bewusst schlanker Einstieg: Das Hauptmenü bleibt auf Mobilgeräten sofort verfügbar.
 * Die zustandsintensive Simulation wird erst bei einer aktiven Sitzung importiert.
 */
function App() {
  const [simulationStarted, setSimulationStarted] = useState(() => isSessionActive());
  const profile = loadCompanyProfile();
  const economy = loadCompanyEconomy();

  function continueToSimulation() {
    setSessionActive(true);
    setSimulationStarted(true);
  }

  if (simulationStarted) {
    return (
      <Suspense fallback={<RuntimeLoadingFallback />}>
        <SimulatorRuntime />
      </Suspense>
    );
  }

  return (
    <MainMenuScreen
      companyName={profile?.name ?? DEFAULT_EVU_NAME}
      hqLocation={profile?.hq_location ?? DEFAULT_HQ_LOCATION}
      balance={economy?.balance ?? 150_000}
      level={economy?.level ?? 1}
      onContinue={continueToSimulation}
    />
  );
}

export default App;
