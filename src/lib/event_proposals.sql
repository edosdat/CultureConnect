-- Neon: user event proposals (separate from catalogue / programme.csv).
-- Applied at runtime via CREATE TABLE IF NOT EXISTS in eventProposalStore
-- (same pattern as account_tastes.sql / mail_consent).

CREATE TABLE IF NOT EXISTS event_proposals (
  id UUID PRIMARY KEY,
  submitter_email TEXT NOT NULL,
  title TEXT NOT NULL,
  venue_name TEXT NOT NULL,
  venue_id TEXT,
  is_new_venue BOOLEAN NOT NULL DEFAULT true,
  date DATE NOT NULL,
  time TEXT,
  url_user TEXT,
  url_prog_candidate TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'matched_candidate',
      'matched_confirmed',
      'needs_review',
      'rejected',
      'ingested'
    )),
  dedupe_key TEXT NOT NULL,
  match_event_id TEXT,
  user_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_proposals_email_created_idx
  ON event_proposals (submitter_email, created_at DESC);

CREATE INDEX IF NOT EXISTS event_proposals_dedupe_idx
  ON event_proposals (submitter_email, dedupe_key);
