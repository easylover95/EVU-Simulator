/*
# EVU Simulator — Globale Ruhmeshalle

Diese Tabelle speichert ausschließlich freiwillig veröffentlichte, abgeschlossene
Unternehmensläufe. Sie enthält keine lokalen Spielstände, keine Personal-,
Fahrzeug- oder Vertragsdetails und keine Kontodaten außerhalb des Endkapitals.

Das Spiel unterstützt aktuell keinen Benutzer-Login. Deshalb ist die Rangliste
als öffentlich lesbare, append-only Demo-Rangliste ausgelegt: Neue Einträge dürfen
angelegt, bestehende Einträge aber nicht verändert oder gelöscht werden.
Für produktive Missbrauchsabwehr sollten Einreichungen künftig über eine
Supabase Edge Function mit Authentifizierung und Rate-Limit erfolgen.
*/

CREATE TABLE IF NOT EXISTS public.evu_global_leaderboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_run_id text NOT NULL UNIQUE,
  company_name text NOT NULL CHECK (char_length(company_name) BETWEEN 1 AND 48),
  difficulty text NOT NULL CHECK (difficulty IN ('hardcore', 'standard', 'komfort')),
  peak_revenue bigint NOT NULL DEFAULT 0 CHECK (peak_revenue >= 0),
  total_revenue bigint NOT NULL DEFAULT 0 CHECK (total_revenue >= 0),
  freight_tonnes bigint NOT NULL DEFAULT 0 CHECK (freight_tonnes >= 0),
  completed_trips integer NOT NULL DEFAULT 0 CHECK (completed_trips >= 0),
  duration_ticks integer NOT NULL DEFAULT 0 CHECK (duration_ticks >= 0),
  ending_level integer NOT NULL DEFAULT 1 CHECK (ending_level >= 1 AND ending_level <= 20),
  ending_balance bigint NOT NULL DEFAULT 0 CHECK (ending_balance >= 0),
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evu_global_leaderboard_rank_idx
  ON public.evu_global_leaderboard (peak_revenue DESC, total_revenue DESC, ending_balance DESC);

ALTER TABLE public.evu_global_leaderboard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leaderboard_read_public" ON public.evu_global_leaderboard;
CREATE POLICY "leaderboard_read_public"
  ON public.evu_global_leaderboard FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "leaderboard_insert_public" ON public.evu_global_leaderboard;
CREATE POLICY "leaderboard_insert_public"
  ON public.evu_global_leaderboard FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(company_name) BETWEEN 1 AND 48
    AND difficulty IN ('hardcore', 'standard', 'komfort')
    AND peak_revenue >= 0
    AND total_revenue >= 0
    AND freight_tonnes >= 0
    AND completed_trips >= 0
    AND duration_ticks >= 0
    AND ending_level BETWEEN 1 AND 20
    AND ending_balance >= 0
  );

-- Es gibt absichtlich keine UPDATE- oder DELETE-Policy.
