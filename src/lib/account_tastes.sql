CREATE TABLE IF NOT EXISTS account_tastes (
  user_key TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
