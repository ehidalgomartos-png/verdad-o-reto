
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

-- V18.16.0 — observabilidad técnica del servidor
CREATE TABLE IF NOT EXISTS server_errors (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL DEFAULT '',
  context TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  stack TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  request_id TEXT NOT NULL DEFAULT '',
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_server_errors_created ON server_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_server_errors_fingerprint ON server_errors(fingerprint,created_at DESC);



-- V18.19.0 — Viralidad 2.0
CREATE TABLE IF NOT EXISTS referral_rewards (
  user_id TEXT NOT NULL,
  reward_key TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  consumed_at INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(user_id,reward_key)
);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_available ON referral_rewards(user_id,consumed_at,granted_at);
CREATE TABLE IF NOT EXISTS creator_codes (
  code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  campaign TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS creator_events (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  event_type TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_creator_events_code ON creator_events(code,event_type,created_at DESC);
CREATE TABLE IF NOT EXISTS creator_attributions (
  user_id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  attributed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_creator_attributions_code ON creator_attributions(code,attributed_at DESC);


-- V18.20 · Push medible, horarios silenciosos y reactivación inteligente.
-- Las columnas city_activity, recommendations, reactivation_push, quiet_hours_enabled,
-- quiet_start, quiet_end y timezone de notification_preferences se añaden de forma
-- compatible al arrancar el servidor mediante ensureColumn().
CREATE TABLE IF NOT EXISTS push_delivery_log (
  id TEXT PRIMARY KEY, notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'event',
  status TEXT NOT NULL DEFAULT 'sent', sent_at INTEGER, opened_at INTEGER, created_at INTEGER NOT NULL, UNIQUE(notification_id,user_id)
);
CREATE TABLE IF NOT EXISTS deferred_pushes (
  notification_id TEXT PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  available_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS smart_push_log (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, context_key TEXT NOT NULL DEFAULT '',
  notification_id TEXT REFERENCES notifications(id) ON DELETE SET NULL, created_at INTEGER NOT NULL, UNIQUE(user_id,kind,context_key)
);

-- V18.21 · Chat y Juegos 2.0
CREATE TABLE IF NOT EXISTS game_invitations (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  from_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  responded_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_game_invites_pair ON game_invitations(match_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_invites_to ON game_invitations(to_user,status,expires_at);
CREATE TABLE IF NOT EXISTS quick_challenges (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_quick_challenges_match ON quick_challenges(match_id,created_at DESC);
CREATE TABLE IF NOT EXISTS quick_challenge_answers (
  challenge_id TEXT NOT NULL REFERENCES quick_challenges(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  choice TEXT NOT NULL,
  answered_at INTEGER NOT NULL,
  PRIMARY KEY(challenge_id,user_id)
);
CREATE TABLE IF NOT EXISTS chat_events (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  actor_user TEXT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  related_id TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_events_match ON chat_events(match_id,created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_events_related ON chat_events(type,related_id);



-- V18.21.1 · profiles.community_public INTEGER NOT NULL DEFAULT 0 (creada por ensureColumn al arrancar).


-- V18.21.2 · Novedades por email y cola de envíos.
-- notification_preferences.newsletter_email INTEGER NOT NULL DEFAULT 1 se añade por ensureColumn.
CREATE TABLE IF NOT EXISTS newsletter_campaigns (
  id TEXT PRIMARY KEY, subject TEXT NOT NULL, preheader TEXT NOT NULL DEFAULT '', eyebrow TEXT NOT NULL DEFAULT 'NOVEDADES',
  title TEXT NOT NULL, body_text TEXT NOT NULL, cta_label TEXT NOT NULL DEFAULT '', cta_url TEXT NOT NULL DEFAULT '', audience_city TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued', created_by TEXT REFERENCES users(id) ON DELETE SET NULL, created_at INTEGER NOT NULL, started_at INTEGER, completed_at INTEGER
);
CREATE TABLE IF NOT EXISTS newsletter_queue (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES newsletter_campaigns(id) ON DELETE CASCADE, user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, sent_at INTEGER
);
CREATE TABLE IF NOT EXISTS newsletter_unsubscribe_tokens (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, token TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);


-- V18.22 · Moderación avanzada, perfil completo en Admin e invitaciones de ciudad.
-- users.suspended_until INTEGER y users.suspension_reason TEXT se añaden por ensureColumn al arrancar.
CREATE TABLE IF NOT EXISTS profile_city_invites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_user TEXT REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'admin_single',
  email_requested INTEGER NOT NULL DEFAULT 0,
  email_status TEXT NOT NULL DEFAULT 'skipped',
  email_attempts INTEGER NOT NULL DEFAULT 0,
  email_error TEXT NOT NULL DEFAULT '',
  email_sent_at INTEGER,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_city_invites_user_created ON profile_city_invites(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_city_invites_email_queue ON profile_city_invites(email_status,created_at ASC);
