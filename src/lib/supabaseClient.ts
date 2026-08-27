import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabaseConfig } from '@/lib/supabase';

let clientPromise: Promise<SupabaseClient | null> | null = null;

/**
 * Lädt den optionalen Remote-Persistenzclient nur für konfigurierte Online-Spielstände.
 * Lokale Browser-Spielstände importieren @supabase/supabase-js damit nicht im Startpfad.
 */
export function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured) return Promise.resolve(null);

  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(supabaseConfig.url, supabaseConfig.anonKey),
  );
  return clientPromise;
}
