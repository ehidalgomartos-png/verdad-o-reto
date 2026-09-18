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


-- V18.13.0 — analítica propia de crecimiento
CREATE TABLE IF NOT EXISTS growth_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  session_id TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  source TEXT NOT NULL DEFAULT 'direct',
  medium TEXT NOT NULL DEFAULT 'none',
  campaign TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  term TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  landing_path TEXT NOT NULL DEFAULT '',
  page TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_growth_events_name_created ON growth_events(event_name,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_events_session_created ON growth_events(session_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_events_user_created ON growth_events(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_events_source_created ON growth_events(source,created_at DESC);
CREATE TABLE IF NOT EXISTS growth_acquisition (
  user_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'direct',
  medium TEXT NOT NULL DEFAULT 'none',
  campaign TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  term TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  landing_path TEXT NOT NULL DEFAULT '',
  attributed_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_growth_acquisition_source ON growth_acquisition(source,attributed_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_acquisition_campaign ON growth_acquisition(campaign,attributed_at DESC);


-- V18.14.0 — retención por email
CREATE TABLE IF NOT EXISTS retention_email_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  context_key TEXT NOT NULL DEFAULT '',
  sent_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_retention_email_user_kind ON retention_email_log(user_id,kind,sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_retention_email_context ON retention_email_log(kind,context_key,sent_at DESC);
-- La columna notification_preferences.retention_email se añade automáticamente al arrancar.


-- V18.15.0 — verificación manual y señales anti-abuso
-- En la aplicación real, profiles.profile_verified y profiles.profile_verified_at
-- se añaden automáticamente con ensureColumn al arrancar.
CREATE TABLE IF NOT EXISTS profile_verification_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  proof_filename TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_profile_verification_user ON profile_verification_requests(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_verification_status ON profile_verification_requests(status,created_at ASC);
CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  kind TEXT NOT NULL,
  severity INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_kind ON security_events(kind,created_at DESC);
