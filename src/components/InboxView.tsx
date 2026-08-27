import { useMemo, useState } from 'react';
import {
  Mail,
  MailOpen,
  Trash2,
  CheckCheck,
  AlertTriangle,
  Landmark,
  Train,
  Monitor,
  Handshake,
} from 'lucide-react';
import type { Driver } from '@/lib/supabase';
import { formatEuro } from '@/lib/status';
import { formatTickLabel } from '@/lib/gameTime';
import { Button } from '@/components/ui';
import { SectionShell } from '@/components/SectionShell';
import { availableTfDrivers, type RentalState, type TfHireRequest } from '@/lib/rental';
import {
  filterInbox,
  type InboxCategory,
  type InboxFilter,
  type Message,
} from '@/lib/inbox';

interface InboxViewProps {
  messages: Message[];
  drivers: Driver[];
  rentals: RentalState;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
  onMarkAllRead: () => void;
  onDeleteRead: () => void;
  onRespondHire: (requestId: string, accept: boolean, driverId?: string) => boolean;
}

const FILTERS: { id: InboxFilter; label: string }[] = [
  { id: 'alle', label: 'Alle' },
  { id: 'ungelesen', label: 'Ungelesen' },
  { id: 'Disposition', label: 'Disposition' },
  { id: 'Finanzen', label: 'Finanzen' },
  { id: 'Warnung', label: 'Warnungen' },
  { id: 'System', label: 'System' },
];

const CATEGORY_STYLE: Record<InboxCategory, { pill: string; accent: string }> = {
  System: { pill: 'border-sky-500/40 bg-sky-950/50 text-sky-300', accent: 'border-l-sky-400' },
  Disposition: { pill: 'border-amber-500/40 bg-amber-950/50 text-amber-300', accent: 'border-l-amber-400' },
  Finanzen: { pill: 'border-emerald-500/40 bg-emerald-950/50 text-emerald-300', accent: 'border-l-emerald-400' },
  Warnung: { pill: 'border-rose-500/40 bg-rose-950/50 text-rose-300', accent: 'border-l-rose-400' },
};

