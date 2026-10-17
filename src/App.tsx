import { useEffect, useRef, useState } from 'react';
import { RANK_META } from '@/vectra/career';
import { EMPLOYERS, type EmployerId } from '@/vectra/employers';
import { setGsmrVolumes } from '@/vectra/gsmrSettings';
import {
  clearSave,
  DEFAULT_SETTINGS,
  exportSaveJson,
  hasSave,
  importSaveJson,
  loadSave,
  loadSettings,
  type GameSettings,
  type GameState,
  type SaveGame,
  writeSave,
  writeSettings,
} from '@/vectra/saveGame';
import { VectraApp } from '@/vectra/VectraApp';
import '@/vectra/vectra.css';

type RuntimePhase = Extract<GameState, 'SHIFT_BRIEFING' | 'ACTIVE_SHIFT' | 'SHIFT_SUMMARY'>;

function applyAudioSettings(s: GameSettings) {
  setGsmrVolumes(s.ttsVolume, s.radioVolume);
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>('MAIN_MENU');
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [activeSave, setActiveSave] = useState<SaveGame | null>(() => loadSave());
  const [menuNotice, setMenuNotice] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [setupEmployer, setSetupEmployer] = useState<EmployerId>('rrc');
  const [nameError, setNameError] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const saveExists = Boolean(activeSave) || hasSave();

  useEffect(() => {
    applyAudioSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (gameState !== 'MAIN_MENU' && gameState !== 'CAREER_SETUP' && !activeSave) {
      setGameState('MAIN_MENU');
    }
  }, [gameState, activeSave]);

  function persistSettings(next: GameSettings) {
    setSettings(next);
    writeSettings(next);
    applyAudioSettings(next);
  }

  function persistSave(save: SaveGame) {
    const withSettings: SaveGame = { ...save, settings };
    writeSave(withSettings);
    setActiveSave(withSettings);
    setMenuNotice(`Spielstand gespeichert · ${new Date(withSettings.savedAt).toLocaleString('de-DE')}`);
  }

  function continueGame() {
    const save = activeSave ?? loadSave();
    if (!save) {
      setMenuNotice('Kein Spielstand gefunden.');
      return;
    }
    setActiveSave(save);
    setGameState('SHIFT_BRIEFING');
  }

  function startCareer() {
    const name = setupName.trim();
    if (!name) {
      setNameError(true);
      return;
    }
    const save: SaveGame = {
      version: 1,
      savedAt: new Date().toISOString(),
      employerId: setupEmployer,
      career: {
        displayName: name,
        roleLabel: 'Disponent / Disponentin',
        rank: 1,
        exp: 0,
        shiftsCompleted: 0,
        shiftsAtRank: 0,
        punctualityHistory: [],
        totalEarnedEuro: 0,
      },
      locos: [],
      drivers: [],
      trains: [],
      handoverBook: [],
      logEntries: [],
      inGameMinutes: 6 * 60,
      lastShiftKind: null,
      settings,
    };
    writeSave(save);
    setActiveSave(save);
    setGameState('SHIFT_BRIEFING');
  }

  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const imported = importSaveJson(String(reader.result ?? ''));
      if (!imported) {
        setMenuNotice('Import fehlgeschlagen — ungültige Datei.');
        return;
      }
      writeSave(imported);
      setActiveSave(imported);
      setMenuNotice('Spielstand importiert.');
    };
    reader.readAsText(file);
  }

  function downloadSave() {
    const save = activeSave ?? loadSave();
    if (!save) {
      setMenuNotice('Nichts zum Exportieren.');
      return;
    }
    const blob = new Blob([exportSaveJson(save)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evu-save-${save.career.displayName || 'disponent'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---------- MAIN MENU ---------- */
  if (gameState === 'MAIN_MENU') {
    return (
      <div className="mm-root">
        <div className="mm-scanlines" aria-hidden />
        <div className="mm-panel">
          <header className="mm-header">
            <p className="mm-eyebrow">EVU Operational Terminal</p>
            <h1>Rhein-Ruhr Cargo</h1>
            <p className="mm-sub">Operational Workstation v2.4</p>
            <p className="mm-meta">Disponenten-Leitstelle · Lokal gespeicherte Karriere</p>
          </header>

          {menuNotice && <p className="mm-notice">{menuNotice}</p>}

          <nav className="mm-nav" aria-label="Hauptmenü">
            <button type="button" className="mm-btn mm-btn-primary" disabled={!saveExists} onClick={continueGame}>
              <span className="mm-key">1</span> Fortsetzen
            </button>
            <button
              type="button"
              className="mm-btn"
              onClick={() => {
                setNameError(false);
                setGameState('CAREER_SETUP');
              }}
            >
              <span className="mm-key">2</span> Neues Spiel / Karriere starten
            </button>
            <button
              type="button"
              className="mm-btn"
              disabled={!saveExists}
              onClick={() => {
                const save = loadSave();
                if (!save) {
                  setMenuNotice('Kein Spielstand vorhanden.');
                  return;
                }
                setActiveSave(save);
                setGameState('SHIFT_BRIEFING');
              }}
            >
              <span className="mm-key">3</span> Spiel laden
            </button>
            <button
              type="button"
              className="mm-btn"
              disabled={!saveExists}
              onClick={() => {
                const save = activeSave ?? loadSave();
                if (save) persistSave(save);
              }}
            >
              <span className="mm-key">4</span> Aktuellen Spielstand speichern
            </button>
            <button type="button" className="mm-btn" onClick={() => setShowSettings(true)}>
              <span className="mm-key">5</span> Einstellungen
            </button>
          </nav>

          <div className="mm-tools">
            <button type="button" className="mm-link" onClick={() => fileRef.current?.click()}>
              JSON importieren
            </button>
            <button type="button" className="mm-link" disabled={!saveExists} onClick={downloadSave}>
              JSON exportieren
            </button>
            <button
              type="button"
              className="mm-link mm-link-danger"
              disabled={!saveExists}
              onClick={() => {
                clearSave();
                setActiveSave(null);
                setMenuNotice('Spielstand gelöscht.');
              }}
            >
              Speicher löschen
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
              e.target.value = '';
            }}
          />

          {activeSave && (
            <footer className="mm-footer">
              <span>
                {activeSave.career.displayName || '—'} · {RANK_META[activeSave.career.rank].label}
              </span>
              <span>
                {EMPLOYERS.find((e) => e.id === activeSave.employerId)?.shortName} · EXP {activeSave.career.exp} ·{' '}
                {activeSave.career.shiftsCompleted} Schichten
              </span>
            </footer>
          )}
        </div>

        {showSettings && (
          <SettingsModal
            settings={settings}
            onChange={persistSettings}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>
    );
  }

  /* ---------- CAREER SETUP ---------- */
  if (gameState === 'CAREER_SETUP') {
    return (
      <div className="mm-root">
        <div className="mm-scanlines" aria-hidden />
        <div className="mm-panel mm-panel-wide">
          <header className="mm-header">
            <p className="mm-eyebrow">Karriere-Setup</p>
            <h1>Neues Spiel</h1>
            <p className="mm-sub">Name · Start-EVU · Start als Junior-Disponent</p>
          </header>

          <label className="mm-field">
            <span>Disponenten-Name</span>
            <input
              autoFocus
              value={setupName}
              placeholder="Vor- und Nachname"
              onChange={(e) => {
                setSetupName(e.target.value);
                if (nameError && e.target.value.trim()) setNameError(false);
              }}
              aria-invalid={nameError}
            />
            {nameError && <em>Bitte Namen eintragen.</em>}
          </label>

          <p className="mm-label">Start-EVU</p>
          <div className="mm-employer-grid">
            {EMPLOYERS.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`mm-employer ${setupEmployer === e.id ? 'is-on' : ''}`}
                style={{ ['--mm-accent' as string]: e.accent }}
                onClick={() => setSetupEmployer(e.id)}
              >
                <span>{e.shortName}</span>
                <strong>{e.legalName}</strong>
                <small>
                  {e.hqCity} · {e.regionHint}
                </small>
              </button>
            ))}
          </div>

          <p className="mm-hint">
            Einstieg: <strong>{RANK_META[1].label}</strong> — höhere Ränge nur durch Schichten, EXP und
            Beförderung.
          </p>

          <div className="mm-actions">
            <button type="button" className="mm-btn" onClick={() => setGameState('MAIN_MENU')}>
              Abbrechen
            </button>
            <button type="button" className="mm-btn mm-btn-primary" onClick={startCareer}>
              Karriere starten
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- RUNTIME (Briefing / Shift / Summary) ---------- */
  if (gameState === 'SHIFT_BRIEFING' || gameState === 'ACTIVE_SHIFT' || gameState === 'SHIFT_SUMMARY') {
    if (!activeSave) return null;
    const phase = gameState as RuntimePhase;
    return (
      <VectraApp
        save={activeSave}
        settings={settings}
        phase={phase}
        onPhaseChange={setGameState}
        onPersist={persistSave}
        onQuitToMainMenu={(save) => {
          persistSave(save);
          setGameState('MAIN_MENU');
          setMenuNotice('Fortschritt gespeichert · Hauptmenü');
        }}
        onSettingsChange={persistSettings}
      />
    );
  }

  return null;
}

function SettingsModal({
  settings,
  onChange,
  onClose,
}: {
  settings: GameSettings;
  onChange: (s: GameSettings) => void;
  onClose: () => void;
}) {
  return (
    <div className="mm-modal-bg" role="presentation" onClick={onClose}>
      <div
        className="mm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2 id="settings-title">Einstellungen</h2>
          <button type="button" className="mm-btn" onClick={onClose}>
            Schließen
          </button>
        </header>
        <div className="mm-modal-body space-y-4">
          <label className="mm-field">
            <span>TTS-Stimme · Lautstärke ({Math.round(settings.ttsVolume * 100)} %)</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.ttsVolume}
              onChange={(e) => onChange({ ...settings, ttsVolume: Number(e.target.value) })}
            />
          </label>
          <label className="mm-field">
            <span>GSM-R Funk-Effekt ({Math.round(settings.radioVolume * 100)} %)</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.radioVolume}
              onChange={(e) => onChange({ ...settings, radioVolume: Number(e.target.value) })}
            />
          </label>
          <label className="mm-field">
            <span>Zeitraffer beim Schichtstart</span>
            <div className="mm-rank-row">
              {([0, 1, 2, 5] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`mm-btn ${settings.defaultSpeed === s ? 'mm-btn-primary' : ''}`}
                  onClick={() => onChange({ ...settings, defaultSpeed: s })}
                >
                  {s === 0 ? 'Pause' : `${s}x`}
                </button>
              ))}
            </div>
          </label>
          <button
            type="button"
            className="mm-link"
            onClick={() => onChange({ ...DEFAULT_SETTINGS })}
          >
            Auf Standard zurücksetzen
          </button>
        </div>
      </div>
    </div>
  );
}
