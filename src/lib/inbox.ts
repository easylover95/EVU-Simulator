import { loadJson, saveJson } from '@/lib/storage';
import { newNotificationId } from '@/lib/gameTime';

export const INBOX_KEY = 'evu-inbox';
export const MAX_INBOX_MESSAGES = 200;

export type InboxCategory = 'System' | 'Disposition' | 'Finanzen' | 'Warnung';

export interface Message {
  id: string;
  timestamp: number;
  category: InboxCategory;
  title: string;
  content: string;
  isRead: boolean;
}

export type InboxFilter = 'alle' | 'ungelesen' | InboxCategory;

type InboxListener = (inbox: Message[]) => void;

const listeners = new Set<InboxListener>();

export function loadInbox(): Message[] {
  const loaded = loadJson<Message[] | null>(INBOX_KEY, null);
  if (!Array.isArray(loaded)) return [];
  return loaded.filter((m) => m && typeof m === 'object' && typeof m.id === 'string' && typeof m.title === 'string');
}

export function saveInbox(messages: Message[]): void {
  saveJson(INBOX_KEY, messages.slice(0, MAX_INBOX_MESSAGES));
}

export function subscribeInbox(listener: InboxListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function commit(next: Message[]): Message[] {
  const trimmed = next.slice(0, MAX_INBOX_MESSAGES);
  saveInbox(trimmed);
  listeners.forEach((listener) => listener(trimmed));
  return trimmed;
}

/** Callable from anywhere (tick loop, UI, libs). Persists immediately. */
export function sendMessage(
  category: InboxCategory,
  title: string,
  content: string,
  timestamp = 0,
): Message {
  const message: Message = {
    id: newNotificationId(),
    timestamp,
    category,
    title,
    content,
    isRead: false,
  };
  commit([message, ...loadInbox()]);
  return message;
}

export function markMessageRead(id: string): Message[] {
  return commit(loadInbox().map((m) => (m.id === id ? { ...m, isRead: true } : m)));
}

export function markAllMessagesRead(): Message[] {
  return commit(loadInbox().map((m) => (m.isRead ? m : { ...m, isRead: true })));
}

export function deleteMessage(id: string): Message[] {
  return commit(loadInbox().filter((m) => m.id !== id));
}

export function deleteReadMessages(): Message[] {
  return commit(loadInbox().filter((m) => !m.isRead));
}

export function unreadInboxCount(messages: Message[] = loadInbox()): number {
  return messages.reduce((n, m) => n + (m.isRead ? 0 : 1), 0);
}

export function filterInbox(messages: Message[], filter: InboxFilter): Message[] {
  if (filter === 'alle') return messages;
  if (filter === 'ungelesen') return messages.filter((m) => !m.isRead);
  return messages.filter((m) => m.category === filter);
}

export function seedWelcomeInbox(tick = 0): Message[] {
  if (loadInbox().length > 0) return loadInbox();
  sendMessage(
    'System',
    'Willkommen im Posteingang',
    'Hier landen betriebliche Meldungen: erfüllte Aufträge, Level-Aufstiege und Warnungen der Bank. Ungelesene Nachrichten siehst du am Briefumschlag in der Navigation.',
    tick,
  );
  return loadInbox();
}
