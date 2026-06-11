-- Extend profiles with structured hero fields
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS headline TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS work_auth TEXT,
  ADD COLUMN IF NOT EXISTS languages TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS career_questions JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS career_dna JSONB NOT NULL DEFAULT '{}';

-- Work experiences
CREATE TABLE IF NOT EXISTS work_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  title TEXT NOT NULL,
  employment_type TEXT,
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  location TEXT,
  bullets TEXT[] NOT NULL DEFAULT '{}',
  skills_extracted TEXT[] NOT NULL DEFAULT '{}',
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS work_experiences_user ON work_experiences(user_id, sort_order);

-- Education
CREATE TABLE IF NOT EXISTS education (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution TEXT NOT NULL,
  degree TEXT,
  field TEXT,
  start_date DATE,
  end_date DATE,
  grade TEXT,
  activities TEXT[] NOT NULL DEFAULT '{}',
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS education_user ON education(user_id, sort_order);

-- Profile projects (portfolio pieces, not VVPs)
CREATE TABLE IF NOT EXISTS profile_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  role TEXT,
  tools TEXT[] NOT NULL DEFAULT '{}',
  outcome TEXT,
  links TEXT[] NOT NULL DEFAULT '{}',
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profile_projects_user ON profile_projects(user_id, sort_order);
