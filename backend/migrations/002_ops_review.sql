-- Chunk 6: Ops review, overrides, comments. Raw evaluation immutable; overrides at read time only.

CREATE TABLE IF NOT EXISTS evaluation_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL UNIQUE REFERENCES interviews(id),
  reviewer_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_reviews_interview_id ON evaluation_reviews (interview_id);

CREATE TABLE IF NOT EXISTS evaluation_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL UNIQUE REFERENCES interviews(id),
  reviewer_id UUID NOT NULL REFERENCES users(id),
  original_band TEXT NOT NULL CHECK (original_band IN ('STRONG_SIGNAL', 'MIXED_SIGNAL', 'WEAK_SIGNAL')),
  overridden_band TEXT NOT NULL CHECK (overridden_band IN ('STRONG_SIGNAL', 'MIXED_SIGNAL', 'WEAK_SIGNAL')),
  justification TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_overrides_interview_id ON evaluation_overrides (interview_id);

CREATE TABLE IF NOT EXISTS evaluation_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id),
  reviewer_id UUID NOT NULL REFERENCES users(id),
  section_id TEXT NULL,
  metric_name TEXT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_comments_interview_id ON evaluation_comments (interview_id);
