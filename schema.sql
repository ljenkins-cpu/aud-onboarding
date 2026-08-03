-- Cherry Audiology Onboarding Resources
-- Database schema (PostgreSQL)
-- Run once against a fresh database: npm run migrate

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Cherry Internal Resources
-- title, link, description
CREATE TABLE IF NOT EXISTS internal_resources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  link         TEXT NOT NULL,
  description  TEXT DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2 & 3. Audiology Industry Knowledge + Audiology Cherry Product Knowledge
-- Same shape, distinguished by `section` ('industry' | 'product')
-- title, description, media (array of {name, type, dataUrl}), date_created, date_validated
CREATE TABLE IF NOT EXISTS knowledge_cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section         TEXT NOT NULL CHECK (section IN ('industry', 'product')),
  title           TEXT NOT NULL,
  description     TEXT DEFAULT '',
  media           JSONB NOT NULL DEFAULT '[]'::jsonb,
  date_created    DATE NOT NULL DEFAULT CURRENT_DATE,
  date_validated  DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_cards_section ON knowledge_cards (section);

-- 4. Talk Track Examples
-- title, description, gong_link
CREATE TABLE IF NOT EXISTS talk_tracks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT DEFAULT '',
  gong_link    TEXT DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Web Provider Contacts
-- company, email, secondary_email
CREATE TABLE IF NOT EXISTS provider_contacts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company          TEXT NOT NULL,
  email            TEXT DEFAULT '',
  secondary_email  TEXT DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Example Implementations
-- title, description, media (array of {name, type, dataUrl})
CREATE TABLE IF NOT EXISTS implementation_examples (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT DEFAULT '',
  media        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
