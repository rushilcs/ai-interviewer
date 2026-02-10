CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OPS_ADMIN', 'OPS_REVIEWER')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, schema_version)
);

CREATE INDEX IF NOT EXISTS idx_roles_schema_version ON roles (schema_version);

CREATE TABLE IF NOT EXISTS interview_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id),
  candidate_email TEXT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NULL,
  max_starts INTEGER NOT NULL DEFAULT 1 CHECK (max_starts > 0),
  starts_used INTEGER NOT NULL DEFAULT 0,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ NULL,
  CHECK (starts_used <= max_starts)
);

CREATE INDEX IF NOT EXISTS idx_interview_invites_role_id ON interview_invites (role_id);

CREATE TABLE IF NOT EXISTS interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id),
  invite_id UUID NULL REFERENCES interview_invites(id),
  candidate_email TEXT NULL,
  schema_version TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'TERMINATED')),
  current_section_id TEXT NULL,
  section_started_at TIMESTAMPTZ NULL,
  section_deadline_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  terminated_at TIMESTAMPTZ NULL,
  terminate_reason TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_interviews_invite_id ON interviews (invite_id);
CREATE INDEX IF NOT EXISTS idx_interviews_status ON interviews (status);
CREATE INDEX IF NOT EXISTS idx_interviews_role_id ON interviews (role_id);

CREATE TABLE IF NOT EXISTS interview_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id),
  seq BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('SYSTEM', 'INTERVIEWER_AI', 'ASSISTANT_AI', 'CANDIDATE', 'OPS_USER')),
  event_type TEXT NOT NULL,
  client_event_id TEXT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  late BOOLEAN NOT NULL DEFAULT FALSE,
  section_id TEXT NULL,
  schema_version TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  UNIQUE (interview_id, seq)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_events_client_event_id
  ON interview_events (interview_id, client_event_id)
  WHERE client_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interview_events_interview_seq ON interview_events (interview_id, seq);
CREATE INDEX IF NOT EXISTS idx_interview_events_interview_event_type ON interview_events (interview_id, event_type);
CREATE INDEX IF NOT EXISTS idx_interview_events_interview_created ON interview_events (interview_id, created_at);

CREATE TABLE IF NOT EXISTS evaluation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL UNIQUE REFERENCES interviews(id),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
  evaluation_version TEXT NOT NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_jobs_status ON evaluation_jobs (status);

CREATE TABLE IF NOT EXISTS evaluation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL UNIQUE REFERENCES interviews(id),
  evaluation_version TEXT NOT NULL,
  overall_score NUMERIC NULL,
  overall_band TEXT NULL CHECK (overall_band IN ('STRONG_SIGNAL', 'MIXED_SIGNAL', 'WEAK_SIGNAL')),
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  section_results_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  signals_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_results_version ON evaluation_results (evaluation_version);
