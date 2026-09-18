-- V/R Match · Launch / Waitlist
-- SQLite
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS launch_cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  target_users INTEGER NOT NULL DEFAULT 500 CHECK(target_users > 0),
  status TEXT NOT NULL DEFAULT 'WAITING'
    CHECK(status IN ('WAITING','READY','ACTIVE','PAUSED')),
  unlock_at TEXT,
  activated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS launch_waitlist_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias TEXT NOT NULL,
  age INTEGER NOT NULL CHECK(age BETWEEN 18 AND 99),
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  city_slug TEXT NOT NULL,
  public_profile INTEGER NOT NULL DEFAULT 0 CHECK(public_profile IN (0,1)),
  marketing_consent INTEGER NOT NULL DEFAULT 0 CHECK(marketing_consent IN (0,1)),
  referral_code TEXT NOT NULL UNIQUE,
  referred_by TEXT,
  status TEXT NOT NULL DEFAULT 'WAITLIST'
    CHECK(status IN ('WAITLIST','CITY_READY','ACTIVATED','BLOCKED')),
  app_user_id INTEGER,
  activation_sent_at TEXT,
  activated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(city_slug) REFERENCES launch_cities(slug)
);

CREATE TABLE IF NOT EXISTS launch_referral_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referral_code TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('VISIT','SIGNUP')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS launch_activation_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  waitlist_user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(waitlist_user_id) REFERENCES launch_waitlist_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS launch_mail_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  waitlist_user_id INTEGER,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  template TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK(status IN ('PENDING','SENT','ERROR')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(waitlist_user_id) REFERENCES launch_waitlist_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_launch_users_city
  ON launch_waitlist_users(city_slug);
CREATE INDEX IF NOT EXISTS idx_launch_users_status
  ON launch_waitlist_users(status);
CREATE INDEX IF NOT EXISTS idx_launch_users_referred_by
  ON launch_waitlist_users(referred_by);
CREATE INDEX IF NOT EXISTS idx_launch_tokens_user
  ON launch_activation_tokens(waitlist_user_id);
CREATE INDEX IF NOT EXISTS idx_launch_mail_status
  ON launch_mail_queue(status);

INSERT OR IGNORE INTO launch_cities(slug,name,target_users) VALUES
('valencia','Valencia',500),
('madrid','Madrid',1000),
('barcelona','Barcelona',750),
('alicante','Alicante',400),
('castellon','Castellón',250);

-- V18.11.0 — comunidad por ciudades para cuentas activas
-- La aplicación crea estas tablas automáticamente al arrancar.
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
