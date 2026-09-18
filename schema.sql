
-- V/R Match — módulo de lanzamiento viral
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS city_launches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city_slug TEXT NOT NULL UNIQUE,
  city_name TEXT NOT NULL,
  target_users INTEGER NOT NULL DEFAULT 500,
  is_unlocked INTEGER NOT NULL DEFAULT 0,
  unlocked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS waitlist_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias TEXT NOT NULL,
  age INTEGER NOT NULL CHECK(age >= 18 AND age <= 99),
  email TEXT NOT NULL UNIQUE,
  city_slug TEXT NOT NULL,
  public_profile INTEGER NOT NULL DEFAULT 0,
  referral_code TEXT NOT NULL UNIQUE,
  referred_by TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(city_slug) REFERENCES city_launches(city_slug)
);

CREATE TABLE IF NOT EXISTS referral_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referral_code TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('visit','signup')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_waitlist_city ON waitlist_users(city_slug);
CREATE INDEX IF NOT EXISTS idx_waitlist_referrer ON waitlist_users(referred_by);
CREATE INDEX IF NOT EXISTS idx_referral_events_code ON referral_events(referral_code);

INSERT OR IGNORE INTO city_launches(city_slug, city_name, target_users) VALUES
('valencia','Valencia',500),
('madrid','Madrid',1000),
('barcelona','Barcelona',750),
('alicante','Alicante',400),
('castellon','Castellón',250);

-- V18.10.0 — referidos de cuentas activas
CREATE TABLE IF NOT EXISTS user_referrals (
  user_id TEXT PRIMARY KEY,
  referral_code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_referral_attributions (
  invitee_user_id TEXT PRIMARY KEY,
  referrer_user_id TEXT,
  referral_code TEXT NOT NULL,
  attributed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_referral_attr_referrer ON user_referral_attributions(referrer_user_id, attributed_at DESC);
CREATE TABLE IF NOT EXISTS user_referral_events (
  id TEXT PRIMARY KEY,
  referral_code TEXT NOT NULL,
  event_type TEXT NOT NULL,
  user_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_referral_events_code ON user_referral_events(referral_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_referral_events_type ON user_referral_events(event_type, created_at DESC);

-- V18.11.0 — registro abierto + comunidad por ciudades
CREATE TABLE IF NOT EXISTS community_cities (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target_users INTEGER NOT NULL DEFAULT 500,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS community_city_memberships (
  user_id TEXT PRIMARY KEY,
  city_slug TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(city_slug) REFERENCES community_cities(slug)
);
CREATE INDEX IF NOT EXISTS idx_community_membership_city
  ON community_city_memberships(city_slug, joined_at DESC);
