import { CloudOff, RadioTower, RefreshCw, Wifi } from 'lucide-react';
import type { NetworkStatus } from '@/lib/networkStatus';

type NetworkStatusNoticeProps = {
  status: NetworkStatus;
  onRefresh: () => void;
  variant: 'desktop' | 'mobile';
};

/**
 * A status hint only: it never disables local simulation controls. The mobile
 * version is intentionally rendered only while checking or offline.
 */
export function NetworkStatusNotice({ status, onRefresh, variant }: NetworkStatusNoticeProps) {
  if (variant === 'mobile' && status === 'online') return null;

  const checking = status === 'checking';
  const offline = status === 'offline';
  const Icon = offline ? CloudOff : checking ? RadioTower : Wifi;

  if (variant === 'desktop') {
    return (
      <button
        type="button"
        className={`network-status-button network-status-button--${status}`}
        onClick={onRefresh}
        title={offline ? 'Offline – Verbindung erneut prüfen' : checking ? 'Leitstellenverbindung wird geprüft' : 'Leitstelle verbunden'}
        aria-label={offline ? 'Offline – Verbindung erneut prüfen' : checking ? 'Leitstellenverbindung wird geprüft' : 'Leitstelle verbunden'}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden xl:inline">{offline ? 'Offline' : checking ? 'Prüfen' : 'Online'}</span>
      </button>
    );
  }

  return (
    <aside className={`network-status-banner network-status-banner--${status}`} role="status" aria-live="polite">
      <Icon className={`h-4 w-4 shrink-0 ${checking ? 'network-status-spin' : ''}`} aria-hidden />
      <span className="min-w-0">
        {offline
          ? 'Offline – lokaler Spielstand und Betriebskarte bleiben verfügbar.'
          : 'Leitstellenverbindung wird geprüft …'}
      </span>
      {!checking && (
        <button type="button" onClick={onRefresh} className="network-status-retry">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          <span>Erneut prüfen</span>
        </button>
      )}
    </aside>
  );
}