export function InboxView({
  messages,
  drivers,
  rentals,
  onMarkRead,
  onDelete,
  onMarkAllRead,
  onDeleteRead,
  onRespondHire,
}: InboxViewProps) {
  const [filter, setFilter] = useState<InboxFilter>('alle');
  const pendingHires = rentals.hireRequests.filter((r) => r.status === 'pending');
  const freeTf = availableTfDrivers(drivers, rentals);
  const unread = unreadCount(messages);
  const filtered = useMemo(() => filterInbox(messages, filter), [messages, filter]);
  const readCount = messages.length - unread;

  return (
    <SectionShell title="Posteingang" subtitle="Betriebliche Post — Disposition, Finanzen, Warnungen und System">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="app-glass-panel rounded-sm border border-amber-500/25 p-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <Mail className="h-3.5 w-3.5 text-amber-400" /> Nachrichten gesamt
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-white">{messages.length}</div>
        </div>
        <div className="app-glass-panel rounded-sm border border-amber-500/25 p-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <MailOpen className="h-3.5 w-3.5 text-rose-400" /> Ungelesen
          </div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${unread > 0 ? 'text-rose-300' : 'text-slate-400'}`}>
            {unread}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="fi-filter-bar w-full overflow-x-auto sm:w-fit">
          {FILTERS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`fi-filter ${filter === tab.id ? 'fi-filter-active' : ''}`}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
              {tab.id === 'ungelesen' ? ` (${unread})` : ''}
            </button>
          ))}
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <Button className="w-full whitespace-normal sm:w-auto sm:whitespace-nowrap" variant="secondary" disabled={unread === 0} onClick={onMarkAllRead}>
            <CheckCheck className="h-3.5 w-3.5" /> Alle als gelesen markieren
          </Button>
          <Button className="w-full whitespace-normal sm:w-auto sm:whitespace-nowrap" variant="danger" disabled={readCount === 0} onClick={onDeleteRead}>
            <Trash2 className="h-3.5 w-3.5" /> Gelesene löschen
          </Button>
        </div>
      </div>

      {pendingHires.length > 0 && (
        <div className="fi-card">
          <div className="fi-card-header flex items-center gap-2">
            <Handshake className="h-3.5 w-3.5 text-amber-400" />
            Anfragen Partner-EVUs
          </div>
          <div className="divide-y divide-amber-500/10">
            {pendingHires.map((request) => (
              <HireRequestRow
                key={request.id}
                request={request}
                drivers={freeTf}
                onRespond={onRespondHire}
              />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="rounded-sm border border-slate-800 py-12 text-center text-xs text-slate-500">
            Keine Nachrichten in diesem Ordner
          </div>
        )}
        {filtered.map((message) => {
          const style = CATEGORY_STYLE[message.category];
          return (
            <article
              key={message.id}
              className={`fi-deferred-list-card app-glass-panel w-full min-w-0 rounded-sm border border-slate-800 pl-0 transition-colors hover:border-amber-500/35 hover:bg-slate-900/60 ${
                message.isRead ? 'opacity-70' : `border-l-4 ${style.accent} bg-slate-900/50`
              }`}
            >
              <div className="flex min-w-0 flex-col gap-3 px-3 py-3 sm:px-4">
                <div className="min-w-0 w-full">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase ${style.pill}`}>
                      <CategoryIcon category={message.category} />
                      {message.category}
                    </span>
                    <span className="text-[10px] tabular-nums text-slate-500">{formatTickLabel(message.timestamp)}</span>
                    {!message.isRead && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                  </div>
                  <h3 className={`mt-1 text-sm text-white ${message.isRead ? 'font-medium' : 'font-bold'}`}>
                    {message.title}
                  </h3>
                  <p className={`mt-1 w-full break-words hyphens-auto text-[12px] leading-relaxed text-slate-400 [overflow-wrap:anywhere] ${message.isRead ? '' : 'font-medium text-slate-300'}`}>
                    {message.content}
                  </p>
                </div>
                <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:justify-end">
                  {!message.isRead && (
                    <Button className="w-full whitespace-normal px-3 py-2 sm:w-auto sm:whitespace-nowrap" variant="secondary" onClick={() => onMarkRead(message.id)}>
                      <MailOpen className="h-3.5 w-3.5" /> Als gelesen markieren
                    </Button>
                  )}
                  <Button className="w-full whitespace-normal px-3 py-2 sm:w-auto sm:whitespace-nowrap" variant="danger" onClick={() => onDelete(message.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Löschen
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </SectionShell>
  );
}

function unreadCount(messages: Message[]): number {
  return messages.reduce((n, m) => n + (m.isRead ? 0 : 1), 0);
}

function CategoryIcon({ category }: { category: InboxCategory }) {
  const cls = 'h-3 w-3';
  if (category === 'Warnung') return <AlertTriangle className={cls} />;
  if (category === 'Finanzen') return <Landmark className={cls} />;
  if (category === 'System') return <Monitor className={cls} />;
  return <Train className={cls} />;
}

function HireRequestRow({
  request,
  drivers,
  onRespond,
}: {
  request: TfHireRequest;
  drivers: Driver[];
  onRespond: (requestId: string, accept: boolean, driverId?: string) => boolean;
}) {
  const [driverId, setDriverId] = useState(drivers[0]?.id ?? '');
  const total = request.hourlyRate * request.hours;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="text-xs font-bold text-white">{request.partnerName}</div>
        <p className="mt-0.5 text-[11px] text-slate-400">
          Tf-Gestellung {request.hours} h · {request.hourlyRate} €/h · {formatEuro(total)} gesamt
        </p>
        {drivers.length > 0 ? (
          <select
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="mt-2 rounded-lg border border-amber-500/30 bg-slate-950 px-2 py-1 text-[11px] text-white"
          >
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-2 text-[11px] text-rose-300">Kein freier Tf verfügbar</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          disabled={drivers.length === 0}
          onClick={() => onRespond(request.id, true, driverId || drivers[0]?.id)}
        >
          Annehmen
        </Button>
        <Button variant="secondary" onClick={() => onRespond(request.id, false)}>
          Ablehnen
        </Button>
      </div>
    </div>
  );
}
