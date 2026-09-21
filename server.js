const express = require('express');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const Database = require('better-sqlite3');
const nodemailer = require('nodemailer');
const webpush = require('web-push');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const ENV_APP_BASE_URL = String(process.env.VR_APP_BASE_URL || '').replace(/\/$/, '');
const allowedOrigins = String(process.env.VR_ALLOWED_ORIGINS || '').split(',').map(x => x.trim().replace(/\/$/,'')).filter(Boolean);
const appBaseOrigin = (() => { try { return ENV_APP_BASE_URL ? new URL(ENV_APP_BASE_URL).origin : ''; } catch { return ''; } })();
const io = new Server(server, {
  maxHttpBufferSize: 12e6,
  cors: {
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length) return allowedOrigins.includes(origin) ? cb(null,true) : cb(new Error('ORIGIN_NOT_ALLOWED'));
      if (appBaseOrigin) return origin === appBaseOrigin ? cb(null,true) : cb(new Error('ORIGIN_NOT_ALLOWED'));
      // Compatibilidad de desarrollo: si aún no hay origen configurado se permite,
      // pero productionReadiness lo marca como bloqueo antes del lanzamiento real.
      cb(null, true);
    },
    credentials: true
  }
});

const APP_VERSION = '18.24.4';
const LEGAL_VERSION = '2026-09-20';
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
// En local guarda dentro del proyecto. En Render, define VR_STORAGE_DIR=/var/data
// y monta un Persistent Disk en /var/data para conservar SQLite y las fotos.
const STORAGE_DIR = process.env.VR_STORAGE_DIR || ROOT;
const DATA_DIR = path.join(STORAGE_DIR, 'data');
const UPLOAD_DIR = path.join(STORAGE_DIR, 'uploads');
const VERIFICATION_DIR = path.join(STORAGE_DIR, 'verification');
const DB_PATH = process.env.VR_DB_PATH || path.join(DATA_DIR, 'vrmatch.db');
const SESSION_DAYS = 30;
const VALID_MAZOS = new Set(['rompehielos', 'parejas', 'seccionXX']);
const VALID_GENDERS = new Set(['man', 'woman', 'nonbinary', 'other']);
const VALID_LOOKING = new Set(['all', 'men', 'women', 'nonbinary']);
const VALID_REPORT_REASONS = new Set(['harassment','fake','spam','sexual','underage','other']);
const EMAIL_VERIFY_HOURS = 24;
const PASSWORD_RESET_MINUTES = 45;
const REQUIRE_EMAIL_VERIFICATION = String(process.env.VR_REQUIRE_EMAIL_VERIFICATION || 'false').toLowerCase() === 'true';
const ADMIN_EMAILS = new Set(String(process.env.VR_ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
const APP_BASE_URL = ENV_APP_BASE_URL;
const LAUNCH_MODE = String(process.env.VR_LAUNCH_MODE || 'development').toLowerCase() === 'production' ? 'production' : 'development';
const CITY_LAUNCH_ENABLED = String(process.env.VR_CITY_LAUNCH_ENABLED || 'false').toLowerCase() === 'true';
const FOUNDER_REFERRALS_TARGET = Math.max(1,Math.min(50,Number(process.env.VR_FOUNDER_REFERRALS || 3) || 3));
const COMMUNITY_DEFAULT_TARGET = Math.max(25,Math.min(100000,Number(process.env.VR_CITY_COMMUNITY_TARGET || 500) || 500));
const LAUNCH_ACTIVATION_DAYS = Math.max(1,Math.min(30,Number(process.env.VR_LAUNCH_ACTIVATION_DAYS)||7));
const LAUNCH_RESEND_COOLDOWN_MS = 15 * 60 * 1000;
const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || '').trim();
const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
const STRIPE_PRICE_PLUS_MONTHLY = String(process.env.STRIPE_PRICE_PLUS_MONTHLY || '').trim();
const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const STRIPE_PREPARED = Boolean(STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET && STRIPE_PRICE_PLUS_MONTHLY);
const STRIPE_MODE = STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'live' : (STRIPE_SECRET_KEY.startsWith('sk_test_') ? 'test' : (STRIPE_SECRET_KEY ? 'configured' : 'off'));
// Los secretos de pago viven en Environment. El panel admin solo cambia el modo comercial persistido en SQLite.
// Las funciones V/R+ actuales forman parte de la experiencia disponible para todos.
const SMTP_CONFIGURED = Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM);
const MATCH_EMAIL_ENABLED = String(process.env.VR_MATCH_EMAIL_ENABLED || 'true').toLowerCase() !== 'false';
const RETENTION_EMAIL_ENABLED = String(process.env.VR_RETENTION_EMAIL_ENABLED || 'true').toLowerCase() !== 'false';
const RETENTION_SWEEP_MINUTES = Math.max(10, Math.min(360, Number(process.env.VR_RETENTION_SWEEP_MINUTES) || 30));
const RETENTION_PROFILE_HOURS = Math.max(6, Math.min(168, Number(process.env.VR_RETENTION_PROFILE_HOURS) || 24));
const RETENTION_MATCH_HOURS = Math.max(6, Math.min(168, Number(process.env.VR_RETENTION_MATCH_HOURS) || 18));
const RETENTION_MESSAGE_COOLDOWN_HOURS = Math.max(1, Math.min(72, Number(process.env.VR_RETENTION_MESSAGE_COOLDOWN_HOURS) || 6));
const NEWSLETTER_BATCH_SIZE = Math.max(5, Math.min(100, Number(process.env.VR_NEWSLETTER_BATCH_SIZE) || 20));
const NEWSLETTER_INTERVAL_SECONDS = Math.max(20, Math.min(600, Number(process.env.VR_NEWSLETTER_INTERVAL_SECONDS) || 60));
const CITY_INVITE_BATCH_SIZE = Math.max(5, Math.min(50, Number(process.env.VR_CITY_INVITE_BATCH_SIZE) || 15));
const CITY_INVITE_COOLDOWN_DAYS = Math.max(1, Math.min(60, Number(process.env.VR_CITY_INVITE_COOLDOWN_DAYS) || 7));
const BETA_DEFAULT_CITY = String(process.env.VR_BETA_CITY || 'Valencia').trim().slice(0,80) || 'Valencia';
const BETA_BULK_LIMIT = Math.max(10, Math.min(250, Number(process.env.VR_BETA_BULK_LIMIT) || 100));
const SMART_PUSH_ENABLED = String(process.env.VR_SMART_PUSH_ENABLED || 'true').toLowerCase() !== 'false';
const SMART_PUSH_SWEEP_MINUTES = Math.max(10, Math.min(360, Number(process.env.VR_SMART_PUSH_SWEEP_MINUTES) || 30));
const PUSH_DAILY_CAP = Math.max(2, Math.min(30, Number(process.env.VR_PUSH_DAILY_CAP) || 8));
const PUSH_SMART_DAILY_CAP = Math.max(1, Math.min(6, Number(process.env.VR_PUSH_SMART_DAILY_CAP) || 2));
const SYSTEM_ERROR_RETENTION_DAYS = Math.max(7, Math.min(180, Number(process.env.VR_SYSTEM_ERROR_RETENTION_DAYS) || 30));
const HEALTH_MEMORY_WARN_MB = Math.max(128, Math.min(4096, Number(process.env.VR_HEALTH_MEMORY_WARN_MB) || 768));
const VAPID_PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || 'mailto:admin@vrmatch.local').trim();
let PUSH_CONFIGURED = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (PUSH_CONFIGURED) {
  try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY); }
  catch (e) { PUSH_CONFIGURED = false; console.warn('Web Push desactivado:', e.message); }
}
const mailTransport = SMTP_CONFIGURED ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || Number(process.env.SMTP_PORT) === 465,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined
}) : null;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(VERIFICATION_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  gender TEXT NOT NULL DEFAULT 'other',
  city TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  interests_json TEXT NOT NULL DEFAULT '[]',
  avatar TEXT NOT NULL DEFAULT '',
  photos_json TEXT NOT NULL DEFAULT '[]',
  age_min INTEGER NOT NULL DEFAULT 18,
  age_max INTEGER NOT NULL DEFAULT 99,
  looking_for TEXT NOT NULL DEFAULT 'all',
  city_pref TEXT NOT NULL DEFAULT '',
  interest_pref TEXT NOT NULL DEFAULT '',
  radius_km INTEGER NOT NULL DEFAULT 50,
  location_lat REAL,
  location_lng REAL,
  location_updated_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS likes (
  from_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_user, to_user)
);
CREATE TABLE IF NOT EXISTS passes (
  from_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_user, to_user)
);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  user1 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (user1, user2)
);
CREATE INDEX IF NOT EXISTS idx_matches_u1 ON matches(user1, active);
CREATE INDEX IF NOT EXISTS idx_matches_u2 ON matches(user2, active);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  from_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id, created_at);
CREATE TABLE IF NOT EXISTS blocks (
  blocker TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker, blocked)
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);
` );

function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
// Migraciones compatibles con bases creadas por versiones anteriores.
ensureColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('users', 'email_verified_at', 'INTEGER');
ensureColumn('users', 'suspended_until', 'INTEGER');
ensureColumn('users', 'suspension_reason', "TEXT NOT NULL DEFAULT ''");
ensureColumn('profiles', 'discoverable', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('profiles', 'show_online', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('profiles', 'allow_game_invites', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('profiles', 'radius_km', 'INTEGER NOT NULL DEFAULT 50');
ensureColumn('profiles', 'location_lat', 'REAL');
ensureColumn('profiles', 'location_lng', 'REAL');
ensureColumn('profiles', 'location_updated_at', 'INTEGER');
ensureColumn('profiles', 'profile_verified', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('profiles', 'profile_verified_at', 'INTEGER');
ensureColumn('profiles', 'community_public', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('reports', 'updated_at', 'INTEGER');
ensureColumn('reports', 'moderator_note', "TEXT NOT NULL DEFAULT ''");
ensureColumn('reports', 'match_id', 'TEXT');
ensureColumn('reports', 'evidence_json', "TEXT NOT NULL DEFAULT '[]'");
ensureColumn('users', 'onboarding_completed', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('sessions', 'session_id', 'TEXT');
ensureColumn('sessions', 'last_seen_at', 'INTEGER');
// Cada sesión recibe un identificador opaco para poder gestionarla sin exponer tokens.
for (const row of db.prepare('SELECT token_hash,session_id,created_at,last_seen_at FROM sessions').all()) {
  if (!row.session_id) db.prepare('UPDATE sessions SET session_id=? WHERE token_hash=?').run(safeId('ses'), row.token_hash);
  if (!row.last_seen_at) db.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?').run(row.created_at || now(), row.token_hash);
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id)');

db.exec(`
CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, kind);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expiry ON auth_tokens(expires_at);
CREATE TABLE IF NOT EXISTS moderation_actions (
  id TEXT PRIMARY KEY,
  report_id TEXT REFERENCES reports(id) ON DELETE SET NULL,
  admin_user TEXT NOT NULL,
  target_user TEXT,
  action TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plus_memberships (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'inactive',
  plan TEXT NOT NULL DEFAULT 'plus',
  source TEXT NOT NULL DEFAULT 'admin',
  started_at INTEGER,
  expires_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plus_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  verified_only INTEGER NOT NULL DEFAULT 0,
  min_shared_interests INTEGER NOT NULL DEFAULT 0,
  sort_mode TEXT NOT NULL DEFAULT 'smart',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plus_boosts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active_until INTEGER,
  last_used_at INTEGER
);
CREATE TABLE IF NOT EXISTS billing_customers (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'stripe',
  customer_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  subscription_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'stripe',
  status TEXT NOT NULL DEFAULT 'inactive',
  price_id TEXT NOT NULL DEFAULT '',
  current_period_end INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user ON billing_subscriptions(user_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS billing_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  new_match INTEGER NOT NULL DEFAULT 1,
  new_message INTEGER NOT NULL DEFAULT 1,
  game_invite INTEGER NOT NULL DEFAULT 1,
  game_turn INTEGER NOT NULL DEFAULT 1,
  retention_email INTEGER NOT NULL DEFAULT 1,
  city_activity INTEGER NOT NULL DEFAULT 1,
  recommendations INTEGER NOT NULL DEFAULT 1,
  reactivation_push INTEGER NOT NULL DEFAULT 1,
  quiet_hours_enabled INTEGER NOT NULL DEFAULT 1,
  quiet_start TEXT NOT NULL DEFAULT '23:00',
  quiet_end TEXT NOT NULL DEFAULT '08:00',
  timezone TEXT NOT NULL DEFAULT 'Europe/Madrid',
  push_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS newsletter_campaigns (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  preheader TEXT NOT NULL DEFAULT '',
  eyebrow TEXT NOT NULL DEFAULT 'NOVEDADES',
  title TEXT NOT NULL,
  body_text TEXT NOT NULL,
  cta_label TEXT NOT NULL DEFAULT '',
  cta_url TEXT NOT NULL DEFAULT '',
  audience_city TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_newsletter_campaign_status ON newsletter_campaigns(status,created_at DESC);
CREATE TABLE IF NOT EXISTS newsletter_queue (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_newsletter_queue_status ON newsletter_queue(status,created_at ASC);
CREATE INDEX IF NOT EXISTS idx_newsletter_queue_campaign ON newsletter_queue(campaign_id,status);
CREATE TABLE IF NOT EXISTS newsletter_unsubscribe_tokens (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- V18.22 · invitaciones administrativas para completar la ciudad.
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

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_user TEXT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS legal_acceptances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  legal_version TEXT NOT NULL,
  adult_confirmed INTEGER NOT NULL DEFAULT 1,
  terms_accepted INTEGER NOT NULL DEFAULT 1,
  accepted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user ON legal_acceptances(user_id, accepted_at DESC);
CREATE TABLE IF NOT EXISTS beta_memberships (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  city TEXT NOT NULL DEFAULT 'Valencia',
  wave INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'admin',
  joined_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ended_at INTEGER,
  admin_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_beta_memberships_status_city ON beta_memberships(status,city,joined_at DESC);
CREATE TABLE IF NOT EXISTS beta_activity_days (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  opens INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(user_id,day)
);
CREATE INDEX IF NOT EXISTS idx_beta_activity_last_seen ON beta_activity_days(last_seen_at DESC);
CREATE TABLE IF NOT EXISTS beta_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  page TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  admin_note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_status_created ON beta_feedback(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_user_created ON beta_feedback(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  page TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  admin_note TEXT NOT NULL DEFAULT '',
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_feedback_status_created ON feedback(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS client_errors (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  line INTEGER,
  column_no INTEGER,
  page TEXT NOT NULL DEFAULT '',
  app_version TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_client_errors_created ON client_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_user ON client_errors(user_id, created_at DESC);
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
CREATE INDEX IF NOT EXISTS idx_server_errors_fingerprint ON server_errors(fingerprint, created_at DESC);
CREATE TABLE IF NOT EXISTS growth_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  session_id TEXT NOT NULL DEFAULT '',
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'direct',
  medium TEXT NOT NULL DEFAULT 'none',
  campaign TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  term TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  landing_path TEXT NOT NULL DEFAULT '',
  page TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_growth_events_name_created ON growth_events(event_name,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_events_session_created ON growth_events(session_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_events_user_created ON growth_events(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_events_source_created ON growth_events(source,created_at DESC);
CREATE TABLE IF NOT EXISTS growth_acquisition (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'direct',
  medium TEXT NOT NULL DEFAULT 'none',
  campaign TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  term TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  landing_path TEXT NOT NULL DEFAULT '',
  attributed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_growth_acquisition_source ON growth_acquisition(source,attributed_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_acquisition_campaign ON growth_acquisition(campaign,attributed_at DESC);
CREATE TABLE IF NOT EXISTS retention_email_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  context_key TEXT NOT NULL DEFAULT '',
  sent_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent'
);
CREATE INDEX IF NOT EXISTS idx_retention_email_user_kind ON retention_email_log(user_id,kind,sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_retention_email_context ON retention_email_log(kind,context_key,sent_at DESC);
CREATE TABLE IF NOT EXISTS game_sessions (
  id TEXT PRIMARY KEY,
  match_id TEXT REFERENCES matches(id) ON DELETE SET NULL,
  user1 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  core_completed_at INTEGER,
  ended_at INTEGER,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  finish_reason TEXT NOT NULL DEFAULT '',
  total_turns INTEGER NOT NULL DEFAULT 0,
  sync_rounds INTEGER NOT NULL DEFAULT 0,
  coincidences INTEGER NOT NULL DEFAULT 0,
  guess_hits INTEGER NOT NULL DEFAULT 0,
  reactions INTEGER NOT NULL DEFAULT 0,
  personalized_sync INTEGER NOT NULL DEFAULT 0,
  extended INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_game_sessions_pair_started ON game_sessions(user1,user2,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_sessions_user1_started ON game_sessions(user1,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_sessions_user2_started ON game_sessions(user2,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_sessions_match_started ON game_sessions(match_id,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_sessions_status_started ON game_sessions(status,started_at DESC);
`);
ensureColumn('notification_preferences', 'retention_email', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('notification_preferences', 'newsletter_email', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('notification_preferences', 'city_activity', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('notification_preferences', 'recommendations', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('notification_preferences', 'reactivation_push', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('notification_preferences', 'quiet_hours_enabled', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('notification_preferences', 'quiet_start', "TEXT NOT NULL DEFAULT '23:00'");
ensureColumn('notification_preferences', 'quiet_end', "TEXT NOT NULL DEFAULT '08:00'");
ensureColumn('notification_preferences', 'timezone', "TEXT NOT NULL DEFAULT 'Europe/Madrid'");

db.exec(`
-- V18.20 · Push medible, horarios silenciosos y reactivación inteligente.
CREATE TABLE IF NOT EXISTS push_delivery_log (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'event',
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at INTEGER,
  opened_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(notification_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_push_delivery_user_sent ON push_delivery_log(user_id,sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_delivery_kind_sent ON push_delivery_log(kind,sent_at DESC);
CREATE TABLE IF NOT EXISTS deferred_pushes (
  notification_id TEXT PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  available_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deferred_push_available ON deferred_pushes(available_at,expires_at);
CREATE TABLE IF NOT EXISTS smart_push_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  context_key TEXT NOT NULL DEFAULT '',
  notification_id TEXT REFERENCES notifications(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id,kind,context_key)
);
CREATE INDEX IF NOT EXISTS idx_smart_push_user_kind ON smart_push_log(user_id,kind,created_at DESC);

CREATE TABLE IF NOT EXISTS profile_verification_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proof_filename TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_profile_verification_user ON profile_verification_requests(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_verification_status ON profile_verification_requests(status,created_at ASC);
CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  severity INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_kind ON security_events(kind,created_at DESC);
`);

// V18.21 · Chat y Juegos 2.0: invitaciones persistentes, timeline enriquecido y retos A/B.
db.exec(`
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
`);


db.exec(`
CREATE TABLE IF NOT EXISTS launch_cities (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target_users INTEGER NOT NULL DEFAULT 500,
  default_target_users INTEGER NOT NULL DEFAULT 500,
  status TEXT NOT NULL DEFAULT 'WAITING',
  activated_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS launch_waitlist_users (
  id TEXT PRIMARY KEY,
  alias TEXT NOT NULL,
  age INTEGER NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  city_slug TEXT NOT NULL REFERENCES launch_cities(slug),
  public_profile INTEGER NOT NULL DEFAULT 0,
  launch_consent INTEGER NOT NULL DEFAULT 1,
  referral_code TEXT NOT NULL UNIQUE,
  referred_by TEXT,
  status TEXT NOT NULL DEFAULT 'WAITLIST',
  app_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  activation_sent_at INTEGER,
  activated_at INTEGER,
  founder_qualified_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_launch_waitlist_city ON launch_waitlist_users(city_slug,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_launch_waitlist_referrer ON launch_waitlist_users(referred_by);
CREATE TABLE IF NOT EXISTS launch_referral_events (
  id TEXT PRIMARY KEY,
  referral_code TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_launch_referral_code ON launch_referral_events(referral_code,created_at DESC);

CREATE TABLE IF NOT EXISTS user_referrals (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_referrals_code ON user_referrals(referral_code);
CREATE TABLE IF NOT EXISTS user_referral_attributions (
  invitee_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  referrer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  referral_code TEXT NOT NULL,
  attributed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_referral_attr_referrer ON user_referral_attributions(referrer_user_id,attributed_at DESC);
CREATE TABLE IF NOT EXISTS user_referral_events (
  id TEXT PRIMARY KEY,
  referral_code TEXT NOT NULL,
  event_type TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_referral_events_code ON user_referral_events(referral_code,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_referral_events_type ON user_referral_events(event_type,created_at DESC);

-- V18.19 · Recompensas de referidos y atribución de creadores.
CREATE TABLE IF NOT EXISTS referral_rewards (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS creator_events (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL REFERENCES creator_codes(code) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_creator_events_code ON creator_events(code,event_type,created_at DESC);
CREATE TABLE IF NOT EXISTS creator_attributions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL REFERENCES creator_codes(code),
  attributed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_creator_attributions_code ON creator_attributions(code,attributed_at DESC);

CREATE TABLE IF NOT EXISTS community_cities (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target_users INTEGER NOT NULL DEFAULT 500,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS community_city_memberships (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  city_slug TEXT NOT NULL REFERENCES community_cities(slug),
  joined_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_community_membership_city ON community_city_memberships(city_slug,joined_at DESC);

CREATE TABLE IF NOT EXISTS launch_activation_tokens (
  token_hash TEXT PRIMARY KEY,
  waitlist_user_id TEXT NOT NULL REFERENCES launch_waitlist_users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_launch_activation_user ON launch_activation_tokens(waitlist_user_id,expires_at DESC);
CREATE TABLE IF NOT EXISTS launch_mail_queue (
  id TEXT PRIMARY KEY,
  waitlist_user_id TEXT REFERENCES launch_waitlist_users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  template TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  sent_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_launch_mail_status ON launch_mail_queue(status,created_at ASC);
`);

const launchSeedCities = [
  ['valencia','Valencia',500],
  ['madrid','Madrid',1000],
  ['barcelona','Barcelona',750],
  ['alicante','Alicante',400],
  ['castellon','Castellón',250]
];

// V18.6.2: las ciudades pueden crearse desde Admin y cada una conserva
// un objetivo base independiente del objetivo temporal usado para pruebas.
const launchCityColsBeforeDefaultGoalMigration = db.prepare('PRAGMA table_info(launch_cities)').all();
const launchDefaultGoalNeedsMigration = !launchCityColsBeforeDefaultGoalMigration.some(c => c.name === 'default_target_users');
ensureColumn('launch_cities', 'default_target_users', 'INTEGER NOT NULL DEFAULT 500');
ensureColumn('launch_waitlist_users', 'founder_qualified_at', 'INTEGER');

for (const [slug,name,target] of launchSeedCities) {
  db.prepare(`INSERT OR IGNORE INTO launch_cities(slug,name,target_users,default_target_users,status,created_at,updated_at)
    VALUES(?,?,?,?,'WAITING',?,?)`).run(slug,name,target,target,now(),now());
  db.prepare(`INSERT OR IGNORE INTO community_cities(slug,name,target_users,created_at,updated_at)
    VALUES(?,?,?,?,?)`).run(slug,name,target,now(),now());
}
// Solo en la primera migración desde 18.6.1 se corrigen los objetivos base
// de las ciudades incluidas originalmente.
if (launchDefaultGoalNeedsMigration) {
  for (const [slug,,target] of launchSeedCities) {
    db.prepare('UPDATE launch_cities SET default_target_users=? WHERE slug=?').run(target,slug);
  }
}

// V18.7: conserva el hito de referidos para quienes ya habían alcanzado
// el umbral antes de esta versión.
db.prepare(`UPDATE launch_waitlist_users
  SET founder_qualified_at=COALESCE(founder_qualified_at,updated_at)
  WHERE (SELECT COUNT(*) FROM launch_waitlist_users x
         WHERE x.referred_by=launch_waitlist_users.referral_code) >= ?`)
  .run(FOUNDER_REFERRALS_TARGET);

// Compatibilidad de datos: migra comentarios de instalaciones anteriores sin conservar el nombre histórico en la interfaz ni en el esquema nuevo.
const legacyFeedbackTable = ['be','ta_feedback'].join('');
const legacyFeedbackExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(legacyFeedbackTable);
if (legacyFeedbackExists) {
  db.exec(`INSERT OR IGNORE INTO feedback(id,user_id,kind,message,page,created_at,status,admin_note,updated_at)
    SELECT id,user_id,kind,message,page,created_at,status,admin_note,updated_at FROM "${legacyFeedbackTable}"`);
}

// Cierra sesiones de juego que quedaron abiertas por un reinicio o despliegue.
// El historial conserva solo métricas agregadas; nunca respuestas, cartas, fotos ni vídeos.
db.exec(`UPDATE game_sessions
  SET status=CASE WHEN core_completed_at IS NOT NULL THEN 'completed' ELSE 'interrupted' END,
      finish_reason=CASE WHEN finish_reason='' THEN 'server_restart' ELSE finish_reason END,
      ended_at=COALESCE(ended_at,updated_at),
      duration_seconds=MAX(0,CAST((COALESCE(ended_at,updated_at)-started_at)/1000 AS INTEGER))
  WHERE status='active'`);

function appSetting(key) {
  return db.prepare('SELECT value FROM app_settings WHERE key=?').get(String(key || ''))?.value ?? null;
}
function setAppSetting(key, value, adminUserId = null) {
  db.prepare(`INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .run(String(key), String(value), now(), adminUserId || null);
}

// V18.16 · Observabilidad del servidor. Nunca persiste bodies, contraseñas, tokens ni contenido de chat.
const nativeConsoleError = console.error.bind(console);
let serverErrorCaptureBusy = false;
function redactDiagnosticText(value, maxLen=4000) {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi,'Bearer [REDACTED]')
    .replace(/(password|pass|token|secret|authorization|cookie)(["'\s:=]+)([^\s,;}{]{3,})/gi,'$1$2[REDACTED]')
    .replace(/([A-Z0-9._%+-]{1,2})[A-Z0-9._%+-]*(@[A-Z0-9.-]+\.[A-Z]{2,})/gi,'$1***$2')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g,'[REDACTED_NUMBER]')
    .slice(0,maxLen);
}
function errorFromArgs(args=[]) {
  const first=args.find(x=>x instanceof Error);
  if(first)return first;
  const text=args.map(x=>{
    if(typeof x==='string')return x;
    try{return JSON.stringify(x);}catch{return String(x);}
  }).join(' ');
  return new Error(text || 'Error de servidor');
}
function recordServerError(context, error, meta={}) {
  try {
    const err=error instanceof Error?error:new Error(String(error||'Error de servidor'));
    const message=redactDiagnosticText(err.message||String(error||'Error de servidor'),1000);
    const stack=redactDiagnosticText(err.stack||'',5000);
    const fingerprint=crypto.createHash('sha256').update(`${String(context||'server')}|${message}|${String(meta.path||'')}`).digest('hex').slice(0,20);
    db.prepare(`INSERT INTO server_errors(id,fingerprint,context,message,stack,method,path,request_id,user_id,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
        safeId('serr'),fingerprint,cleanShortText(context||'server',100),message,stack,
        cleanShortText(meta.method||'',12),cleanShortText(meta.path||'',240),cleanShortText(meta.requestId||'',80),meta.userId||null,now()
      );
  } catch (captureError) {
    nativeConsoleError('No se pudo registrar error de servidor:', captureError?.message || captureError);
  }
}
console.error=(...args)=>{
  nativeConsoleError(...args);
  if(serverErrorCaptureBusy)return;
  serverErrorCaptureBusy=true;
  try{recordServerError('console.error',errorFromArgs(args));}finally{serverErrorCaptureBusy=false;}
};
process.on('uncaughtExceptionMonitor',(err,origin)=>recordServerError(`uncaught:${origin||'unknown'}`,err));
function monetizationMode() {
  // V18: la monetización pública está desactivada. Las funciones actuales no se paywallean.
  return 'launch_free';
}
function freePremiumDuringLaunch() { return true; }
function billingSwitchEnabled() { return false; }
function billingInfrastructureReady({ requireLive = false } = {}) {
  if (!STRIPE_PREPARED || !APP_BASE_URL) return false;
  if (requireLive && STRIPE_MODE !== 'live') return false;
  if (STRIPE_MODE === 'live' && LAUNCH_MODE !== 'production') return false;
  return true;
}
function billingConfigured() {
  return Boolean(billingSwitchEnabled() && billingInfrastructureReady({requireLive:true}));
}
function activePaidSubscriptionsCount() {
  return Number(db.prepare("SELECT COUNT(*) AS n FROM billing_subscriptions WHERE status IN ('active','trialing','past_due')").get()?.n || 0);
}
function monetizationAdminState() {
  const mode = monetizationMode();
  const readiness = productionReadiness();
  return {
    mode,
    freePremiumDuringLaunch: mode === 'launch_free',
    paidPremiumActive: mode === 'paid' && billingConfigured(),
    provider: 'stripe',
    providerPrepared: STRIPE_PREPARED,
    providerMode: STRIPE_MODE,
    billingConfigured: billingConfigured(),
    productionMode: LAUNCH_MODE === 'production',
    appBaseUrlConfigured: Boolean(APP_BASE_URL),
    activationReady: Boolean(readiness.coreReady && readiness.productionMode && billingInfrastructureReady({requireLive:true})),
    activePaidSubscriptions: activePaidSubscriptionsCount(),
    canReturnToFree: activePaidSubscriptionsCount() === 0,
    updatedAt: Number(appSetting('premium_mode_updated_at') || 0) || null
  };
}
function broadcastPlusStateAll() {
  for (const row of db.prepare('SELECT id FROM users').all()) emitToUser(row.id, 'plus_state', getPlusState(row.id));
  broadcastDiscovery();
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req,res,next) => {
  const incoming=String(req.headers['x-request-id']||'').trim();
  req.requestId=/^[A-Za-z0-9._:-]{8,80}$/.test(incoming)?incoming:crypto.randomBytes(10).toString('hex');
  res.setHeader('X-Request-Id',req.requestId);
  next();
});
app.use((req,res,next) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy','camera=(self), microphone=(self), geolocation=(self), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' https: wss:; worker-src 'self'; manifest-src 'self'; font-src 'self' data:");
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control','no-store');
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) res.setHeader('Strict-Transport-Security','max-age=15552000; includeSubDomains');
  next();
});
app.post('/api/billing/webhook', express.raw({type:'application/json',limit:'1mb'}), async (req,res) => {
  if(!STRIPE_PREPARED)return res.status(503).send('billing_not_configured');
  if(!stripeWebhookSignatureValid(req.body,req.headers['stripe-signature']))return res.status(400).send('invalid_signature');
  let event; try{event=JSON.parse(req.body.toString('utf8'));}catch{return res.status(400).send('invalid_json');}
  if(!event?.id || !event?.type)return res.status(400).send('invalid_event');
  if(db.prepare('SELECT 1 FROM billing_events WHERE event_id=?').get(String(event.id)))return res.status(200).json({received:true,duplicate:true});
  try{
    await handleStripeEvent(event);
    db.prepare('INSERT OR IGNORE INTO billing_events(event_id,event_type,received_at) VALUES(?,?,?)').run(String(event.id),String(event.type),now());
    res.status(200).json({received:true});
  }catch(e){console.error('Stripe webhook error:',cleanShortText(e.message,220));res.status(500).json({received:false});}
});

app.use(express.json({ limit: '9mb' }));

const waitingPlayers = new Map();
const rooms = new Map();
const pendingGameInvites = new Map(); // `from:to` -> { from, to, mazo, expiresAt }
const GAME_INVITE_TTL_MS = 24 * 60 * 60 * 1000;
const onlineUsers = new Map(); // userId -> Set(socket.id)

const GAME_TARGET_TURNS = 8;
const SYNC_ROUND_TTL_MS = 95 * 1000;
const GAME_RECONNECT_GRACE_MS = Math.max(15000,Math.min(120000,(Number(process.env.VR_GAME_RECONNECT_GRACE_SECONDS)||45)*1000));
const VALID_SYNC_MODES = new Set(['choice','guess','secret']);
const CHAT_QUICK_CHALLENGES = [
  {prompt:'Primera cita improvisada: ¿qué eliges?',a:'Algo tranquilo',b:'Una aventura'},
  {prompt:'¿Qué te gana antes?',a:'Que me hagan reír',b:'Una conversación profunda'},
  {prompt:'Plan de domingo ideal',a:'Sofá y peli',b:'Salir sin plan'},
  {prompt:'Para conocernos mejor',a:'Preguntas directas',b:'Ir descubriendo poco a poco'},
  {prompt:'Si viajamos mañana',a:'Mar',b:'Montaña'},
  {prompt:'¿Qué pesa más en un match?',a:'La química',b:'Tener cosas en común'},
  {prompt:'Una noche libre',a:'Cena larga',b:'Concierto o fiesta'},
  {prompt:'Cuando te gusta alguien',a:'Lo demuestro',b:'Voy con calma'},
  {prompt:'Para romper el hielo',a:'Pregunta atrevida',b:'Reto divertido'},
  {prompt:'¿Qué prefieres recibir?',a:'Un audio espontáneo',b:'Un mensaje bien pensado'},
  {prompt:'Cita sorpresa',a:'Que me la preparen',b:'Prepararla juntos'},
  {prompt:'¿Qué recuerdas más de alguien?',a:'Cómo me hizo sentir',b:'Lo que hablamos'}
];
const SYNC_GAME_CARDS = {
  rompehielos: {
    choice: [
      { prompt:'Para romper el hielo ahora mismo, ¿qué plan elegirías?', a:'Café tranquilo', b:'Plan improvisado' },
      { prompt:'¿Qué te representa más un viernes por la noche?', a:'Salir y descubrir algo', b:'Plan cómodo y conversación' },
      { prompt:'Si mañana pudieras escapar unas horas, ¿qué escogerías?', a:'Mar', b:'Montaña' },
      { prompt:'¿Cómo prefieres conocer de verdad a alguien?', a:'Hablando sin prisa', b:'Haciendo algo juntos' },
      { prompt:'Cuando conoces a alguien nuevo, ¿qué te sale más natural?', a:'Hacer muchas preguntas', b:'Contar historias y anécdotas' },
      { prompt:'¿Qué hace mejor un plan sencillo?', a:'Una conversación inesperada', b:'Reírse sin parar' }
    ],
    guess: [
      { prompt:'Para una primera cita, ¿qué elegirías?', a:'Algo sencillo', b:'Algo inesperado' },
      { prompt:'¿Qué preferirías?', a:'Viaje planificado', b:'Aventura improvisada' },
      { prompt:'¿Qué detalle te gusta más recibir?', a:'Mensaje de buenos días', b:'Mensaje de buenas noches' },
      { prompt:'Si tuvieras que elegir ahora, ¿qué escogerías?', a:'Cena larga', b:'Paseo sin rumbo' },
      { prompt:'Para desconectar, ¿qué elegirías?', a:'Música y charla', b:'Salir a explorar' },
      { prompt:'Si te regalaran una tarde libre, ¿qué escogerías?', a:'Improvisar algo', b:'Planear su plan favorito' }
    ],
    secret: [
      { prompt:'Sin ver la respuesta del otro: ¿qué te gustaría seguir descubriendo de esta persona?' },
      { prompt:'Escribe una cosa que te haya sorprendido positivamente durante la partida.' },
      { prompt:'¿Qué tema te gustaría continuar hablando cuando termine el juego?' },
      { prompt:'Escribe una pregunta que te gustaría hacerle después, fuera del juego.' },
      { prompt:'¿Qué detalle de vuestra conversación te ha dado curiosidad por conocer mejor?' }
    ]
  },
  parejas: {
    choice: [
      { prompt:'¿Qué plan os pega más para desconectar juntos?', a:'Escapada de fin de semana', b:'Cena larga sin reloj' },
      { prompt:'¿Qué gesto pesa más para ti?', a:'Una sorpresa', b:'Un detalle cotidiano' },
      { prompt:'¿Qué crea más conexión?', a:'Reírse mucho', b:'Hablar de verdad' },
      { prompt:'¿Qué preferirías compartir?', a:'Un viaje nuevo', b:'Un lugar favorito' },
      { prompt:'¿Qué os acercaría más en un día normal?', a:'Cocinar o hacer algo juntos', b:'Salir sin un plan cerrado' },
      { prompt:'¿Qué valoras más cuando hay confianza?', a:'Poder hablar de todo', b:'Sentirte cómodo/a en silencio' }
    ],
    guess: [
      { prompt:'Para una cita, ¿qué elegirías?', a:'Plan romántico', b:'Plan divertido' },
      { prompt:'¿Qué valorarías más?', a:'Espontaneidad', b:'Atención a los detalles' },
      { prompt:'¿Qué preferirías?', a:'Hablar hasta tarde', b:'Hacer planes juntos' },
      { prompt:'¿Qué opción te representa más?', a:'Sorpresa', b:'Plan bien pensado' },
      { prompt:'Para celebrar algo, ¿qué elegirías?', a:'Un detalle íntimo', b:'Un plan memorable' },
      { prompt:'¿Qué te haría más ilusión?', a:'Una nota inesperada', b:'Una experiencia juntos' }
    ],
    secret: [
      { prompt:'¿Qué pequeño gesto te gustaría repetir más con esta persona?' },
      { prompt:'¿Qué crees que hace especial vuestra forma de conectar?' },
      { prompt:'¿Qué conversación te gustaría tener después de esta partida?' },
      { prompt:'Escribe un plan sencillo que te gustaría compartir con esta persona algún día.' },
      { prompt:'¿Qué cualidad de la otra persona te gustaría seguir descubriendo con calma?' }
    ]
  },
  seccionXX: {
    choice: [
      { prompt:'¿Qué crea más tensión divertida para ti?', a:'Una mirada', b:'Una conversación' },
      { prompt:'¿Qué te parece más atractivo?', a:'Seguridad', b:'Sentido del humor' },
      { prompt:'¿Qué ambiente elegirías para una cita especial?', a:'Elegante y tranquilo', b:'Espontáneo y atrevido' },
      { prompt:'¿Qué prefieres cuando hay química?', a:'Ir poco a poco', b:'Dejarse llevar' },
      { prompt:'¿Qué te gana antes?', a:'Una conversación con intención', b:'Una energía espontánea' },
      { prompt:'¿Qué tipo de cita te parece más atractiva?', a:'Ambiente íntimo', b:'Algo con sorpresa' }
    ],
    guess: [
      { prompt:'Si hubiera química, ¿qué elegirías?', a:'Coqueteo sutil', b:'Coqueteo directo' },
      { prompt:'¿Qué te atraería más?', a:'Una mirada intensa', b:'Una conversación con química' },
      { prompt:'¿Qué opción te representa más?', a:'Misterio', b:'Espontaneidad' },
      { prompt:'¿Qué preferirías?', a:'Cita íntima', b:'Plan con aventura' },
      { prompt:'¿Qué te resulta más seductor?', a:'Humor y confianza', b:'Misterio y tensión' },
      { prompt:'Si pudieras elegir el ambiente, ¿qué escogerías?', a:'Luz baja y charla', b:'Plan espontáneo fuera de casa' }
    ],
    secret: [
      { prompt:'¿Qué detalle hace que notes que existe química con alguien?' },
      { prompt:'¿Qué te gustaría que la otra persona entendiera sobre tu forma de coquetear?' },
      { prompt:'¿Qué hace que una conversación pase de interesante a especial para ti?' },
      { prompt:'Escribe una señal sutil que para ti indique que hay química real.' },
      { prompt:'¿Qué te gustaría que la otra persona entendiera sobre lo que te hace sentir cómodo/a al coquetear?' }
    ]
  }
};

function now() { return Date.now(); }
function safeId(prefix) { return `${prefix}_${crypto.randomBytes(12).toString('hex')}`; }
function clampInt(value,min,max,fallback=0){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.trunc(n))):fallback;}
function fileSizeSafe(filePath){try{return fs.statSync(filePath).size||0;}catch{return 0;}}
function folderStatsSafe(dirPath){
  let files=0,bytes=0;
  try {
    for(const entry of fs.readdirSync(dirPath,{withFileTypes:true})){
      const full=path.join(dirPath,entry.name);
      if(entry.isFile()){files++;bytes+=fileSizeSafe(full);}
      else if(entry.isDirectory()){
        const child=folderStatsSafe(full); files+=child.files; bytes+=child.bytes;
      }
    }
  } catch {}
  return {files,bytes};
}

function referencedUploadNames(){
  const names=new Set();
  const add=value=>{
    const str=String(value||'');
    if(/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(str)) names.add(path.basename(str));
  };
  for(const row of db.prepare('SELECT avatar,photos_json FROM profiles').all()){
    add(row.avatar);
    for(const item of safeJsonArray(row.photos_json)) add(item);
  }
  return names;
}
function orphanUploadFiles(minAgeMs=60*60*1000){
  const refs=referencedUploadNames(), result=[];
  try{
    for(const entry of fs.readdirSync(UPLOAD_DIR,{withFileTypes:true})){
      if(!entry.isFile()) continue;
      const full=path.join(UPLOAD_DIR,entry.name);
      if(refs.has(entry.name)) continue;
      let st; try{st=fs.statSync(full);}catch{continue;}
      if(now()-st.mtimeMs < minAgeMs) continue;
      result.push({name:entry.name,path:full,bytes:st.size||0,mtime:st.mtimeMs});
    }
  }catch{}
  return result;
}
function quickCheckDatabase(){
  try{
    const value=db.pragma('quick_check',{simple:true});
    return String(value||'').toLowerCase()==='ok' ? {ok:true,message:'ok'} : {ok:false,message:String(value||'resultado desconocido')};
  }catch(e){return {ok:false,message:cleanShortText(e.message,180)||'No disponible'};}
}
function systemMaintenanceStatus(){
  const ts=now(), uploads=folderStatsSafe(UPLOAD_DIR), orphans=orphanUploadFiles();
  const integrity=quickCheckDatabase();
  return {
    version:APP_VERSION,
    integrity,
    uptimeSeconds:Math.round(process.uptime()),
    dbBytes:fileSizeSafe(DB_PATH),
    walBytes:fileSizeSafe(`${DB_PATH}-wal`),
    shmBytes:fileSizeSafe(`${DB_PATH}-shm`),
    uploadFiles:uploads.files,
    uploadBytes:uploads.bytes,
    orphanUploadFiles:orphans.length,
    orphanUploadBytes:orphans.reduce((a,x)=>a+(x.bytes||0),0),
    activeSessions:db.prepare('SELECT COUNT(*) n FROM sessions WHERE expires_at>?').get(ts).n,
    expiredSessions:db.prepare('SELECT COUNT(*) n FROM sessions WHERE expires_at<=?').get(ts).n,
    staleAuthTokens:db.prepare('SELECT COUNT(*) n FROM auth_tokens WHERE expires_at<=? OR used_at IS NOT NULL').get(ts).n,
    oldClientErrors:db.prepare('SELECT COUNT(*) n FROM client_errors WHERE created_at<?').get(ts-30*86400000).n,
    oldServerErrors:db.prepare('SELECT COUNT(*) n FROM server_errors WHERE created_at<?').get(ts-SYSTEM_ERROR_RETENTION_DAYS*86400000).n,
    serverErrors24h:db.prepare('SELECT COUNT(*) n FROM server_errors WHERE created_at>=?').get(ts-24*60*60*1000).n,
    diagnostics:systemDiagnostics(),
    oldReadNotifications:db.prepare('SELECT COUNT(*) n FROM notifications WHERE read_at IS NOT NULL AND created_at<?').get(ts-90*86400000).n,
    backupIncludes:['SQLite','uploads','manifest'],
    storagePersistent:path.resolve(STORAGE_DIR)!==path.resolve(ROOT)
  };
}
let storageHealthCache={checkedAt:0,result:null};
function storageWriteCheck(){
  const testPath=path.join(DATA_DIR,`.health-${process.pid}-${Date.now()}.tmp`);
  try{fs.writeFileSync(testPath,'ok',{flag:'wx'});fs.unlinkSync(testPath);return {ok:true,message:'lectura/escritura OK'};}
  catch(e){try{fs.unlinkSync(testPath);}catch{}return {ok:false,message:redactDiagnosticText(e.message,180)};}
}
function cachedStorageWriteCheck(ttlMs=60*1000){
  if(storageHealthCache.result && now()-storageHealthCache.checkedAt<ttlMs)return storageHealthCache.result;
  const result=storageWriteCheck();storageHealthCache={checkedAt:now(),result};return result;
}
function shallowDatabaseCheck(){try{db.prepare('SELECT 1').get();return {ok:true,message:'consulta OK'};}catch(e){return {ok:false,message:redactDiagnosticText(e.message,180)};}}
function lastSystemCheck(key){
  try{const raw=appSetting(`system_check_${key}`);return raw?JSON.parse(raw):null;}catch{return null;}
}
function saveSystemCheck(key,value,adminUserId=null){
  const safe={...value,checkedAt:Number(value?.checkedAt)||now()};
  setAppSetting(`system_check_${key}`,JSON.stringify(safe),adminUserId);
  return safe;
}
async function runSmtpVerify(adminUserId=null){
  const checkedAt=now();
  if(!SMTP_CONFIGURED||!mailTransport)return saveSystemCheck('smtp',{ok:false,checkedAt,message:'SMTP no configurado'},adminUserId);
  try{await mailTransport.verify();return saveSystemCheck('smtp',{ok:true,checkedAt,message:'Conexión y autenticación SMTP correctas'},adminUserId);}
  catch(e){recordServerError('smtp.verify',e);return saveSystemCheck('smtp',{ok:false,checkedAt,message:redactDiagnosticText(e.message,220)},adminUserId);}
}
async function runBackupSelfTest(adminUserId=null){
  const tmpRoot=fs.mkdtempSync(path.join(os.tmpdir(),'vrmatch-restore-test-'));
  const copy=path.join(tmpRoot,'restore-test.db'), checkedAt=now();
  try{
    await db.backup(copy);
    const restored=new Database(copy,{readonly:true,fileMustExist:true});
    let integrity='';
    try{integrity=String(restored.pragma('quick_check',{simple:true})||'');}finally{}
    const tables=['users','profiles','matches','messages'];
    const counts={}; let countsMatch=true;
    for(const table of tables){
      const source=Number(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get()?.n||0);
      const target=Number(restored.prepare(`SELECT COUNT(*) n FROM ${table}`).get()?.n||0);
      counts[table]={source,target}; if(source!==target)countsMatch=false;
    }
    restored.close();
    const ok=integrity.toLowerCase()==='ok'&&countsMatch;
    const result=saveSystemCheck('backup_restore',{ok,checkedAt,message:ok?'Backup SQLite restaurable e íntegro':'La copia no superó la comprobación de restauración',integrity,counts},adminUserId);
    if(adminUserId)logModerationAction(adminUserId,adminUserId,'system_backup_restore_test',result.message,null);
    return result;
  }catch(e){
    recordServerError('backup.restore_test',e,{userId:adminUserId||null});
    return saveSystemCheck('backup_restore',{ok:false,checkedAt,message:redactDiagnosticText(e.message,220)},adminUserId);
  }finally{try{fs.rmSync(tmpRoot,{recursive:true,force:true});}catch{}}
}
function systemDiagnostics(){
  const integrity=quickCheckDatabase(), storage=storageWriteCheck(), mem=process.memoryUsage();
  const recentServerErrors=Number(db.prepare('SELECT COUNT(*) n FROM server_errors WHERE created_at>=?').get(now()-24*60*60*1000)?.n||0);
  const recentClientErrors=Number(db.prepare('SELECT COUNT(*) n FROM client_errors WHERE created_at>=?').get(now()-24*60*60*1000)?.n||0);
  const smtp=lastSystemCheck('smtp'), backupRestore=lastSystemCheck('backup_restore');
  const rssMb=Math.round(mem.rss/1024/1024), heapUsedMb=Math.round(mem.heapUsed/1024/1024);
  const checks=[
    {key:'database',label:'SQLite',ok:Boolean(integrity.ok),detail:integrity.message||''},
    {key:'storage',label:'Almacenamiento lectura/escritura',ok:Boolean(storage.ok),detail:storage.message||''},
    {key:'persistent',label:'Almacenamiento persistente',ok:path.resolve(STORAGE_DIR)!==path.resolve(ROOT),detail:path.resolve(STORAGE_DIR)!==path.resolve(ROOT)?'Directorio persistente configurado':'Usando el filesystem de la aplicación'},
    {key:'smtpConfig',label:'SMTP configurado',ok:SMTP_CONFIGURED,detail:SMTP_CONFIGURED?'Variables SMTP presentes':'Faltan variables SMTP'},
    {key:'smtpTest',label:'Última prueba SMTP',ok:Boolean(smtp?.ok),detail:smtp?.checkedAt?`${smtp.message} · ${new Date(smtp.checkedAt).toISOString()}`:'Aún no ejecutada'},
    {key:'backupRestore',label:'Última prueba de restauración',ok:Boolean(backupRestore?.ok),detail:backupRestore?.checkedAt?`${backupRestore.message} · ${new Date(backupRestore.checkedAt).toISOString()}`:'Aún no ejecutada'},
    {key:'memory',label:'Memoria de proceso',ok:rssMb<HEALTH_MEMORY_WARN_MB,detail:`RSS ${rssMb} MB · heap ${heapUsedMb} MB · aviso ${HEALTH_MEMORY_WARN_MB} MB`},
    {key:'serverErrors',label:'Errores de servidor 24 h',ok:recentServerErrors===0,detail:`${recentServerErrors} servidor · ${recentClientErrors} cliente`}
  ];
  return {ok:checks.filter(c=>['database','storage'].includes(c.key)).every(c=>c.ok),checks,rssMb,heapUsedMb,recentServerErrors,recentClientErrors,smtp,backupRestore};
}
function tarOctal(value,length){
  const raw=Math.max(0,Math.floor(Number(value)||0)).toString(8);
  return raw.padStart(Math.max(1,length-1),'0').slice(-(length-1))+'\0';
}
function tarHeader(name,size,mtimeMs){
  const buf=Buffer.alloc(512,0);
  const put=(value,offset,length)=>{const b=Buffer.from(String(value));b.copy(buf,offset,0,Math.min(length,b.length));};
  const safeName=String(name||'file').replace(/\\/g,'/').replace(/^\/+/, '');
  if(Buffer.byteLength(safeName)>100) throw new Error('Ruta demasiado larga para backup TAR.');
  put(safeName,0,100); put('0000644\0',100,8); put('0000000\0',108,8); put('0000000\0',116,8);
  put(tarOctal(size,12),124,12); put(tarOctal(Math.floor((Number(mtimeMs)||Date.now())/1000),12),136,12);
  for(let i=148;i<156;i++)buf[i]=0x20;
  buf[156]='0'.charCodeAt(0); put('ustar\0',257,6); put('00',263,2);
  let sum=0; for(const byte of buf)sum+=byte;
  put(sum.toString(8).padStart(6,'0')+'\0 ',148,8);
  return buf;
}
async function createTarGz(entries,outPath){
  await new Promise((resolve,reject)=>{
    const output=fs.createWriteStream(outPath), gzip=zlib.createGzip({level:6});
    let settled=false; const fail=e=>{if(!settled){settled=true;reject(e);}};
    output.on('error',fail); gzip.on('error',fail); output.on('finish',()=>{if(!settled){settled=true;resolve();}}); gzip.pipe(output);
    try{
      for(const entry of entries){
        const st=fs.statSync(entry.path), data=fs.readFileSync(entry.path);
        gzip.write(tarHeader(entry.name,data.length,st.mtimeMs)); gzip.write(data);
        const pad=(512-(data.length%512))%512; if(pad)gzip.write(Buffer.alloc(pad));
      }
      gzip.write(Buffer.alloc(1024)); gzip.end();
    }catch(e){fail(e); try{gzip.destroy();}catch{}}
  });
}
function hashToken(token) { return crypto.createHash('sha256').update(String(token || '')).digest('hex'); }
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N:16384, r:8, p:1 });
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}
function verifyPassword(password, stored) {
  try {
    const [kind,saltB64,hashB64] = String(stored || '').split('$');
    if (kind !== 'scrypt' || !saltB64 || !hashB64) return false;
    const salt = Buffer.from(saltB64,'base64url');
    const expected = Buffer.from(hashB64,'base64url');
    const actual = crypto.scryptSync(password, salt, expected.length, { N:16384, r:8, p:1 });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch { return false; }
}
function cleanEmail(value) { return String(value || '').trim().toLowerCase().slice(0, 254); }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function cleanName(value) { return String(value ?? '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 32); }
function cleanShortText(value, max = 180) { return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
function cleanInterests(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(v => cleanShortText(v, 24)).filter(Boolean))].slice(0, 8);
}
function validDeck(mazo) { return VALID_MAZOS.has(mazo) ? mazo : 'rompehielos'; }
function safeRoomId() { return `sala_${crypto.randomBytes(6).toString('hex')}`; }
function safeJsonArray(value) {
  try { const x = JSON.parse(value || '[]'); return Array.isArray(x) ? x : []; } catch { return []; }
}
function safeJsonObject(value) {
  try { const x = JSON.parse(value || '{}'); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; }
}
function pair(a, b) { return [a, b].sort(); }
function matchIdFor(a, b) { return `match_${crypto.createHash('sha256').update(pair(a,b).join(':')).digest('hex').slice(0, 24)}`; }
function isOnline(userId) { return Boolean(onlineUsers.get(userId)?.size); }
function cleanGender(value) { return VALID_GENDERS.has(value) ? value : 'other'; }
function cleanLooking(value) { return VALID_LOOKING.has(value) ? value : 'all'; }
function bool01(value, fallback = true) { return value === undefined || value === null ? (fallback ? 1 : 0) : (value ? 1 : 0); }
function isAdmin(user) { return Boolean(user && ADMIN_EMAILS.has(String(user.email || '').toLowerCase())); }
function baseUrl(req) {
  if (APP_BASE_URL) return APP_BASE_URL;
  // Los enlaces sensibles (verificación, reset, activación) no deben depender
  // del Host suministrado por una petición cuando la app ya está en producción.
  if (LAUNCH_MODE === 'production') throw new Error('VR_APP_BASE_URL_REQUIRED');
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}
function deleteUserUploads(userId) {
  try {
    for (const filename of fs.readdirSync(UPLOAD_DIR)) {
      if (filename.startsWith(`${userId}_`)) fs.unlinkSync(path.join(UPLOAD_DIR, filename));
    }
  } catch (e) { console.warn('No se pudieron limpiar uploads:', e.message); }
}
function cleanupUnusedUploads(userId, keepPaths = []) {
  const keep = new Set(keepPaths.map(x => path.basename(String(x || ''))).filter(Boolean));
  try {
    for (const filename of fs.readdirSync(UPLOAD_DIR)) {
      if (filename.startsWith(`${userId}_`) && !keep.has(filename)) fs.unlinkSync(path.join(UPLOAD_DIR, filename));
    }
  } catch (e) { console.warn('No se pudieron limpiar uploads huérfanos:', e.message); }
}
const actionBuckets = new Map();
const MAX_ACTION_BUCKETS = 10000;
function allowAction(key, limit, windowMs) {
  const ts = now();
  const arr = (actionBuckets.get(key) || []).filter(t => ts - t < windowMs);
  if (!actionBuckets.has(key) && actionBuckets.size >= MAX_ACTION_BUCKETS) {
    // Evita crecimiento ilimitado de memoria ante claves únicas maliciosas.
    let remove = Math.ceil(MAX_ACTION_BUCKETS * 0.2);
    for (const oldKey of actionBuckets.keys()) { actionBuckets.delete(oldKey); if (--remove <= 0) break; }
  }
  if (arr.length >= limit) { actionBuckets.set(key, arr); return false; }
  arr.push(ts); actionBuckets.set(key, arr); return true;
}
function gameInviteKey(fromUser, toUser) { return `${fromUser}:${toUser}`; }
function clearGameInvitesFor(userId) {
  for (const [key, invite] of pendingGameInvites) {
    if (invite.from === userId || invite.to === userId || invite.expiresAt <= now()) pendingGameInvites.delete(key);
  }
}
function getPendingGameInvite(fromUser, toUser) {
  const key = gameInviteKey(fromUser, toUser);
  const invite = pendingGameInvites.get(key);
  if (!invite) return null;
  if (invite.expiresAt <= now()) { pendingGameInvites.delete(key); return null; }
  return invite;
}
function rateLimit({ limit, windowMs, key = req => req.ip }) {
  return (req,res,next) => {
    const bucket = `http:${req.path}:${key(req)}`;
    if (!allowAction(bucket, limit, windowMs)) return res.status(429).json({ok:false,error:'Demasiadas solicitudes. Inténtalo de nuevo más tarde.'});
    next();
  };
}
function issueAuthToken(userId, kind, ttlMs) {
  db.prepare('DELETE FROM auth_tokens WHERE user_id=? AND kind=?').run(userId, kind);
  const token = crypto.randomBytes(32).toString('base64url');
  const ts = now();
  db.prepare('INSERT INTO auth_tokens(token_hash,user_id,kind,created_at,expires_at) VALUES(?,?,?,?,?)').run(hashToken(token),userId,kind,ts,ts+ttlMs);
  return token;
}
function consumeAuthToken(token, kind) {
  const row = db.prepare('SELECT * FROM auth_tokens WHERE token_hash=? AND kind=?').get(hashToken(token),kind);
  if (!row || row.used_at || row.expires_at <= now()) return null;
  db.prepare('UPDATE auth_tokens SET used_at=? WHERE token_hash=?').run(now(),row.token_hash);
  return row;
}
async function sendEmail({to,subject,text,html}) {
  if (!SMTP_CONFIGURED) {
    // Nunca imprimir enlaces/tokens de verificación o recuperación en logs de producción.
    const safeRecipient = String(to || '').replace(/^(.{1,2}).*(@.*)$/, '$1***$2');
    console.warn(`[EMAIL NO CONFIGURADO] No se envió "${subject}" a ${safeRecipient || 'destinatario'}.`);
    return { sent:false };
  }
  await mailTransport.sendMail({ from:process.env.SMTP_FROM, to, subject, text, html });
  return { sent:true };
}

function escapeEmailHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function emailInitials(value) {
  const words=String(value||'').trim().split(/\s+/).filter(Boolean).slice(0,2);
  const initials=words.map(word=>Array.from(word)[0]||'').join('').toUpperCase();
  return escapeEmailHtml(initials || 'VR');
}
function vrEmailShell({preheader='',eyebrow='',title='',bodyHtml='',ctaLabel='',ctaUrl='',footerHtml=''}) {
  const safePreheader=escapeEmailHtml(preheader);
  const safeEyebrow=escapeEmailHtml(eyebrow);
  const safeTitle=escapeEmailHtml(title);
  const safeCtaLabel=escapeEmailHtml(ctaLabel);
  const safeCtaUrl=escapeEmailHtml(ctaUrl);
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>V/R Match</title></head>
<body style="margin:0;padding:0;background:#08080c;color:#f8f7fb;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#08080c;">
    <tr><td align="center" style="padding:34px 14px 44px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">
        <tr><td style="padding:0 4px 22px;">
          <div style="font-size:21px;font-weight:900;letter-spacing:.12em;color:#ffffff;"><span style="color:#ff4f96;">V/R</span> MATCH</div>
          <div style="margin-top:5px;font-size:10px;font-weight:700;letter-spacing:.18em;color:#777386;">HAZ MATCH. ROMPE EL HIELO.</div>
        </td></tr>
        <tr><td style="height:4px;background:linear-gradient(90deg,#ff1f78,#c735ff,#6e57ff);border-radius:999px 999px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="background:#12121a;border:1px solid #292936;border-top:0;border-radius:0 0 26px 26px;padding:38px 34px 34px;box-shadow:0 18px 50px rgba(0,0,0,.25);">
          <div style="font-size:11px;font-weight:800;letter-spacing:.18em;color:#ff65a4;">${safeEyebrow}</div>
          <h1 style="margin:10px 0 14px;font-size:30px;line-height:1.12;letter-spacing:-.03em;color:#ffffff;">${safeTitle}</h1>
          <div style="font-size:16px;line-height:1.7;color:#b9b6c5;">${bodyHtml}</div>
          ${safeCtaUrl && safeCtaLabel ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;"><tr><td style="border-radius:14px;background:#ec1767;"><a href="${safeCtaUrl}" style="display:inline-block;padding:15px 24px;font-size:15px;font-weight:900;color:#ffffff;text-decoration:none;border-radius:14px;">${safeCtaLabel} &nbsp;→</a></td></tr></table>` : ''}
          <div style="margin-top:30px;padding-top:22px;border-top:1px solid #292936;font-size:12px;line-height:1.6;color:#777386;">${footerHtml}</div>
        </td></tr>
        <tr><td style="padding:18px 10px 0;text-align:center;font-size:11px;line-height:1.6;color:#5f5b6c;">V/R Match · Hidalgo Entertainment<br>Conecta de verdad. Rompe el hielo jugando.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
async function sendNewMatchEmail(recipientUserId, actorProfile, notificationId='') {
  if (!MATCH_EMAIL_ENABLED) return {sent:false,reason:'disabled_globally'};
  if (!notificationAllowed(recipientUserId,'match')) return {sent:false,reason:'disabled'};
  const recipient=db.prepare("SELECT u.email,p.name FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=? AND u.status='active'").get(recipientUserId);
  if (!recipient?.email) return {sent:false,reason:'missing_recipient'};
  const actorName=cleanName(actorProfile?.nombre||'Tu nuevo match') || 'Tu nuevo match';
  const recipientName=cleanName(recipient?.name||'');
  const appUrl=APP_BASE_URL || `http://localhost:${PORT}`;
  const matchUrl=`${appUrl}/?${notificationId ? `notification=${encodeURIComponent(notificationId)}` : 'open=matches'}`;
  const safeActor=escapeEmailHtml(actorName);
  const safeRecipient=escapeEmailHtml(recipientName);
  const initials=emailInitials(actorName);
  const greeting=safeRecipient ? `<p style="margin:0 0 16px;">Hola <strong style="color:#ffffff;">${safeRecipient}</strong>,</p>` : '';
  const bodyHtml=`${greeting}
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0 20px;"><tr>
      <td style="width:58px;height:58px;border-radius:18px;background:#2a1832;border:1px solid #5d2a65;text-align:center;vertical-align:middle;font-size:19px;font-weight:900;color:#ff6dac;">${initials}</td>
      <td style="padding-left:15px;vertical-align:middle;"><div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#8f899d;">NUEVO MATCH</div><div style="margin-top:4px;font-size:20px;font-weight:900;color:#ffffff;">${safeActor}</div></td>
    </tr></table>
    <p style="margin:0;"><strong style="color:#ffffff;">El interés es mutuo.</strong> Ya podéis empezar a hablar o romper el hielo con una partida dentro de V/R Match.</p>`;
  const html=vrEmailShell({
    preheader:`${actorName} ha hecho match contigo en V/R Match.`,
    eyebrow:'TENÉIS MATCH 💗',
    title:`${actorName} ha hecho match contigo`,
    bodyHtml,
    ctaLabel:'Ver mi match',
    ctaUrl:matchUrl,
    footerHtml:`Este es un aviso de servicio porque tienes activadas las notificaciones de <strong style="color:#a9a5b4;">Nuevo match</strong>. Puedes cambiar esta preferencia desde el centro de notificaciones de V/R Match.<br><br>Por seguridad, entra siempre desde <strong style="color:#a9a5b4;">vrmatch.es</strong>. Nunca te pediremos tu contraseña por email.`
  });
  const text=`${recipientName ? `Hola ${recipientName},\n\n` : ''}${actorName} ha hecho match contigo en V/R Match.\n\nEl interés es mutuo. Ya podéis hablar y romper el hielo jugando.\n\nVer mi match: ${matchUrl}\n\nPuedes desactivar los avisos de Nuevo match desde el centro de notificaciones de V/R Match.`;
  return sendEmail({to:recipient.email,subject:`💗 ${actorName} ha hecho match contigo | V/R Match`,text,html});
}


function cleanNewsletterBody(value,max=5000) {
  return String(value??'').replace(/\r/g,'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max);
}
function safeNewsletterUrl(value) {
  const raw=String(value||'').trim(); if(!raw)return '';
  try {
    const base=new URL(APP_BASE_URL||`http://localhost:${PORT}`),url=new URL(raw,base);
    if(url.origin!==base.origin)return '';
    return url.toString();
  } catch { return ''; }
}
function newsletterPayload(input={}) {
  return {
    subject:cleanShortText(input.subject,120),
    preheader:cleanShortText(input.preheader,180),
    eyebrow:cleanShortText(input.eyebrow||'NOVEDADES',40)||'NOVEDADES',
    title:cleanShortText(input.title,140),
    bodyText:cleanNewsletterBody(input.bodyText,5000),
    ctaLabel:cleanShortText(input.ctaLabel,60),
    ctaUrl:safeNewsletterUrl(input.ctaUrl),
    audienceCity:cleanShortText(input.audienceCity,80)
  };
}
function newsletterTokenForUser(userId) {
  const existing=db.prepare('SELECT token FROM newsletter_unsubscribe_tokens WHERE user_id=?').get(userId);
  if(existing?.token)return existing.token;
  const token=crypto.randomBytes(24).toString('base64url');
  db.prepare('INSERT INTO newsletter_unsubscribe_tokens(user_id,token,created_at) VALUES(?,?,?)').run(userId,token,now());
  return token;
}
function newsletterUnsubscribeUrl(userId) {
  const base=APP_BASE_URL||`http://localhost:${PORT}`;
  return `${base}/newsletter/unsubscribe?token=${encodeURIComponent(newsletterTokenForUser(userId))}`;
}
function newsletterBodyHtml(text='') {
  const paragraphs=String(text||'').split(/\n{2,}/).map(x=>x.trim()).filter(Boolean);
  return paragraphs.map(p=>`<p style="margin:0 0 16px;color:#e9e7ef;font-size:16px;line-height:1.7;">${escapeEmailHtml(p).replace(/\n/g,'<br>')}</p>`).join('');
}
function renderNewsletterEmail(campaign,unsubscribeUrl='',isTest=false) {
  const body=newsletterBodyHtml(campaign.body_text||campaign.bodyText||'');
  const footer=`${isTest?'<strong style="color:#ff78ab">ENVÍO DE PRUEBA</strong><br>':''}Recibes este correo por tu cuenta de V/R Match. ${unsubscribeUrl?`<a href="${escapeEmailHtml(unsubscribeUrl)}" style="color:#ff78ab;text-decoration:underline">Dejar de recibir novedades</a>`:'Puedes desactivar las novedades desde Notificaciones.'}`;
  return vrEmailShell({preheader:campaign.preheader||'',eyebrow:campaign.eyebrow||'NOVEDADES',title:campaign.title||'',bodyHtml:body,ctaLabel:campaign.cta_label||campaign.ctaLabel||'',ctaUrl:campaign.cta_url||campaign.ctaUrl||'',footerHtml:footer});
}
function newsletterEligibleUsers(city='') {
  const c=cleanShortText(city,80);
  const sql=`SELECT u.id,u.email,p.name,p.city FROM users u LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN notification_preferences np ON np.user_id=u.id
    WHERE u.status='active' AND u.email_verified=1 AND COALESCE(np.newsletter_email,1)<>0 ${c?'AND LOWER(COALESCE(p.city,\'\'))=LOWER(?)':''} ORDER BY u.created_at ASC`;
  return c?db.prepare(sql).all(c):db.prepare(sql).all();
}
let newsletterWorkerRunning=false;
async function processNewsletterQueue(limit=NEWSLETTER_BATCH_SIZE) {
  if(newsletterWorkerRunning)return {sent:0,errors:0,busy:true};
  if(!SMTP_CONFIGURED)return {sent:0,errors:0,skipped:true,reason:'SMTP no configurado'};
  newsletterWorkerRunning=true; let sent=0,errors=0,cancelled=0;
  try {
    const rows=db.prepare(`SELECT q.*,c.subject,c.preheader,c.eyebrow,c.title,c.body_text,c.cta_label,c.cta_url,c.status campaign_status
      FROM newsletter_queue q JOIN newsletter_campaigns c ON c.id=q.campaign_id
      WHERE q.status IN ('pending','error') AND q.attempts<4 AND c.status IN ('queued','sending') ORDER BY q.created_at ASC LIMIT ?`).all(Math.max(1,Math.min(100,Number(limit)||NEWSLETTER_BATCH_SIZE)));
    for(const row of rows){
      try{
        const user=row.user_id?db.prepare(`SELECT u.id,u.email,u.status,u.email_verified,COALESCE(np.newsletter_email,1) newsletter_email FROM users u LEFT JOIN notification_preferences np ON np.user_id=u.id WHERE u.id=?`).get(row.user_id):null;
        if(!user||user.status!=='active'||!user.email_verified||Number(user.newsletter_email)===0){db.prepare("UPDATE newsletter_queue SET status='cancelled',last_error='' WHERE id=?").run(row.id);cancelled++;continue;}
        db.prepare("UPDATE newsletter_campaigns SET status='sending',started_at=COALESCE(started_at,?) WHERE id=?").run(now(),row.campaign_id);
        const unsubscribeUrl=newsletterUnsubscribeUrl(user.id);
        await sendEmail({to:user.email,subject:row.subject,text:`${row.title}\n\n${row.body_text}${row.cta_url?`\n\n${row.cta_url}`:''}\n\nDejar de recibir novedades: ${unsubscribeUrl}`,html:renderNewsletterEmail(row,unsubscribeUrl,false)});
        db.prepare("UPDATE newsletter_queue SET status='sent',attempts=attempts+1,last_error='',sent_at=? WHERE id=?").run(now(),row.id);sent++;
      }catch(e){errors++;db.prepare("UPDATE newsletter_queue SET status='error',attempts=attempts+1,last_error=? WHERE id=?").run(redactDiagnosticText(e.message,220),row.id);recordServerError('newsletter.send',e,{campaignId:row.campaign_id});}
      await new Promise(r=>setTimeout(r,180));
    }
    const touched=[...new Set(rows.map(r=>r.campaign_id))];
    for(const id of touched){
      const pending=Number(db.prepare("SELECT COUNT(*) n FROM newsletter_queue WHERE campaign_id=? AND status IN ('pending','error') AND attempts<4").get(id)?.n||0);
      if(!pending)db.prepare("UPDATE newsletter_campaigns SET status='completed',completed_at=COALESCE(completed_at,?) WHERE id=? AND status<>'cancelled'").run(now(),id);
    }
    return {sent,errors,cancelled};
  } finally { newsletterWorkerRunning=false; }
}
setInterval(()=>processNewsletterQueue().catch(e=>recordServerError('newsletter.worker',e)),NEWSLETTER_INTERVAL_SECONDS*1000).unref();


function userCityName(userId) {
  const row=db.prepare(`SELECT COALESCE(c.name,p.city,'') city FROM users u LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN community_city_memberships m ON m.user_id=u.id LEFT JOIN community_cities c ON c.slug=m.city_slug WHERE u.id=?`).get(userId);
  return cleanCommunityCityName(row?.city||'');
}
function cityInviteEligibleForEmail(userId) {
  return db.prepare(`SELECT u.id,u.email,u.email_verified,u.status,COALESCE(np.retention_email,1) retention_email,p.name
    FROM users u LEFT JOIN notification_preferences np ON np.user_id=u.id LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=?`).get(userId)||null;
}
function cityInviteHasCooldown(userId) {
  return Boolean(db.prepare('SELECT 1 FROM profile_city_invites WHERE user_id=? AND created_at>? ORDER BY created_at DESC LIMIT 1').get(userId,now()-CITY_INVITE_COOLDOWN_DAYS*86400000));
}
function createCityProfileInvite(userId,adminUserId,{source='admin_single',email=false,force=false}={}) {
  const user=db.prepare("SELECT id,status FROM users WHERE id=?").get(userId);
  if(!user||user.status!=='active')return {ok:false,reason:'inactive'};
  if(userCityName(userId))return {ok:false,reason:'has_city'};
  if(!force&&cityInviteHasCooldown(userId))return {ok:false,reason:'cooldown'};
  const mail=cityInviteEligibleForEmail(userId),requestEmail=Boolean(email&&mail?.email_verified&&Number(mail?.retention_email)!==0&&SMTP_CONFIGURED);
  const id=safeId('cty'),ts=now();
  db.prepare(`INSERT INTO profile_city_invites(id,user_id,admin_user,source,email_requested,email_status,created_at) VALUES(?,?,?,?,?,?,?)`)
    .run(id,userId,adminUserId||null,cleanShortText(source,40),email?1:0,requestEmail?'pending':'skipped',ts);
  createNotification(userId,'system','📍 Añade tu ciudad','Completa tu ciudad o municipio para mejorar tu perfil y ayudar a que VRMatch crezca cerca de ti.',{reason:'complete_city',open:'city_selector',cityInviteId:id});
  return {ok:true,id,emailQueued:requestEmail};
}
function cityInviteEmailHtml(user={}) {
  const name=cleanShortText(user.name||'',80);
  return vrEmailShell({eyebrow:'COMPLETA TU PERFIL',title:'¿En qué ciudad estás?',bodyHtml:`<p style="margin:0;color:#eee;line-height:1.6;">${name?`${escapeEmailHtml(name)}, `:''}añadir tu ciudad ayuda a mostrarte personas más relevantes y permite que la comunidad local de VRMatch tenga datos reales.</p><p style="margin:16px 0 0;color:#a9a5b4;line-height:1.6;">Solo pedimos tu ciudad o municipio, nunca tu dirección. La ubicación aproximada para calcular distancia sigue siendo opcional.</p>`,ctaLabel:'AÑADIR MI CIUDAD',ctaUrl:`${retentionBaseUrl()}/?city_invite=1`,footerHtml:'Este recordatorio forma parte de la configuración de tu perfil. Puedes desactivar los recordatorios por email desde Notificaciones.'});
}
let cityInviteWorkerRunning=false;
async function processCityInviteEmailQueue(limit=CITY_INVITE_BATCH_SIZE) {
  if(cityInviteWorkerRunning||!SMTP_CONFIGURED)return {sent:0,errors:0,skipped:!SMTP_CONFIGURED};
  cityInviteWorkerRunning=true;let sent=0,errors=0,cancelled=0;
  try{
    const rows=db.prepare(`SELECT i.id,i.user_id,i.email_attempts,u.email,u.email_verified,u.status,p.name,COALESCE(np.retention_email,1) retention_email
      FROM profile_city_invites i JOIN users u ON u.id=i.user_id LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN notification_preferences np ON np.user_id=u.id
      WHERE i.email_status IN ('pending','error') AND i.email_attempts<4 ORDER BY i.created_at ASC LIMIT ?`).all(Math.max(1,Math.min(50,Number(limit)||CITY_INVITE_BATCH_SIZE)));
    for(const row of rows){
      if(row.status!=='active'||!row.email_verified||Number(row.retention_email)===0||userCityName(row.user_id)){
        db.prepare("UPDATE profile_city_invites SET email_status='cancelled',email_error='' WHERE id=?").run(row.id);cancelled++;continue;
      }
      try{
        await sendEmail({to:row.email,subject:'📍 Completa tu ciudad en VRMatch',text:`Añade tu ciudad o municipio para completar tu perfil y mejorar tu experiencia en VRMatch.

${retentionBaseUrl()}/?city_invite=1`,html:cityInviteEmailHtml(row)});
        db.prepare("UPDATE profile_city_invites SET email_status='sent',email_attempts=email_attempts+1,email_error='',email_sent_at=? WHERE id=?").run(now(),row.id);sent++;
      }catch(e){errors++;db.prepare("UPDATE profile_city_invites SET email_status='error',email_attempts=email_attempts+1,email_error=? WHERE id=?").run(redactDiagnosticText(e.message,220),row.id);recordServerError('city_invite.email',e,{inviteId:row.id});}
    }
  } finally {cityInviteWorkerRunning=false;}
  return {sent,errors,cancelled};
}
setInterval(()=>processCityInviteEmailQueue().catch(e=>recordServerError('city_invite.worker',e)),NEWSLETTER_INTERVAL_SECONDS*1000).unref();

function retentionEmailWasSent(userId, kind, contextKey='', withinMs=null) {
  const row=db.prepare('SELECT sent_at FROM retention_email_log WHERE user_id=? AND kind=? AND context_key=? AND status=\'sent\' ORDER BY sent_at DESC LIMIT 1').get(userId,kind,String(contextKey||''));
  if(!row)return false;
  if(withinMs===null)return true;
  return now()-Number(row.sent_at||0) < Math.max(0,Number(withinMs)||0);
}
function logRetentionEmail(userId, kind, contextKey='', status='sent') {
  db.prepare('INSERT INTO retention_email_log(id,user_id,kind,context_key,sent_at,status) VALUES(?,?,?,?,?,?)')
    .run(safeId('remail'),userId,cleanShortText(kind,60),cleanShortText(contextKey,160),now(),status==='sent'?'sent':'error');
}
function retentionRecipient(userId) {
  return db.prepare("SELECT u.id,u.email,u.email_verified,u.status,p.name,p.city FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=? AND u.status='active'").get(userId)||null;
}
function retentionBaseUrl() { return APP_BASE_URL || `http://localhost:${PORT}`; }
function retentionAllowed(userId, notificationType='') {
  if(!RETENTION_EMAIL_ENABLED || !SMTP_CONFIGURED)return false;
  const prefs=notificationPreferences(userId);
  if(!prefs.retentionEmail)return false;
  if(notificationType && !notificationAllowed(userId,notificationType))return false;
  return true;
}
async function sendNewMessageEmail(recipientUserId, actorProfile, notificationId='', matchId='') {
  if(!retentionAllowed(recipientUserId,'message'))return {sent:false,reason:'disabled'};
  const key=String(matchId||actorProfile?.id||'message');
  if(retentionEmailWasSent(recipientUserId,'new_message',key,RETENTION_MESSAGE_COOLDOWN_HOURS*3600000))return {sent:false,reason:'cooldown'};
  const recipient=retentionRecipient(recipientUserId);
  if(!recipient?.email || !recipient.email_verified)return {sent:false,reason:'unverified'};
  const actorName=cleanName(actorProfile?.nombre||'Tu match')||'Tu match';
  const recipientName=cleanName(recipient.name||'');
  const url=`${retentionBaseUrl()}/?${notificationId?`notification=${encodeURIComponent(notificationId)}`:'open=matches'}`;
  const safeActor=escapeEmailHtml(actorName), safeRecipient=escapeEmailHtml(recipientName);
  const html=vrEmailShell({
    preheader:`${actorName} te ha escrito en V/R Match.`,eyebrow:'TIENES UN MENSAJE 💬',title:`${actorName} te ha escrito`,
    bodyHtml:`${safeRecipient?`<p style="margin:0 0 16px;">Hola <strong style="color:#fff;">${safeRecipient}</strong>,</p>`:''}<p style="margin:0;"><strong style="color:#fff;">${safeActor}</strong> te ha dejado un mensaje. Entra en V/R Match para continuar la conversación.</p><p style="margin:16px 0 0;color:#a9a5b4;font-size:13px;">Por privacidad, no incluimos el contenido del chat en el email.</p>`,
    ctaLabel:'Leer mensaje',ctaUrl:url,
    footerHtml:'Este aviso respeta tus preferencias de <strong style="color:#a9a5b4;">Mensajes</strong> y <strong style="color:#a9a5b4;">Recordatorios por email</strong>. Puedes cambiarlas desde V/R Match.'
  });
  const result=await sendEmail({to:recipient.email,subject:`💬 ${actorName} te ha escrito | V/R Match`,text:`${recipientName?`Hola ${recipientName},\n\n`:''}${actorName} te ha escrito en V/R Match.\n\nLeer mensaje: ${url}\n\nPor privacidad, el contenido del chat no se incluye en el email.` ,html});
  if(result.sent)logRetentionEmail(recipientUserId,'new_message',key);
  return result;
}
async function sendGameInviteEmail(recipientUserId, actorProfile, notificationId='', deck='rompehielos') {
  if(!retentionAllowed(recipientUserId,'game_invite'))return {sent:false,reason:'disabled'};
  const key=`${actorProfile?.id||'match'}:${validDeck(deck)}`;
  if(retentionEmailWasSent(recipientUserId,'game_invite',key,6*3600000))return {sent:false,reason:'cooldown'};
  const recipient=retentionRecipient(recipientUserId);
  if(!recipient?.email || !recipient.email_verified)return {sent:false,reason:'unverified'};
  const actorName=cleanName(actorProfile?.nombre||'Tu match')||'Tu match';
  const recipientName=cleanName(recipient.name||'');
  const deckName=validDeck(deck)==='verdadoreto'?'Verdad o Reto':(validDeck(deck)==='conoceme'?'Conóceme':'Rompehielos');
  const url=`${retentionBaseUrl()}/?${notificationId?`notification=${encodeURIComponent(notificationId)}`:'open=matches'}`;
  const html=vrEmailShell({
    preheader:`${actorName} quiere jugar contigo en V/R Match.`,eyebrow:'INVITACIÓN A JUGAR 🎮',title:`${actorName} quiere romper el hielo`,
    bodyHtml:`${recipientName?`<p style="margin:0 0 16px;">Hola <strong style="color:#fff;">${escapeEmailHtml(recipientName)}</strong>,</p>`:''}<p style="margin:0;"><strong style="color:#fff;">${escapeEmailHtml(actorName)}</strong> te ha invitado a <strong style="color:#ff6dac;">${escapeEmailHtml(deckName)}</strong>. Entra en V/R Match para responderle.</p>`,
    ctaLabel:'Abrir V/R Match',ctaUrl:url,
    footerHtml:'Este aviso respeta tus preferencias de <strong style="color:#a9a5b4;">Invitaciones a jugar</strong> y <strong style="color:#a9a5b4;">Recordatorios por email</strong>.'
  });
  const result=await sendEmail({to:recipient.email,subject:`🎮 ${actorName} quiere jugar contigo | V/R Match`,text:`${actorName} quiere jugar a ${deckName} contigo en V/R Match.\n\nAbrir: ${url}`,html});
  if(result.sent)logRetentionEmail(recipientUserId,'game_invite',key);
  return result;
}
async function sendProfileReminderEmail(userId) {
  if(!retentionAllowed(userId))return {sent:false,reason:'disabled'};
  if(retentionEmailWasSent(userId,'profile_incomplete','account'))return {sent:false,reason:'already_sent'};
  const recipient=retentionRecipient(userId);
  if(!recipient?.email || !recipient.email_verified)return {sent:false,reason:'unverified'};
  const city=communityCityForUser(userId)?.name||'';
  const url=retentionBaseUrl();
  const html=vrEmailShell({
    preheader:'Completa tu perfil para empezar a descubrir personas en V/R Match.',eyebrow:'TE FALTA MUY POCO ✨',title:'Completa tu perfil y empieza a hacer match',
    bodyHtml:`<p style="margin:0;">Tu cuenta ya está creada${city?` en <strong style="color:#fff;">${escapeEmailHtml(city)}</strong>`:''}. Solo falta completar el perfil para que otras personas puedan descubrirte y tú puedas empezar a ver perfiles compatibles.</p><p style="margin:16px 0 0;color:#a9a5b4;">Añade una foto, una breve descripción y tus preferencias. Puedes cambiarlo cuando quieras.</p>`,
    ctaLabel:'Completar mi perfil',ctaUrl:url,
    footerHtml:'Es un recordatorio único de activación. Puedes desactivar <strong style="color:#a9a5b4;">Recordatorios por email</strong> desde el centro de notificaciones.'
  });
  const result=await sendEmail({to:recipient.email,subject:'✨ Termina tu perfil en V/R Match',text:`Tu cuenta de V/R Match ya está creada. Completa tu perfil para empezar a descubrir personas.\n\n${url}`,html});
  if(result.sent)logRetentionEmail(userId,'profile_incomplete','account');
  return result;
}
async function sendMatchConversationNudgeEmail(userId, partnerProfile, matchId) {
  if(!retentionAllowed(userId,'match'))return {sent:false,reason:'disabled'};
  if(retentionEmailWasSent(userId,'match_no_chat',matchId))return {sent:false,reason:'already_sent'};
  const recipient=retentionRecipient(userId);
  if(!recipient?.email || !recipient.email_verified)return {sent:false,reason:'unverified'};
  const partnerName=cleanName(partnerProfile?.nombre||'Tu match')||'Tu match';
  const url=retentionBaseUrl();
  const html=vrEmailShell({
    preheader:`Tienes un match con ${partnerName}. Rompe el hielo jugando.`,eyebrow:'TENÉIS MATCH 🔥',title:'¿Quién rompe el hielo primero?',
    bodyHtml:`<p style="margin:0;">Tú y <strong style="color:#fff;">${escapeEmailHtml(partnerName)}</strong> hicisteis match, pero todavía no habéis empezado a hablar.</p><p style="margin:16px 0 0;">Si no sabes qué decir, prueba <strong style="color:#ff6dac;">Rompehielos</strong>: una partida puede ser más fácil que empezar con “hola”.</p>`,
    ctaLabel:'Romper el hielo',ctaUrl:url,
    footerHtml:'Este recordatorio se envía una sola vez por match y respeta tus preferencias de <strong style="color:#a9a5b4;">Nuevo match</strong> y <strong style="color:#a9a5b4;">Recordatorios por email</strong>.'
  });
  const result=await sendEmail({to:recipient.email,subject:`🔥 Rompe el hielo con ${partnerName} | V/R Match`,text:`Tienes un match con ${partnerName}, pero todavía no habéis hablado. Entra en V/R Match y prueba Rompehielos.\n\n${url}`,html});
  if(result.sent)logRetentionEmail(userId,'match_no_chat',matchId);
  return result;
}
async function processRetentionEmails(limit=40) {
  if(!RETENTION_EMAIL_ENABLED || !SMTP_CONFIGURED)return {sent:0,skipped:true};
  let sent=0;
  const ts=now();
  const profileCutoff=ts-RETENTION_PROFILE_HOURS*3600000;
  const profileRows=db.prepare(`SELECT u.id FROM users u LEFT JOIN profiles p ON p.user_id=u.id
    LEFT JOIN notification_preferences np ON np.user_id=u.id
    WHERE u.status='active' AND u.email_verified=1 AND u.created_at<=? AND p.user_id IS NULL
      AND COALESCE(np.retention_email,1)<>0
      AND NOT EXISTS(SELECT 1 FROM retention_email_log r WHERE r.user_id=u.id AND r.kind='profile_incomplete' AND r.context_key='account' AND r.status='sent')
    ORDER BY u.created_at ASC LIMIT ?`).all(profileCutoff,Math.max(1,Math.min(100,Number(limit)||40)));
  for(const row of profileRows){
    if(socketForUser(row.id))continue;
    try{const r=await sendProfileReminderEmail(row.id);if(r.sent)sent++;}catch(e){console.warn('Email perfil incompleto:',e.message);}
  }
  const matchCutoff=ts-RETENTION_MATCH_HOURS*3600000;
  const matchRows=db.prepare(`SELECT m.id,m.user1,m.user2 FROM matches m
    WHERE m.active=1 AND m.created_at<=? AND NOT EXISTS(SELECT 1 FROM messages x WHERE x.match_id=m.id)
      AND (
        EXISTS(SELECT 1 FROM users u LEFT JOIN notification_preferences np ON np.user_id=u.id
          WHERE u.id=m.user1 AND u.status='active' AND u.email_verified=1 AND COALESCE(np.retention_email,1)<>0 AND COALESCE(np.new_match,1)<>0
          AND NOT EXISTS(SELECT 1 FROM retention_email_log r WHERE r.user_id=u.id AND r.kind='match_no_chat' AND r.context_key=m.id AND r.status='sent'))
        OR EXISTS(SELECT 1 FROM users u LEFT JOIN notification_preferences np ON np.user_id=u.id
          WHERE u.id=m.user2 AND u.status='active' AND u.email_verified=1 AND COALESCE(np.retention_email,1)<>0 AND COALESCE(np.new_match,1)<>0
          AND NOT EXISTS(SELECT 1 FROM retention_email_log r WHERE r.user_id=u.id AND r.kind='match_no_chat' AND r.context_key=m.id AND r.status='sent'))
      )
    ORDER BY m.created_at ASC LIMIT ?`).all(matchCutoff,Math.max(1,Math.min(60,Number(limit)||40)));
  for(const match of matchRows){
    for(const [uid,pid] of [[match.user1,match.user2],[match.user2,match.user1]]){
      if(socketForUser(uid) || blockedEitherWay(uid,pid))continue;
      try{const r=await sendMatchConversationNudgeEmail(uid,publicProfile(getProfile(pid)),match.id);if(r.sent)sent++;}catch(e){console.warn('Email match sin conversación:',e.message);}
    }
  }
  return {sent};
}


async function processDeferredPushes(limit=80) {
  if(!PUSH_CONFIGURED)return {sent:0,skipped:true};
  const ts=now(); db.prepare('DELETE FROM deferred_pushes WHERE expires_at<?').run(ts);
  const rows=db.prepare(`SELECT d.notification_id,d.user_id,n.type,n.title,n.body,n.data_json,n.source_user,n.created_at
    FROM deferred_pushes d JOIN notifications n ON n.id=d.notification_id
    WHERE d.available_at<=? AND d.expires_at>? ORDER BY d.available_at ASC LIMIT ?`).all(ts,ts,Math.max(1,Math.min(200,Number(limit)||80)));
  let sent=0;
  for(const row of rows){
    if(userInQuietHours(row.user_id))continue;
    let data={};try{data=JSON.parse(row.data_json||'{}')||{};}catch{}
    const notification={id:row.notification_id,type:row.type,title:row.title,body:row.body,data,sourceUser:row.source_user,createdAt:row.created_at};
    try{const result=await sendPushForUser(row.user_id,notification,{bypassQuiet:true,source:'deferred'});if(result.sent)sent++;else if(!result.deferred&&['disabled','category_disabled','no_subscription','cap','online'].includes(result.reason))db.prepare('DELETE FROM deferred_pushes WHERE notification_id=?').run(row.notification_id);}catch(e){console.warn('Push diferido:',e.message);}
  }
  return {sent};
}
function smartPushAlready(userId,kind,contextKey='') {
  return Boolean(db.prepare('SELECT 1 FROM smart_push_log WHERE user_id=? AND kind=? AND context_key=?').get(userId,kind,String(contextKey||'')));
}
function logSmartPush(userId,kind,contextKey,notificationId) {
  db.prepare('INSERT OR IGNORE INTO smart_push_log(id,user_id,kind,context_key,notification_id,created_at) VALUES(?,?,?,?,?,?)')
    .run(safeId('spl'),userId,kind,String(contextKey||''),notificationId||null,now());
}
function smartPushCooldown(userId,kind,hours) {
  const row=db.prepare('SELECT created_at FROM smart_push_log WHERE user_id=? AND kind=? ORDER BY created_at DESC LIMIT 1').get(userId,kind);
  return row && now()-Number(row.created_at||0)<hours*3600000;
}
function reactivationBucket(lastSeenAt) {
  const days=Math.floor((now()-Number(lastSeenAt||0))/86400000);
  if(days>=14)return {days:14,key:'14d'};
  if(days>=7)return {days:7,key:'7d'};
  if(days>=3)return {days:3,key:'3d'};
  return null;
}
async function processSmartPushes(limit=50) {
  if(!PUSH_CONFIGURED || !SMART_PUSH_ENABLED)return {created:0,skipped:true};
  const ts=now(), max=Math.max(1,Math.min(120,Number(limit)||50));
  const rows=db.prepare(`SELECT u.id,u.last_seen_at,p.city FROM users u JOIN profiles p ON p.user_id=u.id JOIN notification_preferences np ON np.user_id=u.id
    WHERE u.status='active' AND np.push_enabled<>0 AND EXISTS(SELECT 1 FROM push_subscriptions ps WHERE ps.user_id=u.id)
      AND u.last_seen_at<=? ORDER BY u.last_seen_at ASC LIMIT ?`).all(ts-36*3600000,max);
  let created=0;
  for(const row of rows){
    if(socketForUser(row.id)||userInQuietHours(row.id)||!pushBudgetAvailable(row.id,'recommendation'))continue;
    const prefs=notificationPreferences(row.id);
    const bucket=reactivationBucket(row.last_seen_at);
    if(bucket && prefs.reactivationPush){
      const context=`${bucket.key}:${new Date(Number(row.last_seen_at)||0).toISOString().slice(0,10)}`; if(smartPushAlready(row.id,'reactivation',context))continue;
      const candidates=discoverFor(row.id); if(!candidates.length)continue;
      const city=cleanCommunityCityName(row.city||'');
      const title=bucket.days>=14?'¿Volvemos a romper el hielo?':bucket.days>=7?'V/R Match sigue moviéndose':'Hay novedades por descubrir';
      const body=city?`Tienes perfiles por descubrir en ${city} y alrededores.`:'Tienes perfiles por descubrir cuando quieras volver.';
      const n=createNotification(row.id,'reactivation',title,body,{reason:'reactivation',inactivityDays:bucket.days,open:'discover'});
      if(n){logSmartPush(row.id,'reactivation',context,n.id);created++;}
      continue;
    }
    if(bucket)continue;
    if(prefs.cityActivity && !smartPushCooldown(row.id,'city_activity',72)){
      const membership=db.prepare('SELECT city_slug FROM community_city_memberships WHERE user_id=?').get(row.id);
      if(membership){
        const city=db.prepare('SELECT name FROM community_cities WHERE slug=?').get(membership.city_slug);
        const joined=Number(db.prepare('SELECT COUNT(*) n FROM community_city_memberships WHERE city_slug=? AND joined_at>? AND user_id<>?').get(membership.city_slug,row.last_seen_at,row.id)?.n||0);
        if(joined>=3){
          const context=new Date(ts).toISOString().slice(0,10);
          const n=createNotification(row.id,'city_activity','🔥 Tu ciudad se mueve',`${joined} personas se han unido recientemente a VRMatch ${city?.name||row.city||''}.`,{reason:'city_activity',city:city?.name||row.city||'',open:'discover'});
          if(n){logSmartPush(row.id,'city_activity',context,n.id);created++;continue;}
        }
      }
    }
    if(prefs.recommendations && !smartPushCooldown(row.id,'recommendation',72)){
      const candidates=discoverFor(row.id); if(!candidates.length)continue;
      const context=new Date(ts).toISOString().slice(0,10);
      const n=createNotification(row.id,'recommendation','✨ Tienes perfiles por descubrir','Vuelve a Descubrir cuando te apetezca. No mostramos datos de otros perfiles en la pantalla bloqueada.',{reason:'recommendation',open:'discover'});
      if(n){logSmartPush(row.id,'recommendation',context,n.id);created++;}
    }
  }
  return {created};
}

async function sendVerificationEmail(req, user) {
  const token = issueAuthToken(user.id,'verify',EMAIL_VERIFY_HOURS*3600000);
  const link = `${baseUrl(req)}/api/auth/verify?token=${encodeURIComponent(token)}`;
  return sendEmail({to:user.email,subject:'Verifica tu cuenta de V/R Match',text:`Verifica tu cuenta de V/R Match: ${link}
El enlace caduca en ${EMAIL_VERIFY_HOURS} horas.`,html:`<p>Verifica tu cuenta de V/R Match.</p><p><a href="${link}">Verificar correo</a></p><p>Caduca en ${EMAIL_VERIFY_HOURS} horas.</p>`});
}
async function sendResetEmail(req, user) {
  const token = issueAuthToken(user.id,'reset',PASSWORD_RESET_MINUTES*60000);
  const link = `${baseUrl(req)}/?reset=${encodeURIComponent(token)}`;
  return sendEmail({to:user.email,subject:'Restablece tu contraseña de V/R Match',text:`Restablece tu contraseña: ${link}
El enlace caduca en ${PASSWORD_RESET_MINUTES} minutos.`,html:`<p>Has solicitado restablecer tu contraseña de V/R Match.</p><p><a href="${link}">Crear nueva contraseña</a></p><p>Caduca en ${PASSWORD_RESET_MINUTES} minutos.</p>`});
}


function normalizeLaunchCity(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
}
function cleanCommunityCityName(value) {
  const raw=cleanShortText(value,60).replace(/\s*,\s*(España|Spain)$/i,'').trim();
  if (raw.length < 2) return '';
  if (!/[\p{L}]/u.test(raw)) return '';
  const lower=raw.toLocaleLowerCase('es-ES');
  const minor=new Set(['de','del','la','las','los','y','el']);
  let wordIndex=0;
  return lower.split(/(\s+|-)/u).map(part=>{
    if (!part || /^\s+$/.test(part) || part==='-') return part;
    const isMinor=minor.has(part) && wordIndex>0;
    wordIndex++;
    if (isMinor) return part;
    return part.replace(/^([\p{L}])/u, ch=>ch.toLocaleUpperCase('es-ES'));
  }).join('');
}
function ensureCommunityCity(name) {
  const clean=cleanCommunityCityName(name);
  if (!clean) return null;
  const slug=normalizeLaunchCity(clean);
  if (!slug) return null;
  let row=db.prepare('SELECT slug,name,target_users FROM community_cities WHERE slug=?').get(slug);
  if (!row) {
    const target=Number(db.prepare('SELECT target_users FROM launch_cities WHERE slug=?').get(slug)?.target_users || COMMUNITY_DEFAULT_TARGET);
    db.prepare('INSERT INTO community_cities(slug,name,target_users,created_at,updated_at) VALUES(?,?,?,?,?)')
      .run(slug,clean,target,now(),now());
    row={slug,name:clean,target_users:target};
  }
  return row;
}
function communityCityStats(slug) {
  const row=db.prepare(`SELECT c.slug,c.name,c.target_users goal,
    COUNT(CASE WHEN u.status='active' THEN 1 END) current
    FROM community_cities c
    LEFT JOIN community_city_memberships m ON m.city_slug=c.slug
    LEFT JOIN users u ON u.id=m.user_id
    WHERE c.slug=? GROUP BY c.slug`).get(slug);
  if(!row)return null;
  const current=Number(row.current||0),goal=Math.max(1,Number(row.goal||COMMUNITY_DEFAULT_TARGET));
  return {...row,current,goal,percent:Math.min(100,Math.round(current*100/goal)),remaining:Math.max(0,goal-current)};
}
function communityCitiesStats(limit=100) {
  return db.prepare(`SELECT c.slug,c.name,c.target_users goal,
    COUNT(CASE WHEN u.status='active' THEN 1 END) current
    FROM community_cities c
    LEFT JOIN community_city_memberships m ON m.city_slug=c.slug
    LEFT JOIN users u ON u.id=m.user_id
    GROUP BY c.slug
    ORDER BY current DESC,c.name ASC LIMIT ?`).all(Math.max(1,Math.min(300,Number(limit)||100))).map(row=>{
      const current=Number(row.current||0),goal=Math.max(1,Number(row.goal||COMMUNITY_DEFAULT_TARGET));
      return {...row,current,goal,percent:Math.min(100,Math.round(current*100/goal)),remaining:Math.max(0,goal-current)};
    });
}
function communityCityLeaderboard(days=7,limit=10){
  const safeDays=[1,7,30,90].includes(Number(days))?Number(days):7;
  const since=now()-safeDays*86400000;
  return db.prepare(`SELECT c.slug,c.name,c.target_users goal,
      COUNT(CASE WHEN u.status='active' THEN 1 END) current,
      SUM(CASE WHEN u.status='active' AND m.joined_at>=? THEN 1 ELSE 0 END) growth
    FROM community_cities c
    LEFT JOIN community_city_memberships m ON m.city_slug=c.slug
    LEFT JOIN users u ON u.id=m.user_id
    GROUP BY c.slug
    HAVING COUNT(CASE WHEN u.status='active' THEN 1 END)>0
    ORDER BY growth DESC,current DESC,c.name ASC LIMIT ?`).all(since,Math.max(1,Math.min(50,Number(limit)||10))).map((r,i)=>({
      rank:i+1,slug:r.slug,name:r.name,current:Number(r.current)||0,growth:Number(r.growth)||0,goal:Math.max(1,Number(r.goal)||COMMUNITY_DEFAULT_TARGET),
      percent:Math.min(100,Math.round((Number(r.current)||0)*100/Math.max(1,Number(r.goal)||COMMUNITY_DEFAULT_TARGET)))
    }));
}
function communityCityForUser(userId) {
  const row=db.prepare(`SELECT m.user_id,m.city_slug,m.joined_at,m.updated_at,c.name,c.target_users
    FROM community_city_memberships m JOIN community_cities c ON c.slug=m.city_slug WHERE m.user_id=?`).get(userId);
  if(!row)return null;
  const stats=communityCityStats(row.city_slug);
  return {slug:row.city_slug,name:row.name,joinedAt:row.joined_at,updatedAt:row.updated_at,...stats};
}
function setCommunityCityForUser(userId, name) {
  const city=ensureCommunityCity(name);
  if(!city)return null;
  const ts=now();
  const existing=db.prepare('SELECT city_slug,joined_at FROM community_city_memberships WHERE user_id=?').get(userId);
  db.prepare(`INSERT INTO community_city_memberships(user_id,city_slug,joined_at,updated_at)
    VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET city_slug=excluded.city_slug,updated_at=excluded.updated_at`)
    .run(userId,city.slug,existing?.joined_at||ts,ts);
  const profile=db.prepare('SELECT user_id FROM profiles WHERE user_id=?').get(userId);
  if(profile) db.prepare('UPDATE profiles SET city=?,updated_at=? WHERE user_id=?').run(city.name,ts,userId);
  db.prepare("UPDATE profile_city_invites SET completed_at=COALESCE(completed_at,?),email_status=CASE WHEN email_status IN ('pending','error') THEN 'cancelled' ELSE email_status END WHERE user_id=? AND completed_at IS NULL").run(ts,userId);
  refreshReferrerRewardsForInvitee(userId);
  return communityCityForUser(userId);
}
function migrateProfilesToCommunityCities() {
  let migrated=0;
  const rows=db.prepare(`SELECT p.user_id,p.city FROM profiles p
    JOIN users u ON u.id=p.user_id
    LEFT JOIN community_city_memberships m ON m.user_id=p.user_id
    WHERE m.user_id IS NULL AND u.status='active' AND TRIM(p.city)<>''`).all();
  const tx=db.transaction(items=>{for(const row of items){if(setCommunityCityForUser(row.user_id,row.city))migrated++;}});
  tx(rows);
  return migrated;
}
const migratedCommunityCities=migrateProfilesToCommunityCities();
if(migratedCommunityCities) console.log(`Ciudades de comunidad migradas desde perfiles: ${migratedCommunityCities}`);

function launchHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function makeLaunchReferralCode(alias, citySlug) {
  const a = String(alias || 'VR').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5) || 'VR';
  const c = String(citySlug || 'CITY').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3) || 'VR';
  return `VR-${a}-${c}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}
function launchDefaultGoal(slug) {
  const row=db.prepare('SELECT default_target_users,target_users FROM launch_cities WHERE slug=?').get(slug);
  return Number(row?.default_target_users || row?.target_users || 500);
}
function launchCityStats(slug) {
  const row = db.prepare(`
    SELECT c.slug,c.name,c.target_users goal,c.default_target_users defaultGoal,c.status,c.activated_at activatedAt,
      COUNT(w.id) current
    FROM launch_cities c
    LEFT JOIN launch_waitlist_users w ON w.city_slug=c.slug AND w.status!='BLOCKED'
    WHERE c.slug=?
    GROUP BY c.slug
  `).get(slug);
  if (!row) return null;
  const current = Number(row.current || 0), goal = Number(row.goal || 0);
  return {...row,current,goal,defaultGoal:Number(row.defaultGoal||launchDefaultGoal(row.slug)),percent:goal?Math.min(100,Math.round(current*100/goal)):0};
}
function launchCitiesStats() {
  return db.prepare(`
    SELECT c.slug,c.name,c.target_users goal,c.default_target_users defaultGoal,c.status,c.activated_at activatedAt,
      COUNT(w.id) current
    FROM launch_cities c
    LEFT JOIN launch_waitlist_users w ON w.city_slug=c.slug AND w.status!='BLOCKED'
    GROUP BY c.slug
    ORDER BY current DESC,c.name ASC
  `).all().map(row => {
    const current=Number(row.current||0),goal=Number(row.goal||0);
    return {...row,current,goal,defaultGoal:Number(row.defaultGoal||launchDefaultGoal(row.slug)),percent:goal?Math.min(100,Math.round(current*100/goal)):0};
  });
}
function refreshLaunchCityStatus(slug) {
  const stats = launchCityStats(slug);
  if (!stats) return null;
  if (stats.status === 'WAITING' && stats.current >= stats.goal) {
    db.prepare("UPDATE launch_cities SET status='READY',updated_at=? WHERE slug=?").run(now(),slug);
  } else if (stats.status === 'READY' && stats.current < stats.goal) {
    db.prepare("UPDATE launch_cities SET status='WAITING',updated_at=? WHERE slug=?").run(now(),slug);
  }
  return launchCityStats(slug);
}

function launchReferralStats(code) {
  const referralCode=cleanShortText(code,80);
  if (!referralCode) return null;
  const owner=db.prepare(`SELECT id,city_slug,founder_qualified_at FROM launch_waitlist_users
    WHERE referral_code=? AND status!='BLOCKED'`).get(referralCode);
  if (!owner) return null;
  const successfulInvites=Number(db.prepare('SELECT COUNT(*) n FROM launch_waitlist_users WHERE referred_by=? AND status!=?')
    .get(referralCode,'BLOCKED')?.n||0);
  const visits=Number(db.prepare("SELECT COUNT(*) n FROM launch_referral_events WHERE referral_code=? AND event_type='VISIT'")
    .get(referralCode)?.n||0);
  const signupEvents=Number(db.prepare("SELECT COUNT(*) n FROM launch_referral_events WHERE referral_code=? AND event_type='SIGNUP'")
    .get(referralCode)?.n||0);
  const founderQualified=Boolean(owner.founder_qualified_at || successfulInvites>=FOUNDER_REFERRALS_TARGET);
  return {
    code:referralCode,
    successfulInvites,
    visits,
    signupEvents,
    founderTarget:FOUNDER_REFERRALS_TARGET,
    founderQualified,
    remaining:Math.max(0,FOUNDER_REFERRALS_TARGET-successfulInvites),
    city:launchCityStats(owner.city_slug)
  };
}
function refreshLaunchFounderQualification(referralCode, ts=now()) {
  const stats=launchReferralStats(referralCode);
  if (!stats) return null;
  if (stats.successfulInvites>=FOUNDER_REFERRALS_TARGET) {
    db.prepare(`UPDATE launch_waitlist_users
      SET founder_qualified_at=COALESCE(founder_qualified_at,?),updated_at=?
      WHERE referral_code=?`).run(ts,ts,stats.code);
    return {...stats,founderQualified:true,remaining:0};
  }
  return stats;
}

// ---- CRECIMIENTO VIRAL · REFERIDOS DE USUARIOS ACTIVOS ----
function normalizeMemberReferralCode(value) {
  return cleanShortText(value,40).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,24);
}
const GROWTH_PUBLIC_EVENTS = new Set(['page_view','registration_started','landing_cta']);
function cleanGrowthValue(value,max=120) {
  return cleanShortText(value,max).replace(/[\r\n\t]+/g,' ').trim();
}
function growthSourceFromReferrer(referrer='') {
  try {
    const host=new URL(String(referrer||'')).hostname.toLowerCase().replace(/^www\./,'');
    if(!host)return {source:'direct',medium:'none'};
    if(host.includes('google.'))return {source:'google',medium:'organic'};
    if(host.includes('bing.'))return {source:'bing',medium:'organic'};
    if(host.includes('tiktok.'))return {source:'tiktok',medium:'referral'};
    if(host.includes('instagram.'))return {source:'instagram',medium:'referral'};
    if(host.includes('facebook.')||host==='fb.com')return {source:'facebook',medium:'referral'};
    if(host.includes('youtube.')||host==='youtu.be')return {source:'youtube',medium:'referral'};
    if(host.includes('x.com')||host.includes('twitter.'))return {source:'x',medium:'referral'};
    return {source:host.slice(0,80),medium:'referral'};
  } catch { return {source:'direct',medium:'none'}; }
}
function normalizeGrowthAcquisition(raw={}) {
  let referrer=cleanGrowthValue(raw?.referrer,240);
  try { const u=new URL(referrer); referrer=`${u.protocol}//${u.host}`; } catch { referrer=''; }
  const derived=growthSourceFromReferrer(referrer);
  let source=cleanGrowthValue(raw?.source,80).toLowerCase();
  let medium=cleanGrowthValue(raw?.medium,80).toLowerCase();
  if(!source)source=derived.source;
  if(!medium)medium=source==='direct'?'none':derived.medium;
  return {
    sessionId:cleanGrowthValue(raw?.sessionId,80),
    source:source||'direct',medium:medium||'none',
    campaign:cleanGrowthValue(raw?.campaign,120),content:cleanGrowthValue(raw?.content,120),term:cleanGrowthValue(raw?.term,120),
    referrer,landingPath:cleanGrowthValue(raw?.landingPath,180).split('?')[0]||'/'
  };
}
function safeGrowthMetadata(raw={}) {
  const out={};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
  for(const [k,v] of Object.entries(raw).slice(0,8)){
    const key=cleanGrowthValue(k,40).replace(/[^a-zA-Z0-9_-]/g,'');
    if(!key)continue;
    if(typeof v==='number'&&Number.isFinite(v))out[key]=v;
    else if(typeof v==='boolean')out[key]=v;
    else if(typeof v==='string')out[key]=cleanGrowthValue(v,100);
  }
  return out;
}
function recordGrowthEvent(eventName,{sessionId='',userId=null,acquisition={},page='',metadata={}}={}) {
  const event=cleanGrowthValue(eventName,50).toLowerCase();
  if(!event)return null;
  const a=normalizeGrowthAcquisition({...acquisition,sessionId:sessionId||acquisition?.sessionId});
  const ts=now(), id=safeId('growth');
  db.prepare(`INSERT INTO growth_events(id,event_name,session_id,user_id,source,medium,campaign,content,term,referrer,landing_path,page,metadata_json,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,event,a.sessionId,userId||null,a.source,a.medium,a.campaign,a.content,a.term,a.referrer,a.landingPath,cleanGrowthValue(page,180).split('?')[0],JSON.stringify(safeGrowthMetadata(metadata)),ts);
  return {id,createdAt:ts};
}
function saveGrowthAcquisition(userId,raw={}) {
  if(!userId)return null;
  const a=normalizeGrowthAcquisition(raw),ts=now();
  db.prepare(`INSERT OR IGNORE INTO growth_acquisition(user_id,session_id,source,medium,campaign,content,term,referrer,landing_path,attributed_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(userId,a.sessionId,a.source,a.medium,a.campaign,a.content,a.term,a.referrer,a.landingPath,ts);
  return db.prepare('SELECT * FROM growth_acquisition WHERE user_id=?').get(userId)||null;
}
function growthAcquisitionForUser(userId){return db.prepare('SELECT session_id,source,medium,campaign,content,term,referrer,landing_path,attributed_at FROM growth_acquisition WHERE user_id=?').get(userId)||null;}
function recordFirstUserGrowthEvent(userId,eventName,metadata={}) {
  if(!userId)return false;
  const exists=db.prepare('SELECT 1 FROM growth_events WHERE user_id=? AND event_name=? LIMIT 1').get(userId,eventName);
  if(exists)return false;
  const a=growthAcquisitionForUser(userId)||{};
  recordGrowthEvent(eventName,{userId,sessionId:a.session_id||'',acquisition:{sessionId:a.session_id||'',source:a.source,medium:a.medium,campaign:a.campaign,content:a.content,term:a.term,referrer:a.referrer,landingPath:a.landing_path},page:'/',metadata});
  return true;
}

function ensureMemberReferral(userId) {
  if (!userId) return null;
  let row=db.prepare('SELECT user_id,referral_code,created_at FROM user_referrals WHERE user_id=?').get(userId);
  if (row) return row;
  let code;
  do { code=`VR${crypto.randomBytes(5).toString('hex').toUpperCase()}`; }
  while(db.prepare('SELECT 1 FROM user_referrals WHERE referral_code=?').get(code));
  const ts=now();
  db.prepare('INSERT INTO user_referrals(user_id,referral_code,created_at) VALUES(?,?,?)').run(userId,code,ts);
  return {user_id:userId,referral_code:code,created_at:ts};
}
function referralActiveCount(userId) {
  return Number(db.prepare(`SELECT COUNT(*) n
    FROM user_referral_attributions a
    JOIN users u ON u.id=a.invitee_user_id AND u.status='active'
    JOIN community_city_memberships cm ON cm.user_id=u.id
    JOIN profiles p ON p.user_id=u.id
    WHERE a.referrer_user_id=?
      AND json_valid(COALESCE(p.photos_json,'[]')) AND json_array_length(COALESCE(p.photos_json,'[]'))>=1
      AND EXISTS(SELECT 1 FROM likes l WHERE l.from_user=u.id LIMIT 1)`).get(userId)?.n||0);
}
function referralBadgesForUser(userId) {
  const rows=db.prepare(`SELECT reward_key FROM referral_rewards WHERE user_id=? AND reward_key IN ('badge_pioneer','badge_founder','badge_ambassador') ORDER BY granted_at ASC`).all(userId);
  const labels={badge_pioneer:'Pionero',badge_founder:'Fundador',badge_ambassador:'Embajador'};
  return rows.map(r=>labels[r.reward_key]).filter(Boolean);
}
function referralBoostCredits(userId) {
  return Number(db.prepare("SELECT COUNT(*) n FROM referral_rewards WHERE user_id=? AND reward_key LIKE 'boost_credit_%' AND consumed_at IS NULL").get(userId)?.n||0);
}
function grantReferralReward(userId,rewardKey,metadata={}) {
  const result=db.prepare(`INSERT OR IGNORE INTO referral_rewards(user_id,reward_key,granted_at,consumed_at,metadata_json) VALUES(?,?,?,NULL,?)`)
    .run(userId,rewardKey,now(),JSON.stringify(metadata||{}));
  return Boolean(result.changes);
}
function syncReferralRewards(userId) {
  if(!userId || !db.prepare("SELECT 1 FROM users WHERE id=? AND status='active'").get(userId))return null;
  const signups=Number(db.prepare('SELECT COUNT(*) n FROM user_referral_attributions WHERE referrer_user_id=?').get(userId)?.n||0);
  const active=referralActiveCount(userId);
  if(signups>=1)grantReferralReward(userId,'badge_pioneer',{threshold:1,basis:'signup'});
  if(signups>=3)grantReferralReward(userId,'badge_founder',{threshold:3,basis:'signup'});
  if(active>=5)grantReferralReward(userId,'boost_credit_5',{threshold:5,basis:'active'});
  if(active>=10){
    grantReferralReward(userId,'badge_ambassador',{threshold:10,basis:'active'});
    grantReferralReward(userId,'boost_credit_10a',{threshold:10,basis:'active'});
    grantReferralReward(userId,'boost_credit_10b',{threshold:10,basis:'active'});
    grantReferralReward(userId,'boost_credit_10c',{threshold:10,basis:'active'});
  }
  return {signups,activeReferrals:active,boostCredits:referralBoostCredits(userId),badges:referralBadgesForUser(userId)};
}
function refreshReferrerRewardsForInvitee(inviteeUserId) {
  const row=db.prepare('SELECT referrer_user_id FROM user_referral_attributions WHERE invitee_user_id=?').get(inviteeUserId);
  return row?.referrer_user_id?syncReferralRewards(row.referrer_user_id):null;
}
function memberReferralStats(userId) {
  const row=ensureMemberReferral(userId);
  if (!row) return null;
  const code=row.referral_code;
  const visits=Number(db.prepare("SELECT COUNT(*) n FROM user_referral_events WHERE referral_code=? AND event_type='VISIT'").get(code)?.n||0);
  const shares=Number(db.prepare("SELECT COUNT(*) n FROM user_referral_events WHERE referral_code=? AND event_type LIKE 'SHARE_%'").get(code)?.n||0);
  const reward=syncReferralRewards(userId)||{signups:0,activeReferrals:0,boostCredits:0,badges:[]};
  const milestones=[
    {key:'pioneer',label:'Pionero',target:1,basis:'signups',value:reward.signups,reward:'Insignia Pionero',unlocked:reward.signups>=1},
    {key:'founder',label:'Fundador',target:3,basis:'signups',value:reward.signups,reward:'Insignia Fundador',unlocked:reward.signups>=3},
    {key:'boost',label:'Impulso',target:5,basis:'active',value:reward.activeReferrals,reward:'1 Boost gratis',unlocked:reward.activeReferrals>=5},
    {key:'ambassador',label:'Embajador',target:10,basis:'active',value:reward.activeReferrals,reward:'Insignia Embajador + 3 Boost',unlocked:reward.activeReferrals>=10}
  ];
  const nextMilestone=milestones.find(m=>!m.unlocked)||null;
  const goal=3;
  return {code,visits,shares,signups:reward.signups,activeReferrals:reward.activeReferrals,boostCredits:reward.boostCredits,badges:reward.badges,milestones,nextMilestone,goal,remaining:Math.max(0,goal-reward.signups),rewardUnlocked:reward.signups>=goal};
}
function normalizeCreatorCode(value){return cleanShortText(value,32).toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,24);}
function creatorCodeRow(rawCode,activeOnly=true){
  const code=normalizeCreatorCode(rawCode);if(!code)return null;
  return db.prepare(`SELECT code,display_name,campaign,active,created_at,updated_at FROM creator_codes WHERE code=?${activeOnly?' AND active=1':''}`).get(code)||null;
}
function attributeCreator(userId,rawCode){
  const creator=creatorCodeRow(rawCode,true);if(!userId||!creator)return null;
  if(db.prepare('SELECT 1 FROM creator_attributions WHERE user_id=?').get(userId))return null;
  const ts=now();
  db.prepare('INSERT INTO creator_attributions(user_id,code,attributed_at) VALUES(?,?,?)').run(userId,creator.code,ts);
  db.prepare('INSERT INTO creator_events(id,code,event_type,user_id,session_id,created_at) VALUES(?,?,?,?,?,?)').run(safeId('crev'),creator.code,'SIGNUP',userId,'',ts);
  return creator;
}
function creatorPerformance(days=30){
  const since=now()-Math.max(1,Math.min(365,Number(days)||30))*86400000,activeSince=now()-7*86400000;
  return db.prepare(`SELECT c.code,c.display_name displayName,c.campaign,c.active,
      (SELECT COUNT(*) FROM creator_events e WHERE e.code=c.code AND e.event_type='VISIT' AND e.created_at>=?) visits,
      (SELECT COUNT(*) FROM creator_attributions a WHERE a.code=c.code AND a.attributed_at>=?) signups,
      (SELECT COUNT(*) FROM creator_attributions a JOIN users u ON u.id=a.user_id WHERE a.code=c.code AND u.status='active' AND u.last_seen_at>=?) active7d,
      (SELECT COUNT(*) FROM creator_attributions a JOIN profiles p ON p.user_id=a.user_id WHERE a.code=c.code AND EXISTS(SELECT 1 FROM likes l WHERE l.from_user=a.user_id LIMIT 1)) activated
    FROM creator_codes c ORDER BY signups DESC,visits DESC,c.created_at DESC`).all(since,since,activeSince)
    .map(r=>({...r,active:Boolean(r.active),visits:Number(r.visits)||0,signups:Number(r.signups)||0,active7d:Number(r.active7d)||0,activated:Number(r.activated)||0,conversion:Number(r.visits)?Math.round(Number(r.signups)*1000/Number(r.visits))/10:null}));
}
function attributeMemberReferral(inviteeUserId, rawCode) {
  const code=normalizeMemberReferralCode(rawCode);
  if (!inviteeUserId || !code) return null;
  const owner=db.prepare('SELECT user_id,referral_code FROM user_referrals WHERE referral_code=?').get(code);
  if (!owner || owner.user_id===inviteeUserId) return null;
  const existing=db.prepare('SELECT 1 FROM user_referral_attributions WHERE invitee_user_id=?').get(inviteeUserId);
  if (existing) return null;
  const ts=now();
  db.prepare('INSERT INTO user_referral_attributions(invitee_user_id,referrer_user_id,referral_code,attributed_at) VALUES(?,?,?,?)')
    .run(inviteeUserId,owner.user_id,owner.referral_code,ts);
  db.prepare('INSERT INTO user_referral_events(id,referral_code,event_type,user_id,created_at) VALUES(?,?,?,?,?)')
    .run(safeId('uref'),owner.referral_code,'SIGNUP',inviteeUserId,ts);
  syncReferralRewards(owner.user_id);
  return {referrerUserId:owner.user_id,code:owner.referral_code};
}
function issueLaunchActivation(waitlistUserId, days = LAUNCH_ACTIVATION_DAYS) {
  const raw = crypto.randomBytes(32).toString('base64url');
  const ts = now(), expiresAt = ts + Math.max(1,Math.min(30,Number(days)||LAUNCH_ACTIVATION_DAYS))*86400000;
  // Solo queda persistido el SHA-256 del token. El token sin hash vive únicamente
  // en memoria mientras se construye/envía el correo.
  db.prepare('DELETE FROM launch_activation_tokens WHERE waitlist_user_id=? AND used_at IS NULL').run(waitlistUserId);
  db.prepare('INSERT INTO launch_activation_tokens(token_hash,waitlist_user_id,created_at,expires_at,used_at) VALUES(?,?,?,?,NULL)')
    .run(hashToken(raw),waitlistUserId,ts,expiresAt);
  return {raw,expiresAt};
}
function safeLaunchBaseUrl(value) {
  try {
    const u=new URL(String(value||''));
    if (!['http:','https:'].includes(u.protocol)) return '';
    return `${u.protocol}//${u.host}`;
  } catch { return ''; }
}
function queueLaunchEmail(waitlistUserId,email,subject,template,payload={}) {
  db.prepare(`INSERT INTO launch_mail_queue(id,waitlist_user_id,email,subject,template,payload_json,status,attempts,last_error,created_at)
    VALUES(?,?,?,?,?,?,'PENDING',0,'',?)`)
    .run(safeId('lmail'),waitlistUserId||null,cleanEmail(email),cleanShortText(subject,180),String(template||''),JSON.stringify(payload||{}),now());
}
function queueLaunchActivationEmail(waitlistUserId,email,subject,activationBaseUrl) {
  // La cola NO guarda activationUrl ni token sin hash.
  return queueLaunchEmail(waitlistUserId,email,subject,'CITY_UNLOCKED',{
    activationBaseUrl:safeLaunchBaseUrl(activationBaseUrl)
  });
}
function sanitizeLegacyLaunchMailQueueSecrets() {
  const rows=db.prepare("SELECT id,status,payload_json FROM launch_mail_queue WHERE template='CITY_UNLOCKED'").all();
  let scrubbed=0;
  for (const row of rows) {
    const payload=safeJsonObject(row.payload_json);
    if (row.status==='SENT') {
      if (String(row.payload_json||'')!=='{}') {
        db.prepare("UPDATE launch_mail_queue SET payload_json='{}' WHERE id=?").run(row.id);
        scrubbed++;
      }
      continue;
    }
    let activationBaseUrl=safeLaunchBaseUrl(payload.activationBaseUrl);
    if (!activationBaseUrl && payload.activationUrl) {
      try { activationBaseUrl=safeLaunchBaseUrl(new URL(String(payload.activationUrl)).origin); } catch {}
    }
    const sanitized=JSON.stringify({activationBaseUrl});
    if (String(row.payload_json||'')!==sanitized) {
      db.prepare('UPDATE launch_mail_queue SET payload_json=? WHERE id=?').run(sanitized,row.id);
      scrubbed++;
    }
  }
  return scrubbed;
}
function cleanupLaunchSecurityData() {
  const ts=now();
  const expired=db.prepare('DELETE FROM launch_activation_tokens WHERE expires_at<=?').run(ts).changes;
  const used=db.prepare('DELETE FROM launch_activation_tokens WHERE used_at IS NOT NULL AND used_at<=?').run(ts-7*86400000).changes;
  const scrubbed=db.prepare("UPDATE launch_mail_queue SET payload_json='{}' WHERE status='SENT' AND payload_json!='{}'").run().changes;
  return {expired,used,scrubbed};
}
function renderLaunchEmail(template,payload={}) {
  const wrap = body => `<!doctype html><html><body style="margin:0;background:#09090d;color:#f8f8fb;font-family:Arial,sans-serif">
  <div style="max-width:620px;margin:auto;padding:42px 24px">
  <div style="font-weight:900;letter-spacing:.12em;color:#ff4f88;margin-bottom:28px">V/R MATCH</div>${body}
  <p style="color:#777985;font-size:12px;margin-top:34px">V/R Match · Hidalgo Entertainment</p></div></body></html>`;
  if (template === 'WAITLIST_WELCOME') {
    return wrap(`<h1 style="font-size:34px;line-height:1.08;margin:0 0 16px">Ya estás en la lista 🔥</h1>
      <p style="color:#b8b6c2;line-height:1.6">${launchHtml(payload.alias)}, estás esperando V/R Match en <strong style="color:white">${launchHtml(payload.city)}</strong>.</p>
      <p style="color:#b8b6c2;line-height:1.6">Comparte tu enlace para acercar tu ciudad al desbloqueo.</p>
      <p style="margin:28px 0"><a href="${launchHtml(payload.referralUrl)}" style="display:inline-block;background:#ff2f78;color:white;text-decoration:none;font-weight:900;padding:14px 20px;border-radius:12px">Compartir mi invitación</a></p>
      <p style="color:#74717e;font-size:12px;word-break:break-all">${launchHtml(payload.referralUrl)}</p>`);
  }
  if (template === 'CITY_UNLOCKED') {
    return wrap(`<div style="font-size:11px;letter-spacing:.16em;color:#ff7da7;font-weight:900">CIUDAD DESBLOQUEADA</div>
      <h1 style="font-size:38px;line-height:1.05;margin:10px 0 16px">${launchHtml(payload.city)} está abierta 🔓</h1>
      <p style="color:#b8b6c2;font-size:17px;line-height:1.65">${launchHtml(payload.alias)}, ya puedes activar tu acceso a V/R Match.</p>
      <p style="margin:30px 0"><a href="${launchHtml(payload.activationUrl)}" style="display:inline-block;background:#ff2f78;color:white;text-decoration:none;font-weight:900;padding:15px 22px;border-radius:12px">Entrar en V/R Match</a></p>
      <p style="color:#74717e;font-size:12px">El enlace caduca en ${Number(payload.activationDays||LAUNCH_ACTIVATION_DAYS)} días.</p>`);
  }
  return wrap(`<p>${launchHtml(payload.message || '')}</p>`);
}
let launchMailWorkerRunning = false;
async function processLaunchMailQueue(limit = 20) {
  if (launchMailWorkerRunning) return {sent:0,errors:0,busy:true};
  if (!SMTP_CONFIGURED) return {sent:0,errors:0,skipped:true,reason:'SMTP no configurado'};
  launchMailWorkerRunning = true;
  let sent=0,errors=0,cancelled=0;
  try {
    const rows = db.prepare(`SELECT * FROM launch_mail_queue
      WHERE status IN ('PENDING','ERROR') AND attempts<5
      ORDER BY created_at ASC LIMIT ?`).all(Math.max(1,Math.min(100,Number(limit)||20)));
    for (const row of rows) {
      try {
        const storedPayload=safeJsonObject(row.payload_json);
        let payload={...storedPayload};

        if (row.template==='CITY_UNLOCKED') {
          const wait=db.prepare(`SELECT w.id,w.alias,w.email,w.status,w.city_slug,c.name cityName,c.status cityStatus
            FROM launch_waitlist_users w JOIN launch_cities c ON c.slug=w.city_slug WHERE w.id=?`).get(row.waitlist_user_id);
          if (!wait || wait.status==='ACTIVATED' || wait.cityStatus!=='ACTIVE') {
            db.prepare("UPDATE launch_mail_queue SET status='CANCELLED',last_error='',payload_json='{}' WHERE id=?").run(row.id);
            cancelled++;
            continue;
          }
          const activationBaseUrl=safeLaunchBaseUrl(storedPayload.activationBaseUrl);
          if (!activationBaseUrl) throw new Error('Falta la URL base para generar el acceso.');
          const activation=issueLaunchActivation(wait.id,LAUNCH_ACTIVATION_DAYS);
          payload={
            alias:wait.alias,
            city:wait.cityName,
            activationDays:LAUNCH_ACTIVATION_DAYS,
            activationUrl:`${activationBaseUrl}/activar?token=${encodeURIComponent(activation.raw)}`
          };
        }

        const text = row.template==='CITY_UNLOCKED'
          ? `${payload.city} está abierta. Activa tu acceso: ${payload.activationUrl}`
          : `Ya estás en la lista de V/R Match. Comparte tu invitación: ${payload.referralUrl || ''}`;
        const result=await sendEmail({to:row.email,subject:row.subject,text,html:renderLaunchEmail(row.template,payload)});
        if (!result.sent) break;

        const sentAt=now();
        db.prepare("UPDATE launch_mail_queue SET status='SENT',attempts=attempts+1,last_error='',sent_at=?,payload_json='{}' WHERE id=?")
          .run(sentAt,row.id);
        if (row.template==='CITY_UNLOCKED' && row.waitlist_user_id) {
          db.prepare("UPDATE launch_waitlist_users SET activation_sent_at=?,status=CASE WHEN status='WAITLIST' THEN 'CITY_READY' ELSE status END,updated_at=? WHERE id=?")
            .run(sentAt,sentAt,row.waitlist_user_id);
        }
        sent++;
      } catch (e) {
        db.prepare("UPDATE launch_mail_queue SET status='ERROR',attempts=attempts+1,last_error=? WHERE id=?")
          .run(cleanShortText(e.message,500),row.id);
        errors++;
      }
    }
  } finally { launchMailWorkerRunning=false; }
  return {sent,errors,cancelled};
}
const legacyLaunchSecretsScrubbed=sanitizeLegacyLaunchMailQueueSecrets();
const launchSecurityCleanupAtBoot=cleanupLaunchSecurityData();
if (legacyLaunchSecretsScrubbed || launchSecurityCleanupAtBoot.expired || launchSecurityCleanupAtBoot.used || launchSecurityCleanupAtBoot.scrubbed) {
  console.log('Launch security cleanup:',{legacyLaunchSecretsScrubbed,...launchSecurityCleanupAtBoot});
}
setTimeout(()=>processLaunchMailQueue(20).catch(e=>console.warn('Launch mail:',e.message)),5000).unref();
setInterval(()=>processLaunchMailQueue(20).catch(e=>console.warn('Launch mail:',e.message)),30000).unref();
setInterval(()=>cleanupLaunchSecurityData(),6*60*60*1000).unref();
setTimeout(()=>processRetentionEmails(40).catch(e=>console.warn('Retención email:',e.message)),90*1000).unref();
setInterval(()=>processRetentionEmails(40).catch(e=>console.warn('Retención email:',e.message)),RETENTION_SWEEP_MINUTES*60*1000).unref();
setTimeout(()=>processSmartPushes(50).catch(e=>console.warn('Push inteligente:',e.message)),120*1000).unref();
setInterval(()=>processSmartPushes(50).catch(e=>console.warn('Push inteligente:',e.message)),SMART_PUSH_SWEEP_MINUTES*60*1000).unref();
setInterval(()=>processDeferredPushes(80).catch(e=>console.warn('Push diferido:',e.message)),5*60*1000).unref();

function mimeExt(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}
function ownedUploadPath(userId, value) {
  const str = String(value || '');
  if (!/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(str)) return '';
  const filename = path.basename(str);
  if (!filename.startsWith(`${userId}_`)) return '';
  const fullPath = path.join(UPLOAD_DIR, filename);
  return fs.existsSync(fullPath) ? `/uploads/${filename}` : '';
}
function saveDataImage(userId, value) {
  const str = String(value || '');
  const owned = ownedUploadPath(userId, str);
  if (owned) return owned;
  const m = str.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!m) return '';
  const buffer = Buffer.from(m[2], 'base64');
  if (!buffer.length || buffer.length > 2.2 * 1024 * 1024) return '';
  const filename = `${userId}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}.${mimeExt(m[1].toLowerCase())}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return `/uploads/${filename}`;
}
function savePhotos(userId, values) {
  if (!Array.isArray(values)) return [];
  return values.map(v => saveDataImage(userId, v)).filter(Boolean).slice(0, 4);
}
function cleanAvatar(userId, value) {
  const avatar = String(value || '');
  if (/^[\p{Extended_Pictographic}\uFE0F\u200D]{1,16}$/u.test(avatar)) return avatar;
  const saved = saveDataImage(userId, avatar);
  if (saved) return saved;
  return ownedUploadPath(userId, avatar);
}

function verificationMime(filename='') {
  const ext=path.extname(String(filename)).toLowerCase();
  if(ext==='.png')return 'image/png';
  if(ext==='.webp')return 'image/webp';
  return 'image/jpeg';
}
function removeVerificationProof(filename='') {
  const base=path.basename(String(filename||''));
  if(!base || !base.startsWith('verify_'))return;
  try{const full=path.join(VERIFICATION_DIR,base);if(fs.existsSync(full))fs.unlinkSync(full);}catch(e){console.warn('No se pudo borrar prueba de verificación:',e.message);}
}
function deleteVerificationFilesForUser(userId) {
  try{for(const filename of fs.readdirSync(VERIFICATION_DIR)){if(filename.startsWith(`verify_${userId}_`))fs.unlinkSync(path.join(VERIFICATION_DIR,filename));}}catch(e){console.warn('No se pudieron limpiar pruebas de verificación:',e.message);}
}
function saveVerificationImage(userId,value) {
  const str=String(value||'');
  const m=str.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if(!m)return '';
  const buffer=Buffer.from(m[2],'base64');
  if(!buffer.length || buffer.length>2.2*1024*1024)return '';
  const filename=`verify_${userId}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}.${mimeExt(m[1].toLowerCase())}`;
  fs.writeFileSync(path.join(VERIFICATION_DIR,filename),buffer,{mode:0o600});
  return filename;
}
function verificationState(userId) {
  const profile=db.prepare('SELECT profile_verified,profile_verified_at FROM profiles WHERE user_id=?').get(userId);
  const request=db.prepare(`SELECT id,status,note,created_at,updated_at,reviewed_at FROM profile_verification_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 1`).get(userId)||null;
  return {verified:Boolean(profile?.profile_verified),verifiedAt:profile?.profile_verified_at||null,request:request?{id:request.id,status:request.status,note:request.status==='rejected'?cleanShortText(request.note,240):'',createdAt:request.created_at,updatedAt:request.updated_at,reviewedAt:request.reviewed_at||null}:null};
}
function logSecurityEvent(userId,kind,severity=1,metadata={}) {
  const uid=userId && db.prepare('SELECT 1 FROM users WHERE id=?').get(userId)?userId:null;
  try{db.prepare('INSERT INTO security_events(id,user_id,kind,severity,metadata_json,created_at) VALUES(?,?,?,?,?,?)').run(safeId('sec'),uid,cleanShortText(kind,60),Math.max(1,Math.min(5,Number(severity)||1)),JSON.stringify(metadata&&typeof metadata==='object'?metadata:{}),now());}catch(e){console.warn('Security event:',e.message);}
}
function securityRiskForUser(userId) {
  const reports=db.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) open FROM reports WHERE reported=?`).get(userId)||{};
  const blocks=db.prepare('SELECT COUNT(*) n FROM blocks WHERE blocked=?').get(userId)?.n||0;
  const signals=db.prepare('SELECT COALESCE(SUM(severity),0) severity,COUNT(*) n FROM security_events WHERE user_id=? AND created_at>?').get(userId,now()-30*24*60*60*1000)||{};
  const verified=Boolean(db.prepare('SELECT profile_verified FROM profiles WHERE user_id=?').get(userId)?.profile_verified);
  const score=Math.min(100,Number(reports.open||0)*20+Math.max(0,Number(reports.total||0)-Number(reports.open||0))*5+Math.min(10,Number(blocks))*3+Math.min(30,Number(signals.severity||0)*4));
  return {score,level:score>=45?'high':score>=20?'medium':score>0?'low':'none',reports:Number(reports.total||0),openReports:Number(reports.open||0),blocksReceived:Number(blocks||0),signals:Number(signals.n||0),profileVerified:verified};
}

function cleanRadius(value, fallback = 50) {
  const allowed = [5, 15, 30, 50, 100, 200];
  const n = Number(value);
  return allowed.includes(n) ? n : (allowed.includes(Number(fallback)) ? Number(fallback) : 50);
}
function hasStoredLocation(row) {
  return Boolean(row && row.location_lat !== null && row.location_lat !== undefined && row.location_lng !== null && row.location_lng !== undefined && Number.isFinite(Number(row.location_lat)) && Number.isFinite(Number(row.location_lng)));
}
function normalizeCoordinate(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  // Aproximación suficiente para distancia sin guardar una posición hiperprecisa.
  return Math.round(n * 1000) / 1000;
}
function distanceKmBetweenRows(a, b) {
  if (!hasStoredLocation(a) || !hasStoredLocation(b)) return null;
  const lat1 = Number(a.location_lat) * Math.PI / 180;
  const lat2 = Number(b.location_lat) * Math.PI / 180;
  const dLat = (Number(b.location_lat) - Number(a.location_lat)) * Math.PI / 180;
  const dLng = (Number(b.location_lng) - Number(a.location_lng)) * Math.PI / 180;
  const h = Math.sin(dLat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng/2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}
function publicDistance(km) {
  if (!Number.isFinite(km)) return null;
  if (km < 1) return 0.5;
  return Math.round(km);
}


function sharedInterestsCount(a, b) {
  const aa = new Set((Array.isArray(a?.intereses) ? a.intereses : []).map(x => String(x).trim().toLowerCase()).filter(Boolean));
  const bb = new Set((Array.isArray(b?.intereses) ? b.intereses : []).map(x => String(x).trim().toLowerCase()).filter(Boolean));
  let n = 0;
  for (const x of aa) if (bb.has(x)) n++;
  return n;
}

// V18.18 · Ranking explicable de Descubrir.
// No intenta inferir personalidad ni atributos sensibles: usa únicamente señales
// que ya forman parte del producto (preferencias, distancia aproximada, intereses,
// actividad reciente, calidad del perfil y verificación).
function sameCity(a,b) {
  const aa=String(a?.ciudad||'').trim().toLowerCase(), bb=String(b?.ciudad||'').trim().toLowerCase();
  return Boolean(aa && bb && aa===bb);
}
function profileQualityPoints(profile) {
  const photos=Array.isArray(profile?.fotos)?profile.fotos:[];
  const bio=String(profile?.bio||'').trim();
  const interests=Array.isArray(profile?.intereses)?profile.intereses:[];
  let score=0;
  if(photos.length>=1)score+=4;
  if(photos.length>=3)score+=2;
  if(bio.length>=20)score+=4;
  if(interests.length>=2)score+=3;
  if(interests.length>=5)score+=2;
  return Math.min(15,score);
}
function activityRankingPoints(lastSeenAt,ts=now()) {
  const age=Math.max(0,ts-Number(lastSeenAt||0));
  const hour=60*60*1000, day=24*hour;
  if(!Number(lastSeenAt))return 0;
  if(age<=hour)return 18;
  if(age<=day)return 16;
  if(age<=3*day)return 12;
  if(age<=7*day)return 8;
  if(age<=30*day)return 4;
  return 0;
}
function distanceRankingPoints(distance,me,candidate) {
  if(Number.isFinite(distance)) {
    if(distance<=5)return 25;
    if(distance<=15)return 22;
    if(distance<=30)return 18;
    if(distance<=50)return 14;
    if(distance<=100)return 9;
    if(distance<=200)return 4;
    return 0;
  }
  return sameCity(me,candidate)?16:0;
}
function smartRankingFor(me,candidate,{distance=null,shared=0,lastSeenAt=0,emailVerified=false,boosted=false}={}) {
  const ts=now();
  const sharedPoints=Math.min(4,Math.max(0,Number(shared)||0))*7; // 0..28
  const distancePoints=distanceRankingPoints(distance,me,candidate); // 0..25
  const activityPoints=activityRankingPoints(lastSeenAt,ts); // 0..18
  const qualityPoints=profileQualityPoints(candidate); // 0..15
  const profileVerificationPoints=candidate?.profileVerified?7:0;
  const emailVerificationPoints=emailVerified?2:0;
  const cityPoints=sameCity(me,candidate)?5:0;
  const affinityScore=Math.max(0,Math.min(100,sharedPoints+distancePoints+activityPoints+qualityPoints+profileVerificationPoints+emailVerificationPoints+cityPoints));
  const sortScore=affinityScore+(boosted?8:0);
  const reasons=[];
  if(shared>0)reasons.push(`${shared} ${shared===1?'interés':'intereses'} en común`);
  if(Number.isFinite(distance) && distance<=30)reasons.push(distance<1?'Muy cerca de ti':`${publicDistance(distance)} km aprox.`);
  else if(sameCity(me,candidate))reasons.push('Misma ciudad');
  if(candidate?.profileVerified)reasons.push('Perfil verificado');
  if(candidate?.privacy?.showOnline!==false && candidate?.online)reasons.push('Conectado ahora');
  if(qualityPoints>=13)reasons.push('Perfil completo');
  const label=affinityScore>=75?'Muy buena afinidad':affinityScore>=55?'Buena afinidad':affinityScore>=35?'Afinidad media':'Por descubrir';
  return {affinityScore,sortScore,label,reasons:reasons.slice(0,3),components:{sharedPoints,distancePoints,activityPoints,qualityPoints,profileVerificationPoints,emailVerificationPoints,cityPoints}};
}
function getPlusSettings(userId) {
  const row = db.prepare('SELECT verified_only,min_shared_interests,sort_mode FROM plus_settings WHERE user_id=?').get(userId);
  return {
    verifiedOnly: Boolean(row?.verified_only),
    minSharedInterests: Math.max(0, Math.min(3, Number(row?.min_shared_interests) || 0)),
    sortMode: ['smart','distance','interests','recent'].includes(String(row?.sort_mode || '')) ? String(row.sort_mode) : 'smart'
  };
}
function plusIsActive(userId) {
  // Todas las funciones V/R+ actuales están disponibles para todos los usuarios.
  return true;
}
function plusBoostState(userId) {
  const row = db.prepare('SELECT active_until,last_used_at FROM plus_boosts WHERE user_id=?').get(userId);
  const activeUntil = Number(row?.active_until) || 0;
  const lastUsedAt = Number(row?.last_used_at) || 0;
  const cooldownUntil = lastUsedAt ? lastUsedAt + 24*60*60*1000 : 0;
  return {
    active: activeUntil > now(),
    activeUntil: activeUntil || null,
    lastUsedAt: lastUsedAt || null,
    cooldownUntil: cooldownUntil || null,
    available: !lastUsedAt || cooldownUntil <= now()
  };
}
function getPlusState(userId) {
  const active = plusIsActive(userId);
  const row = db.prepare('SELECT status,plan,source,started_at,expires_at FROM plus_memberships WHERE user_id=?').get(userId);
  const launchFree = freePremiumDuringLaunch();
  return {
    active,
    plan: active ? (row?.plan || 'plus') : 'free',
    status: active ? 'active' : (row?.status || 'inactive'),
    source: launchFree ? 'launch' : (row?.source || null),
    startedAt: row?.started_at || null,
    expiresAt: launchFree ? null : (active ? (row?.expires_at || null) : null),
    launchFree,
    settings: getPlusSettings(userId),
    boost: plusBoostState(userId),
    billingEnabled: billingConfigured()
  };
}
function requirePlus(req,res,next) {
  if (!plusIsActive(req.user.id)) return res.status(403).json({ok:false,error:'Esta función requiere V/R+.',plusRequired:true});
  next();
}
function grantPlus(userId, days = 30, source = 'admin') {
  const ts = now();
  const current = db.prepare('SELECT expires_at FROM plus_memberships WHERE user_id=?').get(userId);
  const base = Math.max(ts, Number(current?.expires_at) || 0);
  const expires = base + Math.max(1,Math.min(365,Number(days)||30))*86400000;
  db.prepare(`INSERT INTO plus_memberships(user_id,status,plan,source,started_at,expires_at,updated_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET status='active',plan='plus',source=excluded.source,
    started_at=COALESCE(plus_memberships.started_at,excluded.started_at),expires_at=excluded.expires_at,updated_at=excluded.updated_at`)
    .run(userId,'active','plus',source,ts,expires,ts);
  return getPlusState(userId);
}
function revokePlus(userId) {
  const ts = now();
  db.prepare(`INSERT INTO plus_memberships(user_id,status,plan,source,updated_at)
    VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET status='inactive',expires_at=NULL,updated_at=excluded.updated_at`)
    .run(userId,'inactive','plus','admin',ts);
  db.prepare('DELETE FROM plus_boosts WHERE user_id=?').run(userId);
  return getPlusState(userId);
}

function billingCustomerForUser(userId){
  return db.prepare('SELECT customer_id FROM billing_customers WHERE user_id=?').get(userId)?.customer_id || '';
}
function billingUserForCustomer(customerId){
  return db.prepare('SELECT user_id FROM billing_customers WHERE customer_id=?').get(String(customerId||''))?.user_id || '';
}
function billingSubscriptionForUser(userId){
  return db.prepare('SELECT subscription_id,status,price_id,current_period_end,cancel_at_period_end,updated_at FROM billing_subscriptions WHERE user_id=? ORDER BY updated_at DESC LIMIT 1').get(userId) || null;
}
function upsertBillingCustomer(userId,customerId){
  if(!userId || !customerId)return;
  const ts=now();
  db.prepare(`INSERT INTO billing_customers(user_id,provider,customer_id,created_at,updated_at) VALUES(?,'stripe',?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET provider='stripe',customer_id=excluded.customer_id,updated_at=excluded.updated_at`)
    .run(userId,String(customerId),ts,ts);
}
function syncStripeSubscription(subscription){
  if(!subscription || !subscription.id)return {ok:false};
  const customerId=String(subscription.customer||'');
  const metadataUser=String(subscription.metadata?.user_id||'');
  const userId=metadataUser || billingUserForCustomer(customerId);
  if(!userId || !db.prepare('SELECT 1 FROM users WHERE id=?').get(userId))return {ok:false};
  if(customerId)upsertBillingCustomer(userId,customerId);
  const status=String(subscription.status||'inactive');
  const priceId=String(subscription.items?.data?.[0]?.price?.id||'');
  const periodEnd=Number(subscription.current_period_end||0)>0 ? Number(subscription.current_period_end)*1000 : null;
  const ts=now();
  db.prepare(`INSERT INTO billing_subscriptions(subscription_id,user_id,customer_id,provider,status,price_id,current_period_end,cancel_at_period_end,created_at,updated_at)
    VALUES(?,?,?,'stripe',?,?,?,?,?,?) ON CONFLICT(subscription_id) DO UPDATE SET user_id=excluded.user_id,customer_id=excluded.customer_id,
    status=excluded.status,price_id=excluded.price_id,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,updated_at=excluded.updated_at`)
    .run(String(subscription.id),userId,customerId,status,priceId,periodEnd,subscription.cancel_at_period_end?1:0,ts,ts);
  const entitled = ['active','trialing'].includes(status) && (!periodEnd || periodEnd>ts);
  if(entitled){
    db.prepare(`INSERT INTO plus_memberships(user_id,status,plan,source,started_at,expires_at,updated_at)
      VALUES(?,'active','plus','stripe',?,?,?) ON CONFLICT(user_id) DO UPDATE SET status='active',plan='plus',source='stripe',
      started_at=COALESCE(plus_memberships.started_at,excluded.started_at),expires_at=excluded.expires_at,updated_at=excluded.updated_at`)
      .run(userId,ts,periodEnd,ts);
  }else{
    const current=db.prepare('SELECT source FROM plus_memberships WHERE user_id=?').get(userId);
    if(current?.source==='stripe'){
      db.prepare("UPDATE plus_memberships SET status='inactive',expires_at=NULL,updated_at=? WHERE user_id=?").run(ts,userId);
      db.prepare('DELETE FROM plus_boosts WHERE user_id=?').run(userId);
    }
  }
  emitToUser(userId,'plus_state',getPlusState(userId));
  broadcastDiscovery();
  return {ok:true,userId,status};
}
async function stripeRequest(pathname,{method='POST',params=null}={}){
  if(!STRIPE_SECRET_KEY)throw new Error('Stripe no está configurado.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const init={method,headers:{Authorization:`Bearer ${STRIPE_SECRET_KEY}`},signal:controller.signal};
    if(params){init.headers['Content-Type']='application/x-www-form-urlencoded';init.body=new URLSearchParams(params).toString();}
    const response=await fetch(`${STRIPE_API_BASE}${pathname}`,init);
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(cleanShortText(data?.error?.message,220)||'Stripe rechazó la solicitud.');
    return data;
  }finally{clearTimeout(timer);}
}
async function ensureStripeCustomer(userId,email){
  const existing=billingCustomerForUser(userId); if(existing)return existing;
  const customer=await stripeRequest('/customers',{params:{email:String(email||''),'metadata[user_id]':userId}});
  upsertBillingCustomer(userId,customer.id); return String(customer.id);
}
async function retrieveStripeSubscription(subscriptionId){
  return stripeRequest(`/subscriptions/${encodeURIComponent(String(subscriptionId||''))}`,{method:'GET'});
}
async function cancelStripeSubscription(subscriptionId){
  return stripeRequest(`/subscriptions/${encodeURIComponent(String(subscriptionId||''))}`,{method:'DELETE'});
}
function stripeWebhookSignatureValid(rawBody,signatureHeader){
  if(!STRIPE_WEBHOOK_SECRET || !Buffer.isBuffer(rawBody))return false;
  const pieces=String(signatureHeader||'').split(',').map(x=>x.trim()).filter(Boolean);
  const timestamp=pieces.find(x=>x.startsWith('t='))?.slice(2)||'';
  const signatures=pieces.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3)).filter(Boolean);
  const ts=Number(timestamp); if(!Number.isFinite(ts) || Math.abs(Math.floor(Date.now()/1000)-ts)>300 || !signatures.length)return false;
  const expected=crypto.createHmac('sha256',STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${rawBody.toString('utf8')}`,'utf8').digest('hex');
  const expectedBuffer=Buffer.from(expected,'hex');
  return signatures.some(sig=>{try{const candidate=Buffer.from(sig,'hex');return candidate.length===expectedBuffer.length&&crypto.timingSafeEqual(candidate,expectedBuffer);}catch{return false;}});
}
async function handleStripeEvent(event){
  const type=String(event?.type||''),obj=event?.data?.object||{};
  if(type==='checkout.session.completed' && obj.mode==='subscription'){
    const userId=String(obj.metadata?.user_id||obj.client_reference_id||'');
    if(userId && obj.customer)upsertBillingCustomer(userId,String(obj.customer));
    if(obj.subscription){const sub=await retrieveStripeSubscription(String(obj.subscription));syncStripeSubscription(sub);}
    return;
  }
  if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(type))syncStripeSubscription(obj);
}
function billingPublicState(userId){
  const sub=billingSubscriptionForUser(userId);
  return {
    enabled:billingConfigured(),
    prepared:STRIPE_PREPARED,
    mode:STRIPE_MODE,
    launchMode:LAUNCH_MODE,
    customer:Boolean(billingCustomerForUser(userId)),
    subscription:sub?{status:sub.status,currentPeriodEnd:sub.current_period_end||null,cancelAtPeriodEnd:Boolean(sub.cancel_at_period_end)}:null,
    plus:getPlusState(userId),
    freePremiumDuringLaunch:freePremiumDuringLaunch()
  };
}

const NOTIFICATION_TYPES = new Set(['match','message','game_invite','game_turn','city_activity','recommendation','reactivation','system']);
function cleanTimezone(value) {
  const tz=String(value||'').trim().slice(0,80);
  try { new Intl.DateTimeFormat('en-GB',{timeZone:tz||'Europe/Madrid'}).format(new Date()); return tz||'Europe/Madrid'; }
  catch { return 'Europe/Madrid'; }
}
function cleanClock(value,fallback) {
  const v=String(value||'').trim(); return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v)?v:fallback;
}
function notificationPreferences(userId) {
  const row = db.prepare('SELECT * FROM notification_preferences WHERE user_id=?').get(userId);
  return {
    newMatch: row ? row.new_match !== 0 : true,
    newMessage: row ? row.new_message !== 0 : true,
    gameInvite: row ? row.game_invite !== 0 : true,
    gameTurn: row ? row.game_turn !== 0 : true,
    retentionEmail: row ? row.retention_email !== 0 : true,
    newsletterEmail: row ? row.newsletter_email !== 0 : true,
    cityActivity: row ? row.city_activity !== 0 : true,
    recommendations: row ? row.recommendations !== 0 : true,
    reactivationPush: row ? row.reactivation_push !== 0 : true,
    quietHoursEnabled: row ? row.quiet_hours_enabled !== 0 : true,
    quietStart: cleanClock(row?.quiet_start,'23:00'),
    quietEnd: cleanClock(row?.quiet_end,'08:00'),
    timezone: cleanTimezone(row?.timezone||'Europe/Madrid'),
    pushEnabled: row ? row.push_enabled !== 0 : false
  };
}
function notificationAllowed(userId, type) {
  const p = notificationPreferences(userId);
  if (type === 'match') return p.newMatch;
  if (type === 'message') return p.newMessage;
  if (type === 'game_invite') return p.gameInvite;
  if (type === 'game_turn') return p.gameTurn;
  if (type === 'city_activity') return p.cityActivity;
  if (type === 'recommendation') return p.recommendations;
  if (type === 'reactivation') return p.reactivationPush;
  if (type === 'system') return true;
  return false;
}
function notificationFromRow(row) {
  if (!row) return null;
  let data = {};
  try { data = JSON.parse(row.data_json || '{}') || {}; } catch {}
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data,
    sourceUser: row.source_user || null,
    createdAt: row.created_at,
    readAt: row.read_at || null,
    unread: !row.read_at
  };
}
function notificationsFor(userId, limit = 60) {
  const n = Math.max(1, Math.min(100, Number(limit) || 60));
  return db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ?').all(userId,n).map(notificationFromRow);
}
function unreadNotificationCount(userId) {
  return Number(db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL').get(userId)?.n || 0);
}
function localMinutesInTimezone(timezone,ts=now()) {
  try {
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:cleanTimezone(timezone),hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ts));
    const hour=Number(parts.find(p=>p.type==='hour')?.value||0), minute=Number(parts.find(p=>p.type==='minute')?.value||0);
    return hour*60+minute;
  } catch { const d=new Date(ts); return d.getUTCHours()*60+d.getUTCMinutes(); }
}
function clockMinutes(value,fallback='00:00') { const v=cleanClock(value,fallback); const [h,m]=v.split(':').map(Number); return h*60+m; }
function userInQuietHours(userId,ts=now()) {
  const p=notificationPreferences(userId); if(!p.quietHoursEnabled)return false;
  const cur=localMinutesInTimezone(p.timezone,ts), start=clockMinutes(p.quietStart,'23:00'), end=clockMinutes(p.quietEnd,'08:00');
  if(start===end)return false;
  return start<end ? cur>=start&&cur<end : cur>=start||cur<end;
}
function isSmartPushType(type){return ['city_activity','recommendation','reactivation'].includes(String(type||''));}
function pushBudgetAvailable(userId,type) {
  const since=now()-24*3600000;
  const total=Number(db.prepare("SELECT COUNT(*) n FROM push_delivery_log WHERE user_id=? AND status='sent' AND sent_at>=?").get(userId,since)?.n||0);
  if(total>=PUSH_DAILY_CAP)return false;
  if(isSmartPushType(type)){
    const smart=Number(db.prepare("SELECT COUNT(*) n FROM push_delivery_log WHERE user_id=? AND status='sent' AND sent_at>=? AND kind IN ('city_activity','recommendation','reactivation')").get(userId,since)?.n||0);
    if(smart>=PUSH_SMART_DAILY_CAP)return false;
  }
  return true;
}
function upsertPushLog(notification,userId,status,source='event',sentAt=null) {
  if(!notification?.id)return;
  const ts=now();
  db.prepare(`INSERT INTO push_delivery_log(id,notification_id,user_id,kind,source,status,sent_at,created_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(notification_id,user_id) DO UPDATE SET
      kind=excluded.kind,source=excluded.source,status=excluded.status,sent_at=COALESCE(excluded.sent_at,push_delivery_log.sent_at)`)
    .run(safeId('pdl'),notification.id,userId,String(notification.type||'system'),source,status,sentAt,ts);
}
function queueDeferredPush(userId,notification) {
  const ts=now();
  db.prepare(`INSERT INTO deferred_pushes(notification_id,user_id,available_at,expires_at,created_at) VALUES(?,?,?,?,?)
    ON CONFLICT(notification_id) DO UPDATE SET available_at=excluded.available_at,expires_at=excluded.expires_at`)
    .run(notification.id,userId,ts+15*60000,ts+12*3600000,ts);
  upsertPushLog(notification,userId,'deferred','quiet_hours',null);
}
async function sendPushForUser(userId, notification, options={}) {
  if (!PUSH_CONFIGURED || !notificationPreferences(userId).pushEnabled) return {sent:false,reason:'disabled'};
  if(!notificationAllowed(userId,notification?.type||'system'))return {sent:false,reason:'category_disabled'};
  if(socketForUser(userId) && !options.forceWhenOnline)return {sent:false,reason:'online'};
  if(!pushBudgetAvailable(userId,notification?.type)) { upsertPushLog(notification,userId,'skipped','daily_cap',null); return {sent:false,reason:'cap'}; }
  if(!options.bypassQuiet && userInQuietHours(userId)) { queueDeferredPush(userId,notification); return {sent:false,reason:'quiet',deferred:true}; }
  const subscriptions = db.prepare('SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=?').all(userId);
  if (!subscriptions.length) return {sent:false,reason:'no_subscription'};
  const data = notification?.data || {};
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    tag: `vr-${notification.type}-${notification.id}`,
    notificationId: notification.id,
    url: `/?notification=${encodeURIComponent(notification.id)}&push_open=1`,
    data
  });
  let success=0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification({ endpoint:sub.endpoint, keys:{ p256dh:sub.p256dh, auth:sub.auth } }, payload, { TTL: isSmartPushType(notification.type)?3600:900 });
      success++;
    } catch (e) {
      const code = Number(e?.statusCode || 0);
      if (code === 404 || code === 410) db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(sub.id);
      else console.warn('Web Push falló:', e.message);
    }
  }
  if(success){ upsertPushLog(notification,userId,'sent',options.source||'event',now()); db.prepare('DELETE FROM deferred_pushes WHERE notification_id=?').run(notification.id); return {sent:true,subscriptions:success}; }
  upsertPushLog(notification,userId,'failed',options.source||'event',null); return {sent:false,reason:'delivery_failed'};
}
function createNotification(userId, type, title, body, data = {}, sourceUser = null) {
  if (!NOTIFICATION_TYPES.has(type) || !notificationAllowed(userId,type)) return null;
  const notification = {
    id:safeId('not'),
    type,
    title:cleanShortText(title,80),
    body:cleanShortText(body,180),
    data:data && typeof data === 'object' ? data : {},
    sourceUser:sourceUser || null,
    createdAt:now(),
    readAt:null,
    unread:true
  };
  db.prepare('INSERT INTO notifications(id,user_id,source_user,type,title,body,data_json,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(notification.id,userId,notification.sourceUser,type,notification.title,notification.body,JSON.stringify(notification.data),notification.createdAt);
  db.prepare(`DELETE FROM notifications WHERE user_id=? AND id NOT IN
    (SELECT id FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 200)`).run(userId,userId);
  emitToUser(userId,'notification_new',{...notification,unreadCount:unreadNotificationCount(userId)});
  if (PUSH_CONFIGURED) setImmediate(() => sendPushForUser(userId,notification).catch(e=>console.warn('Push:',e.message)));
  return notification;
}
function notificationState(userId) {
  return {
    notifications: notificationsFor(userId,60),
    unread: unreadNotificationCount(userId),
    preferences: notificationPreferences(userId),
    pushConfigured: PUSH_CONFIGURED
  };
}

function profileFromRow(row) {
  if (!row) return null;
  return {
    id: row.user_id,
    nombre: row.name,
    edad: row.age,
    gender: row.gender,
    ciudad: row.city || '',
    bio: row.bio || '',
    intereses: safeJsonArray(row.interests_json),
    avatar: row.avatar || '',
    fotos: safeJsonArray(row.photos_json),
    profileVerified: row.profile_verified === 1,
    profileVerifiedAt: row.profile_verified_at || null,
    preferences: {
      ageMin: row.age_min,
      ageMax: row.age_max,
      lookingFor: row.looking_for,
      city: row.city_pref || '',
      interest: row.interest_pref || '',
      radiusKm: cleanRadius(row.radius_km, 50)
    },
    location: {
      enabled: hasStoredLocation(row),
      updatedAt: row.location_updated_at || null
    },
    privacy: {
      discoverable: row.discoverable !== 0,
      showOnline: row.show_online !== 0,
      allowGameInvites: row.allow_game_invites !== 0,
      communityPublic: row.community_public === 1
    },
    online: row.show_online !== 0 ? isOnline(row.user_id) : false
  };
}
function getProfile(userId) {
  return profileFromRow(db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId));
}

// V18.17 · Estado de activación. Se calcula con datos ya existentes y no requiere
// guardar un perfil psicológico ni puntuaciones ocultas del usuario.
function activationState(userId) {
  const profile=getProfile(userId);
  const city=communityCityForUser(userId);
  const photos=Array.isArray(profile?.fotos)?profile.fotos:[];
  const interests=Array.isArray(profile?.intereses)?profile.intereses:[];
  const basicProfile=Boolean(profile && String(profile.nombre||'').trim().length>=2 && Number(profile.edad)>=18);
  const hasPhoto=photos.length>0;
  const hasAbout=Boolean(profile && String(profile.bio||'').trim().length>=20 && interests.length>=2);
  const growthRows=db.prepare(`SELECT event_name FROM growth_events WHERE user_id=? AND event_name IN ('first_like','first_match','first_message','first_interaction')`).all(userId);
  const growthSet=new Set(growthRows.map(r=>r.event_name));
  const hasLike=growthSet.has('first_like') || Boolean(db.prepare('SELECT 1 FROM likes WHERE from_user=? LIMIT 1').get(userId));
  const hasMatch=growthSet.has('first_match') || Boolean(db.prepare('SELECT 1 FROM matches WHERE user1=? OR user2=? LIMIT 1').get(userId,userId));
  const hasMessage=growthSet.has('first_message') || growthSet.has('first_interaction') || Boolean(db.prepare('SELECT 1 FROM messages WHERE from_user=? LIMIT 1').get(userId)) || Boolean(db.prepare("SELECT 1 FROM chat_events WHERE actor_user=? AND type IN ('game_invite','quick_challenge') LIMIT 1").get(userId));
  const steps=[
    {key:'city',label:'Elige tu ciudad',description:'Nos ayuda a enseñarte comunidad y perfiles de tu zona.',complete:Boolean(city),action:'city'},
    {key:'profile',label:'Crea tu perfil',description:'Nombre, edad y preferencias básicas para empezar.',complete:basicProfile,action:'profile'},
    {key:'photo',label:'Añade una foto',description:'Los perfiles con foto son mucho más fáciles de reconocer.',complete:hasPhoto,action:'photo'},
    {key:'about',label:'Cuenta algo de ti',description:'Escribe una bio breve y añade al menos 2 intereses.',complete:hasAbout,action:'about'},
    {key:'like',label:'Da tu primer like',description:'Explora Descubrir y marca a alguien que te interese.',complete:hasLike,action:'discover'},
    {key:'match',label:'Consigue tu primer match',description:'El match aparece cuando el interés es mutuo.',complete:hasMatch,action:'discover'},
    {key:'message',label:'Rompe el hielo',description:'Escribe a un match o invítale a jugar.',complete:hasMessage,action:hasMatch?'matches':'discover'}
  ];
  const completed=steps.filter(x=>x.complete).length;
  const percent=Math.round(completed*100/steps.length);
  const next=steps.find(x=>!x.complete)||null;
  let ctaLabel='Todo listo',copy='Tu cuenta ya está activada para descubrir, hacer match y conversar.';
  if(next){
    if(next.key==='city'){ctaLabel='Elegir mi ciudad';copy='Empieza por tu zona para que VRMatch pueda personalizar tu experiencia.';}
    else if(next.key==='profile'){ctaLabel='Crear mi perfil';copy='Completa los datos básicos para poder aparecer en Descubrir.';}
    else if(next.key==='photo'){ctaLabel='Añadir una foto';copy='Una foto pública hace tu perfil más reconocible y completo.';}
    else if(next.key==='about'){ctaLabel='Completar mi perfil';copy='Una bio breve y tus intereses dan mejores motivos para empezar conversación.';}
    else if(next.key==='like'){ctaLabel='Ver perfiles';copy='Ya tienes lo esencial. Ahora descubre personas y da tu primer like.';}
    else if(next.key==='match'){ctaLabel='Seguir descubriendo';copy='Ya has dado tu primer like. Los matches dependen de interés mutuo.';}
    else if(next.key==='message'){ctaLabel='Abrir mis matches';copy='Ya tienes un match. Un mensaje o una partida rompe el hielo.';}
  }
  const profileReady=Boolean(basicProfile&&hasPhoto&&hasAbout);
  return {
    percent,completed,total:steps.length,complete:completed===steps.length,profileReady,steps,nextKey:next?.key||'done',nextAction:next?.action||'done',ctaLabel,copy,
    city:city?{name:city.name,current:Number(city.current)||0,goal:Number(city.goal)||500,percent:Number(city.percent)||0}:null
  };
}

// V18.24.1 · Hotfix de compatibilidad para instalaciones que vienen de una base persistente.
// El panel Beta no debe romper toda la administración si una migración quedó a medias.
function ensureBetaSchemaCompatibility() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS beta_memberships (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      city TEXT NOT NULL DEFAULT 'Valencia', wave INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active', source TEXT NOT NULL DEFAULT 'admin',
      joined_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, ended_at INTEGER,
      admin_note TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS beta_activity_days (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL, first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
      opens INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(user_id,day)
    );
    CREATE TABLE IF NOT EXISTS beta_feedback (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL DEFAULT 0, category TEXT NOT NULL DEFAULT 'general',
      message TEXT NOT NULL, page TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open',
      admin_note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER
    );
  `);
  // Si existiera una tabla beta parcial de un despliegue interrumpido, la completamos sin borrar datos.
  const expected={
    beta_memberships:[['city',"TEXT NOT NULL DEFAULT 'Valencia'"],['wave','INTEGER NOT NULL DEFAULT 1'],['status',"TEXT NOT NULL DEFAULT 'active'"],['source',"TEXT NOT NULL DEFAULT 'admin'"],['joined_at','INTEGER NOT NULL DEFAULT 0'],['updated_at','INTEGER NOT NULL DEFAULT 0'],['ended_at','INTEGER'],['admin_note',"TEXT NOT NULL DEFAULT ''"]],
    beta_activity_days:[['first_seen_at','INTEGER NOT NULL DEFAULT 0'],['last_seen_at','INTEGER NOT NULL DEFAULT 0'],['opens','INTEGER NOT NULL DEFAULT 1']],
    beta_feedback:[['rating','INTEGER NOT NULL DEFAULT 0'],['category',"TEXT NOT NULL DEFAULT 'general'"],['message',"TEXT NOT NULL DEFAULT ''"],['page',"TEXT NOT NULL DEFAULT ''"],['status',"TEXT NOT NULL DEFAULT 'open'"],['admin_note',"TEXT NOT NULL DEFAULT ''"],['created_at','INTEGER NOT NULL DEFAULT 0'],['updated_at','INTEGER']]
  };
  for(const [table,cols] of Object.entries(expected)){
    const current=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name));
    for(const [column,definition] of cols){if(!current.has(column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);}
  }
  // Los índices se crean después de completar columnas para soportar esquemas parciales.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_beta_memberships_status_city ON beta_memberships(status,city,joined_at DESC);
    CREATE INDEX IF NOT EXISTS idx_beta_activity_last_seen ON beta_activity_days(last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_beta_feedback_status_created ON beta_feedback(status,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_beta_feedback_user_created ON beta_feedback(user_id,created_at DESC);
  `);
}
ensureBetaSchemaCompatibility();

// V18.24 · Beta controlada. La beta no bloquea el registro general: solo etiqueta
// una cohorte para medir activación, retorno y feedback con consentimiento de uso normal.
function betaMembership(userId) {
  if(!userId)return null;
  const row=db.prepare('SELECT user_id,city,wave,status,source,joined_at,updated_at,ended_at,admin_note FROM beta_memberships WHERE user_id=?').get(userId);
  if(!row)return null;
  return {userId:row.user_id,city:row.city,wave:Number(row.wave)||1,status:row.status,source:row.source,joinedAt:row.joined_at,updatedAt:row.updated_at,endedAt:row.ended_at||null,adminNote:row.admin_note||'',active:row.status==='active'};
}
function betaState(userId) {
  const membership=betaMembership(userId);
  if(!membership)return {member:false,active:false};
  const fb=db.prepare('SELECT COUNT(*) n,MAX(created_at) last_at FROM beta_feedback WHERE user_id=?').get(userId)||{};
  const {adminNote,...publicMembership}=membership;
  return {...publicMembership,member:true,feedbackCount:Number(fb.n)||0,lastFeedbackAt:fb.last_at||null};
}
function touchBetaActivity(userId) {
  const membership=betaMembership(userId);
  if(!membership?.active)return null;
  const ts=now(),day=new Date(ts).toISOString().slice(0,10);
  db.prepare(`INSERT INTO beta_activity_days(user_id,day,first_seen_at,last_seen_at,opens) VALUES(?,?,?,?,1)
    ON CONFLICT(user_id,day) DO UPDATE SET last_seen_at=excluded.last_seen_at,opens=beta_activity_days.opens+1`).run(userId,day,ts,ts);
  return {day,at:ts};
}
function betaMilestones(userId,joinedAt=0) {
  const since=Number(joinedAt)||0,activation=activationState(userId);
  const firstLike=Boolean(db.prepare('SELECT 1 FROM likes WHERE from_user=? AND created_at>=? LIMIT 1').get(userId,since));
  const firstMatch=Boolean(db.prepare('SELECT 1 FROM matches WHERE (user1=? OR user2=?) AND created_at>=? LIMIT 1').get(userId,userId,since));
  const firstMessage=Boolean(db.prepare('SELECT 1 FROM messages WHERE from_user=? AND created_at>=? LIMIT 1').get(userId,since)) || Boolean(db.prepare("SELECT 1 FROM chat_events WHERE actor_user=? AND created_at>=? AND type IN ('game_invite','quick_challenge') LIMIT 1").get(userId,since));
  const firstGame=Boolean(db.prepare('SELECT 1 FROM game_sessions WHERE (user1=? OR user2=?) AND started_at>=? LIMIT 1').get(userId,userId,since));
  const firstInvite=Boolean(db.prepare("SELECT 1 FROM user_referral_events WHERE user_id=? AND created_at>=? AND event_type LIKE 'SHARE_%' LIMIT 1").get(userId,since)) || Boolean(db.prepare("SELECT 1 FROM growth_events WHERE user_id=? AND created_at>=? AND event_name IN ('share_invite','share_game_result') LIMIT 1").get(userId,since));
  const rows=db.prepare('SELECT first_seen_at,last_seen_at FROM beta_activity_days WHERE user_id=? ORDER BY first_seen_at ASC').all(userId);
  const d1Start=since+20*3600000,d1End=since+48*3600000,d7Start=since+6*86400000,d7End=since+9*86400000;
  const overlaps=(r,a,b)=>Number(r.last_seen_at)>=a && Number(r.first_seen_at)<b;
  const d1=rows.some(r=>overlaps(r,d1Start,d1End)),d7=rows.some(r=>overlaps(r,d7Start,d7End));
  return {activationPercent:Number(activation.percent)||0,profileReady:Boolean(activation.profileReady),firstLike,firstMatch,firstMessage,firstGame,firstInvite,d1,d7,d1Eligible:now()>=since+24*3600000,d7Eligible:now()>=since+7*86400000};
}
function betaAdminRows(city='',status='all') {
  const params=[],where=[];
  const cleanCity=cleanCommunityCityName(city||'');
  if(cleanCity){where.push('LOWER(b.city)=LOWER(?)');params.push(cleanCity);}
  if(['active','paused','completed','removed'].includes(status)){where.push('b.status=?');params.push(status);}
  const rows=db.prepare(`SELECT b.user_id,b.city,b.wave,b.status,b.source,b.joined_at,b.updated_at,b.ended_at,b.admin_note,
      u.email,u.last_seen_at,u.created_at,u.status account_status,p.name,p.age,p.profile_verified
      FROM beta_memberships b JOIN users u ON u.id=b.user_id LEFT JOIN profiles p ON p.user_id=u.id
      ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY b.joined_at DESC LIMIT 300`).all(...params);
  return rows.map(r=>{
    let milestones;
    try{milestones=betaMilestones(r.user_id,r.joined_at);}
    catch(error){
      recordServerError('beta.milestones',error,{userId:r.user_id});
      milestones={activationPercent:0,profileReady:false,firstLike:false,firstMatch:false,firstMessage:false,firstGame:false,firstInvite:false,d1:false,d7:false,d1Eligible:false,d7Eligible:false};
    }
    return {...r,milestones,feedbackCount:Number(db.prepare('SELECT COUNT(*) n FROM beta_feedback WHERE user_id=?').get(r.user_id)?.n||0)};
  });
}
function betaAdminSummary(city='') {
  const rows=betaAdminRows(city,'all'),active=rows.filter(r=>r.status==='active');
  const sumKey=k=>active.filter(r=>r.milestones?.[k]).length;
  const d1Eligible=active.filter(r=>r.milestones?.d1Eligible),d7Eligible=active.filter(r=>r.milestones?.d7Eligible);
  const sevenAgo=now()-7*86400000;
  const feedbackWhere=city?` AND EXISTS(SELECT 1 FROM beta_memberships b WHERE b.user_id=f.user_id AND LOWER(b.city)=LOWER(?))`:'';
  const fbParams=city?[cleanCommunityCityName(city)]:[];
  const fb=db.prepare(`SELECT COUNT(*) n,COALESCE(AVG(CASE WHEN rating BETWEEN 1 AND 5 THEN rating END),0) avg_rating,SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) open_n FROM beta_feedback f WHERE 1=1${feedbackWhere}`).get(...fbParams)||{};
  return {
    city:cleanCommunityCityName(city)||BETA_DEFAULT_CITY,total:rows.length,active:active.length,paused:rows.filter(r=>r.status==='paused').length,completed:rows.filter(r=>r.status==='completed').length,
    active7d:active.filter(r=>Number(r.last_seen_at)>=sevenAgo).length,profileReady:sumKey('profileReady'),firstLike:sumKey('firstLike'),firstMatch:sumKey('firstMatch'),firstMessage:sumKey('firstMessage'),firstGame:sumKey('firstGame'),firstInvite:sumKey('firstInvite'),
    d1:{returned:d1Eligible.filter(r=>r.milestones.d1).length,eligible:d1Eligible.length},d7:{returned:d7Eligible.filter(r=>r.milestones.d7).length,eligible:d7Eligible.length},
    feedback:{total:Number(fb.n)||0,open:Number(fb.open_n)||0,averageRating:Number(Number(fb.avg_rating||0).toFixed(1))}
  };
}
function addBetaMember(userId,{city=BETA_DEFAULT_CITY,wave=1,source='admin',note=''}={}) {
  const user=db.prepare("SELECT id,status FROM users WHERE id=?").get(userId);
  if(!user)return {ok:false,reason:'missing_user'};
  if(user.status!=='active')return {ok:false,reason:'inactive_user'};
  const ts=now(),cleanCity=cleanCommunityCityName(city)||BETA_DEFAULT_CITY,cleanWave=clampInt(wave,1,999,1),cleanNote=cleanShortText(note,500);
  const existing=db.prepare('SELECT status,joined_at FROM beta_memberships WHERE user_id=?').get(userId);
  if(existing&&existing.status==='active')return {ok:false,reason:'already_active'};
  db.prepare(`INSERT INTO beta_memberships(user_id,city,wave,status,source,joined_at,updated_at,ended_at,admin_note) VALUES(?,?,?,'active',?,?,?,NULL,?)
    ON CONFLICT(user_id) DO UPDATE SET city=excluded.city,wave=excluded.wave,status='active',source=excluded.source,joined_at=CASE WHEN beta_memberships.status IN ('removed','completed') THEN excluded.joined_at ELSE beta_memberships.joined_at END,updated_at=excluded.updated_at,ended_at=NULL,admin_note=excluded.admin_note`)
    .run(userId,cleanCity,cleanWave,cleanShortText(source,40)||'admin',existing?.joined_at||ts,ts,cleanNote);
  createNotification(userId,'system','🧪 Beta VRMatch',`Formas parte de la beta de VRMatch en ${cleanCity}. Tu uso nos ayuda a detectar qué mejorar antes de crecer más.`,{reason:'beta_program',open:'beta_feedback',city:cleanCity,wave:cleanWave});
  return {ok:true,state:betaState(userId)};
}

function maybeRecordProfileReady(userId,profile=getProfile(userId)) {
  if(!profile)return false;
  const ready=Array.isArray(profile.fotos)&&profile.fotos.length>0&&String(profile.bio||'').trim().length>=20&&Array.isArray(profile.intereses)&&profile.intereses.length>=2;
  return ready?recordFirstUserGrowthEvent(userId,'profile_ready',{city:profile.ciudad||''}):false;
}
function publicProfile(profile) {
  if (!profile) return null;
  // Minimiza datos compartidos entre usuarios: preferencias, privacidad y
  // metadatos internos de ubicación permanecen solo en el servidor/cuenta propia.
  const { preferences, privacy, location, profileVerifiedAt, ...safe } = profile;
  return {...safe,viralBadges:referralBadgesForUser(profile.id)};
}
function profileAccepts(profile, candidate) {
  if (!profile || !candidate) return false;
  if (candidate.privacy && candidate.privacy.discoverable === false) return false;
  if (candidate.edad < profile.preferences.ageMin || candidate.edad > profile.preferences.ageMax) return false;
  const lf = profile.preferences.lookingFor;
  if (lf === 'men' && candidate.gender !== 'man') return false;
  if (lf === 'women' && candidate.gender !== 'woman') return false;
  if (lf === 'nonbinary' && candidate.gender !== 'nonbinary') return false;
  const city = String(profile.preferences.city || '').trim().toLowerCase();
  if (city && !String(candidate.ciudad || '').toLowerCase().includes(city)) return false;
  const interest = String(profile.preferences.interest || '').trim().toLowerCase();
  if (interest && !candidate.intereses.some(x => String(x).toLowerCase().includes(interest))) return false;
  return true;
}
function blockedEitherWay(a, b) {
  return Boolean(db.prepare('SELECT 1 FROM blocks WHERE (blocker=? AND blocked=?) OR (blocker=? AND blocked=?) LIMIT 1').get(a,b,b,a));
}
function getActiveMatch(a, b) {
  const [u1,u2] = pair(a,b);
  return db.prepare(`SELECT m.* FROM matches m
    JOIN users ua ON ua.id=m.user1 JOIN users ub ON ub.id=m.user2
    WHERE m.user1=? AND m.user2=? AND m.active=1 AND ua.status='active' AND ub.status='active'`).get(u1,u2) || null;
}
function discoverFor(userId) {
  const meRow = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  const me = profileFromRow(meRow);
  if (!me || me.privacy?.discoverable === false) return [];
  const excluded = new Set([userId]);
  for (const r of db.prepare('SELECT to_user id FROM likes WHERE from_user=?').all(userId)) excluded.add(r.id);
  for (const r of db.prepare('SELECT to_user id FROM passes WHERE from_user=?').all(userId)) excluded.add(r.id);
  for (const r of db.prepare('SELECT blocked id FROM blocks WHERE blocker=? UNION SELECT blocker id FROM blocks WHERE blocked=?').all(userId,userId)) excluded.add(r.id);
  for (const r of db.prepare('SELECT CASE WHEN user1=? THEN user2 ELSE user1 END id FROM matches WHERE (user1=? OR user2=?) AND active=1').all(userId,userId,userId)) excluded.add(r.id);

  const useDistance = hasStoredLocation(meRow);
  const radiusKm = cleanRadius(meRow?.radius_km, 50);
  const plusActive = plusIsActive(userId);
  const plusSettings = plusActive ? getPlusSettings(userId) : {verifiedOnly:false,minSharedInterests:0,sortMode:'smart'};
  const ts = now();

  return db.prepare("SELECT p.*,u.email_verified,u.last_seen_at FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id != ? AND u.status='active'").all(userId)
    .map(row => {
      const fullProfile = profileFromRow(row);
      const distance = distanceKmBetweenRows(meRow, row);
      const shared = sharedInterestsCount(me, fullProfile);
      const boost = db.prepare('SELECT active_until FROM plus_boosts WHERE user_id=?').get(row.user_id);
      const boosted = Boolean(Number(boost?.active_until) > ts);
      const ranking=smartRankingFor(me,fullProfile,{distance,shared,lastSeenAt:row.last_seen_at||row.updated_at,emailVerified:Boolean(row.email_verified),boosted});
      const profile = publicProfile(fullProfile);
      profile.verified = Boolean(row.email_verified);
      profile.sharedInterests = shared;
      profile.boosted = boosted;
      profile.affinityScore = ranking.affinityScore;
      profile.affinityLabel = ranking.label;
      profile.matchReasons = ranking.reasons;
      if (distance !== null) profile.distanceKm = publicDistance(distance);
      return { row, fullProfile, profile, distance, shared, boosted, ranking };
    })
    .filter(item => !excluded.has(item.profile.id) && profileAccepts(me,item.fullProfile) && profileAccepts(item.fullProfile,me))
    .filter(item => !useDistance || (item.distance !== null && item.distance <= radiusKm))
    .filter(item => !plusSettings.verifiedOnly || item.profile.verified)
    .filter(item => item.shared >= plusSettings.minSharedInterests)
    .sort((a,b) => {
      if (plusActive && plusSettings.sortMode === 'interests' && a.shared !== b.shared) return b.shared - a.shared;
      if (plusActive && plusSettings.sortMode === 'recent') {
        const ar=Number(a.row.last_seen_at||a.row.updated_at||0), br=Number(b.row.last_seen_at||b.row.updated_at||0);
        if(ar!==br)return br-ar;
      }
      if (plusActive && plusSettings.sortMode === 'distance') {
        const ad = a.distance ?? Number.POSITIVE_INFINITY, bd = b.distance ?? Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
      }
      // Smart es el orden por defecto. El Boost suma una ventaja moderada sin
      // saltarse filtros, bloqueos ni preferencias recíprocas.
      if (plusSettings.sortMode === 'smart' && a.ranking.sortScore !== b.ranking.sortScore) return b.ranking.sortScore - a.ranking.sortScore;
      if (a.boosted !== b.boosted) return a.boosted ? -1 : 1;
      if (a.ranking.affinityScore !== b.ranking.affinityScore) return b.ranking.affinityScore - a.ranking.affinityScore;
      if (useDistance) {
        const ad = a.distance ?? Number.POSITIVE_INFINITY, bd = b.distance ?? Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
      }
      // Los perfiles actualizados recientemente obtienen el desempate para evitar
      // que el mismo conjunto quede permanentemente arriba.
      return Number(b.row.updated_at || 0) - Number(a.row.updated_at || 0);
    })
    .map(item => item.profile);
}


function deckPublicLabel(deck){return validDeck(deck)==='parejas'?'Conóceme':(validDeck(deck)==='seccionXX'?'After Dark':'Rompehielos');}
function chatEventInsert(matchId,actorUser,type,relatedId='',payload={}){
  const id=safeId('cevt'),ts=now();
  db.prepare('INSERT INTO chat_events(id,match_id,actor_user,type,related_id,payload_json,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(id,matchId,actorUser||null,cleanShortText(type,40),cleanShortText(relatedId,100),JSON.stringify(payload||{}),ts);
  return id;
}
function quickChallengePublic(challengeId,viewerId){
  const row=db.prepare('SELECT * FROM quick_challenges WHERE id=?').get(challengeId);if(!row)return null;
  const answers=db.prepare('SELECT user_id,choice,answered_at FROM quick_challenge_answers WHERE challenge_id=?').all(challengeId);
  const mine=answers.find(a=>a.user_id===viewerId)||null,other=answers.find(a=>a.user_id!==viewerId)||null,both=answers.length>=2;
  return {id:row.id,prompt:row.prompt,a:row.option_a,b:row.option_b,status:row.status,createdAt:row.created_at,
    mine:mine?.choice||'',otherAnswered:Boolean(other),other:both?(other?.choice||''):'',revealed:both,matched:both?mine?.choice===other?.choice:null};
}
function gameInvitationPublic(inviteId,viewerId){
  const row=db.prepare('SELECT * FROM game_invitations WHERE id=?').get(inviteId);if(!row)return null;
  let status=row.status;if(status==='pending'&&row.expires_at<=now())status='expired';
  return {id:row.id,deck:validDeck(row.deck),deckLabel:deckPublicLabel(row.deck),status,fromUser:row.from_user,toUser:row.to_user,
    mine:row.from_user===viewerId,canAccept:row.to_user===viewerId&&status==='pending',expiresAt:row.expires_at,createdAt:row.created_at};
}
function chatEventPublic(row,viewerId){
  if(!row)return null;const base={id:row.id,kind:'event',type:row.type,from:row.actor_user||'',ts:row.created_at,payload:safeJsonObject(row.payload_json)};
  if(row.type==='quick_challenge')base.payload=quickChallengePublic(row.related_id,viewerId)||base.payload;
  if(row.type==='game_invite')base.payload=gameInvitationPublic(row.related_id,viewerId)||base.payload;
  return base;
}
function chatTimelineFor(matchId,viewerId){
  const messages=db.prepare('SELECT id,from_user AS `from`,text,created_at AS ts FROM messages WHERE match_id=? ORDER BY created_at ASC LIMIT 180').all(matchId)
    .map(x=>({...x,kind:'message'}));
  const events=db.prepare('SELECT * FROM chat_events WHERE match_id=? ORDER BY created_at ASC LIMIT 120').all(matchId).map(x=>chatEventPublic(x,viewerId)).filter(Boolean);
  return [...messages,...events].sort((a,b)=>Number(a.ts||0)-Number(b.ts||0)).slice(-220);
}
function chatEventByRelated(matchId,type,relatedId,viewerId){
  const row=db.prepare('SELECT * FROM chat_events WHERE match_id=? AND type=? AND related_id=? ORDER BY created_at DESC LIMIT 1').get(matchId,type,relatedId);
  return chatEventPublic(row,viewerId);
}
function emitChatRelatedUpdate(match,type,relatedId){
  if(!match)return;for(const uid of [match.user1,match.user2]){const item=chatEventByRelated(match.id,type,relatedId,uid);if(item)emitToUser(uid,'dating_chat_event_update',item);}
}
function activeRoomForPair(userId,partnerId){
  for(const [roomId,room] of rooms){if(!room?.dating)continue;const ids=roomUserIds(room);if(ids.includes(userId)&&ids.includes(partnerId))return {roomId,room};}return null;
}
function matchPartnerRow(match, userId) {
  const partnerId = match.user1 === userId ? match.user2 : match.user1;
  const partnerUser = db.prepare('SELECT status FROM users WHERE id=?').get(partnerId);
  if (!partnerUser || partnerUser.status !== 'active') return null;
  const partner = publicProfile(getProfile(partnerId));
  if (!partner) return null;
  const last = db.prepare('SELECT text, created_at, from_user FROM messages WHERE match_id=? ORDER BY created_at DESC LIMIT 1').get(match.id);
  return { ...partner, matchId: match.id, matchedAt: match.created_at, lastMessage: last || null };
}
function matchesFor(userId) {
  return db.prepare('SELECT * FROM matches WHERE (user1=? OR user2=?) AND active=1 ORDER BY created_at DESC').all(userId,userId)
    .map(m => matchPartnerRow(m,userId)).filter(Boolean);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const ts = now(), sessionId = safeId('ses');
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,session_id,last_seen_at) VALUES(?,?,?,?,?,?)')
    .run(hashToken(token), userId, ts, ts + SESSION_DAYS*86400000, sessionId, ts);
  return token;
}
function userFromToken(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = db.prepare(`SELECT u.id,u.email,u.status,s.expires_at,s.session_id,s.last_seen_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).get(tokenHash);
  if (!row || row.status !== 'active' || row.expires_at <= now()) return null;
  // Última actividad de la sesión, sin almacenar IP, dispositivo ni huella del navegador.
  if (!row.last_seen_at || now() - row.last_seen_at > 60*1000) db.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?').run(now(), tokenHash);
  return row;
}
function bearer(req) {
  const h = String(req.headers.authorization || '');
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}
function requireAuth(req,res,next) {
  const user = userFromToken(bearer(req));
  if (!user) return res.status(401).json({ ok:false, error:'Sesión no válida o caducada.' });
  req.user = user; next();
}
function requireAdmin(req,res,next) {
  if (!isAdmin(req.user)) return res.status(403).json({ok:false,error:'Acceso de administración no autorizado.'});
  next();
}
function logModerationAction(adminUserId, targetUserId, action, note = '', reportId = null) {
  db.prepare('INSERT INTO moderation_actions(id,report_id,admin_user,target_user,action,note,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(safeId('mod'), reportId || null, adminUserId, targetUserId || null, action, cleanShortText(note,500), now());
}
function parseEvidence(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.slice(-20).map(item => ({
      id: cleanShortText(item?.id,80),
      from: cleanShortText(item?.from,80),
      text: cleanShortText(item?.text,500),
      ts: Number(item?.ts) || 0
    })) : [];
  } catch { return []; }
}
function suspendUser(userId,until=null,reason='') {
  const limit=Number(until)||null;
  db.prepare("UPDATE users SET status='suspended',suspended_until=?,suspension_reason=? WHERE id=?").run(limit,cleanShortText(reason,240),userId);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
  disconnectUserSockets(userId,'account_suspended',{until:limit});
}
function reactivateUser(userId) {
  db.prepare("UPDATE users SET status='active',suspended_until=NULL,suspension_reason='' WHERE id=?").run(userId);
}
function reactivateExpiredSuspensions() {
  const rows=db.prepare("SELECT id FROM users WHERE status='suspended' AND suspended_until IS NOT NULL AND suspended_until<=?").all(now());
  for(const row of rows){reactivateUser(row.id);try{db.prepare('INSERT INTO moderation_actions(id,report_id,admin_user,target_user,action,note,created_at) VALUES(?,?,?,?,?,?,?)').run(safeId('mod'),null,null,row.id,'auto_reactivate','Suspensión temporal finalizada.',now());}catch{}}
  return rows.length;
}
reactivateExpiredSuspensions();
setInterval(()=>reactivateExpiredSuspensions(),10*60*1000).unref();
function clearProfilePhotos(userId) {
  deleteUserUploads(userId);
  db.prepare("UPDATE profiles SET avatar='',photos_json='[]',profile_verified=0,profile_verified_at=NULL,updated_at=? WHERE user_id=?").run(now(),userId);
}
function cleanupSessions() { db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now()); db.prepare('DELETE FROM auth_tokens WHERE expires_at <= ? OR used_at IS NOT NULL').run(now()); }
cleanupSessions();
setInterval(cleanupSessions, 60*60*1000).unref();

app.post('/api/auth/register', rateLimit({limit:8,windowMs:60*60*1000,key:req=>req.ip}), async (req,res) => {
  try {
    const email = cleanEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const confirmAdult = req.body?.confirmAdult === true;
    const acceptTerms = req.body?.acceptTerms === true;
    const referralCode = normalizeMemberReferralCode(req.body?.referralCode);
    const creatorCode = normalizeCreatorCode(req.body?.creatorCode);
    const acquisition = normalizeGrowthAcquisition(req.body?.acquisition || {});
    if (!confirmAdult) return res.status(400).json({ok:false,error:'Debes confirmar que tienes 18 años o más.'});
    if (!acceptTerms) return res.status(400).json({ok:false,error:'Debes aceptar las condiciones de uso y la política de privacidad.'});
    if (!validEmail(email)) return res.status(400).json({ ok:false, error:'Introduce un correo válido.' });
    if (Buffer.byteLength(password,'utf8') < 8 || Buffer.byteLength(password,'utf8') > 72) return res.status(400).json({ ok:false, error:'La contraseña debe tener entre 8 y 72 caracteres aprox.' });
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(409).json({ ok:false, error:'Ya existe una cuenta con ese correo.' });
    const id = safeId('usr');
    const passwordHash = hashPassword(password);
    const ts = now();
    db.prepare('INSERT INTO users(id,email,password_hash,created_at,last_seen_at,email_verified,onboarding_completed) VALUES(?,?,?,?,?,0,0)').run(id,email,passwordHash,ts,ts);
    ensureMemberReferral(id);
    if (referralCode) attributeMemberReferral(id,referralCode);
    if (creatorCode) attributeCreator(id,creatorCode);
    saveGrowthAcquisition(id,acquisition);
    recordGrowthEvent('registration_completed',{sessionId:acquisition.sessionId,userId:id,acquisition,page:acquisition.landingPath||'/'});
    db.prepare('INSERT INTO legal_acceptances(id,user_id,legal_version,adult_confirmed,terms_accepted,accepted_at) VALUES(?,?,?,?,?,?)')
      .run(safeId('legal'),id,LEGAL_VERSION,1,1,ts);
    const user = {id,email};
    let emailSent = false;
    try { emailSent = (await sendVerificationEmail(req,user)).sent; } catch (e) { console.error('Error enviando verificación:',e.message); }
    if (REQUIRE_EMAIL_VERIFICATION) return res.json({ok:true,verificationRequired:true,emailSent,user:{...user,emailVerified:false},onboardingCompleted:false});
    const token = createSession(id);
    res.json({ ok:true, token, user:{ ...user, emailVerified:false, admin:isAdmin(user) }, profile:null, plus:getPlusState(id), onboardingCompleted:false, emailVerificationPending:true, emailSent });
  } catch (e) {
    console.error(e); res.status(500).json({ ok:false, error:'No se pudo crear la cuenta.' });
  }
});

app.post('/api/auth/login', rateLimit({limit:25,windowMs:15*60*1000,key:req=>`${req.ip}:${cleanEmail(req.body?.email)}`}), async (req,res) => {
  try {
    const email = cleanEmail(req.body?.email);
    const password = String(req.body?.password || '');
    let row = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if(row?.status==='suspended' && row.suspended_until && Number(row.suspended_until)<=now()){reactivateUser(row.id);row=db.prepare('SELECT * FROM users WHERE id=?').get(row.id);}
    if (!row || row.status !== 'active' || !verifyPassword(password,row.password_hash)) return res.status(401).json({ ok:false, error:'Correo o contraseña incorrectos.' });
    if (REQUIRE_EMAIL_VERIFICATION && !row.email_verified) return res.status(403).json({ok:false,error:'Primero verifica tu correo.',verificationRequired:true});
    db.prepare('UPDATE users SET last_seen_at=? WHERE id=?').run(now(),row.id);
    const token = createSession(row.id);
    res.json({ ok:true, token, user:{id:row.id,email:row.email,emailVerified:Boolean(row.email_verified),admin:isAdmin(row)}, profile:getProfile(row.id), plus:getPlusState(row.id), onboardingCompleted:Boolean(row.onboarding_completed), beta:betaState(row.id) });
  } catch (e) {
    console.error(e); res.status(500).json({ ok:false, error:'No se pudo iniciar sesión.' });
  }
});

app.post('/api/auth/forgot', rateLimit({limit:5,windowMs:60*60*1000,key:req=>req.ip}), async (req,res) => {
  const email=cleanEmail(req.body?.email);
  const row=validEmail(email)?db.prepare("SELECT id,email FROM users WHERE email=? AND status='active'").get(email):null;
  if (row) { try { await sendResetEmail(req,row); } catch(e){ console.error('Error enviando recuperación:',e.message); } }
  res.json({ok:true,message:'Si existe una cuenta con ese correo, enviaremos un enlace para restablecer la contraseña.'});
});

app.post('/api/auth/reset', rateLimit({limit:10,windowMs:60*60*1000,key:req=>req.ip}), (req,res) => {
  try {
    const token=String(req.body?.token||''); const password=String(req.body?.password||'');
    if (Buffer.byteLength(password,'utf8') < 8 || Buffer.byteLength(password,'utf8') > 72) return res.status(400).json({ok:false,error:'La nueva contraseña debe tener entre 8 y 72 caracteres aprox.'});
    const row=consumeAuthToken(token,'reset'); if(!row)return res.status(400).json({ok:false,error:'El enlace ha caducado o ya fue utilizado.'});
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(password),row.user_id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id);
    const user=db.prepare('SELECT id,email,email_verified FROM users WHERE id=?').get(row.user_id);
    const session=createSession(row.user_id);
    const onboarding=db.prepare('SELECT onboarding_completed FROM users WHERE id=?').get(user.id);
    res.json({ok:true,token:session,user:{id:user.id,email:user.email,emailVerified:Boolean(user.email_verified),admin:isAdmin(user)},profile:getProfile(user.id),plus:getPlusState(user.id),onboardingCompleted:Boolean(onboarding?.onboarding_completed),beta:betaState(user.id)});
  } catch(e){console.error(e);res.status(500).json({ok:false,error:'No se pudo restablecer la contraseña.'});}
});

app.get('/api/auth/verify', (req,res) => {
  const row=consumeAuthToken(String(req.query.token||''),'verify');
  if(!row) return res.redirect('/?verification=invalid');
  db.prepare('UPDATE users SET email_verified=1,email_verified_at=? WHERE id=?').run(now(),row.user_id);
  res.redirect('/?verification=ok');
});

app.post('/api/auth/resend-verification', rateLimit({limit:4,windowMs:60*60*1000,key:req=>req.ip}), async (req,res) => {
  const email=cleanEmail(req.body?.email);
  const row=db.prepare("SELECT id,email,email_verified FROM users WHERE email=? AND status='active'").get(email);
  if(row && !row.email_verified){try{await sendVerificationEmail(req,row);}catch(e){console.error(e.message);}}
  res.json({ok:true,message:'Si la cuenta está pendiente, se ha generado un nuevo enlace de verificación.'});
});

app.post('/api/auth/logout', requireAuth, (req,res) => {
  const token = bearer(req); db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
  res.json({ ok:true });
});

app.get('/api/me', requireAuth, (req,res) => {
  const full=db.prepare('SELECT email_verified,onboarding_completed FROM users WHERE id=?').get(req.user.id);
  res.json({ ok:true, user:{id:req.user.id,email:req.user.email,emailVerified:Boolean(full?.email_verified),admin:isAdmin(req.user)}, profile:getProfile(req.user.id), communityCity:communityCityForUser(req.user.id), matches:matchesFor(req.user.id), plus:getPlusState(req.user.id), notificationState:notificationState(req.user.id), onboardingCompleted:Boolean(full?.onboarding_completed), activation:activationState(req.user.id), beta:betaState(req.user.id) });
});

app.get('/api/activation/me', requireAuth, rateLimit({limit:180,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  res.json({ok:true,activation:activationState(req.user.id)});
});

app.post('/api/account/onboarding-complete', requireAuth, (req,res) => {
  db.prepare('UPDATE users SET onboarding_completed=1 WHERE id=?').run(req.user.id);
  res.json({ok:true,onboardingCompleted:true});
});


app.get('/api/beta/status', requireAuth, (req,res) => {
  res.json({ok:true,beta:betaState(req.user.id)});
});

app.post('/api/beta/activity', requireAuth, rateLimit({limit:30,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  const state=betaState(req.user.id);
  if(!state.active)return res.json({ok:true,beta:state,tracked:false});
  const activity=touchBetaActivity(req.user.id);
  res.json({ok:true,beta:betaState(req.user.id),tracked:Boolean(activity)});
});

app.post('/api/beta/feedback', requireAuth, rateLimit({limit:6,windowMs:24*60*60*1000,key:req=>req.user.id}), (req,res) => {
  const state=betaState(req.user.id);
  if(!state.active)return res.status(403).json({ok:false,error:'Este formulario está disponible para participantes activos de la beta.'});
  const rating=clampInt(req.body?.rating,1,5,0);
  const category=['general','onboarding','discover','matches','chat','games','mobile','bug','idea'].includes(String(req.body?.category||''))?String(req.body.category):'general';
  const message=cleanShortText(req.body?.message,1600),page=cleanShortText(req.body?.page,120).split('?')[0];
  if(!rating)return res.status(400).json({ok:false,error:'Elige una valoración del 1 al 5.'});
  if(message.length<8)return res.status(400).json({ok:false,error:'Cuéntanos brevemente qué mejorarías o qué te ha gustado.'});
  const id=safeId('beta_fb'),ts=now();
  db.prepare("INSERT INTO beta_feedback(id,user_id,rating,category,message,page,status,admin_note,created_at,updated_at) VALUES(?,?,?,?,?,?,'open','',?,NULL)")
    .run(id,req.user.id,rating,category,message,page,ts);
  recordGrowthEvent('beta_feedback',{userId:req.user.id,page,metadata:{rating,category}});
  res.json({ok:true,id,beta:betaState(req.user.id),message:'Gracias. Tu opinión ha quedado guardada para revisar la beta.'});
});

app.get('/api/notifications', requireAuth, (req,res) => {
  res.json({ok:true,...notificationState(req.user.id)});
});
app.post('/api/notifications/read-all', requireAuth, (req,res) => {
  db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(now(),req.user.id);
  res.json({ok:true,unread:0});
});
app.post('/api/notifications/:id/read', requireAuth, (req,res) => {
  const id=String(req.params.id||'');
  db.prepare('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?').run(now(),id,req.user.id);
  res.json({ok:true,unread:unreadNotificationCount(req.user.id)});
});
app.get('/api/notification-preferences', requireAuth, (req,res) => {
  res.json({ok:true,preferences:notificationPreferences(req.user.id),pushConfigured:PUSH_CONFIGURED});
});
app.put('/api/notification-preferences', requireAuth, (req,res) => {
  const current=notificationPreferences(req.user.id), ts=now();
  const next={
    newMatch:bool01(req.body?.newMatch,current.newMatch),
    newMessage:bool01(req.body?.newMessage,current.newMessage),
    gameInvite:bool01(req.body?.gameInvite,current.gameInvite),
    gameTurn:bool01(req.body?.gameTurn,current.gameTurn),
    retentionEmail:bool01(req.body?.retentionEmail,current.retentionEmail),
    newsletterEmail:bool01(req.body?.newsletterEmail,current.newsletterEmail),
    cityActivity:bool01(req.body?.cityActivity,current.cityActivity),
    recommendations:bool01(req.body?.recommendations,current.recommendations),
    reactivationPush:bool01(req.body?.reactivationPush,current.reactivationPush),
    quietHoursEnabled:bool01(req.body?.quietHoursEnabled,current.quietHoursEnabled),
    quietStart:cleanClock(req.body?.quietStart,current.quietStart),
    quietEnd:cleanClock(req.body?.quietEnd,current.quietEnd),
    timezone:cleanTimezone(req.body?.timezone||current.timezone),
    pushEnabled:bool01(req.body?.pushEnabled,current.pushEnabled)
  };
  db.prepare(`INSERT INTO notification_preferences(user_id,new_match,new_message,game_invite,game_turn,retention_email,newsletter_email,city_activity,recommendations,reactivation_push,quiet_hours_enabled,quiet_start,quiet_end,timezone,push_enabled,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET new_match=excluded.new_match,new_message=excluded.new_message,
    game_invite=excluded.game_invite,game_turn=excluded.game_turn,retention_email=excluded.retention_email,newsletter_email=excluded.newsletter_email,city_activity=excluded.city_activity,
    recommendations=excluded.recommendations,reactivation_push=excluded.reactivation_push,quiet_hours_enabled=excluded.quiet_hours_enabled,
    quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,timezone=excluded.timezone,push_enabled=excluded.push_enabled,updated_at=excluded.updated_at`)
    .run(req.user.id,next.newMatch,next.newMessage,next.gameInvite,next.gameTurn,next.retentionEmail,next.newsletterEmail,next.cityActivity,next.recommendations,next.reactivationPush,next.quietHoursEnabled,next.quietStart,next.quietEnd,next.timezone,next.pushEnabled,ts);
  res.json({ok:true,preferences:notificationPreferences(req.user.id),pushConfigured:PUSH_CONFIGURED});
});
app.get('/api/push/config', requireAuth, (req,res) => {
  res.json({ok:true,configured:PUSH_CONFIGURED,publicKey:PUSH_CONFIGURED?VAPID_PUBLIC_KEY:''});
});
app.post('/api/push/subscribe', requireAuth, (req,res) => {
  if (!PUSH_CONFIGURED) return res.status(503).json({ok:false,error:'El push en segundo plano todavía no está configurado en el servidor.'});
  const subscription=req.body?.subscription||req.body;
  const endpoint=String(subscription?.endpoint||'').slice(0,2000);
  const p256dh=String(subscription?.keys?.p256dh||'').slice(0,512);
  const auth=String(subscription?.keys?.auth||'').slice(0,512);
  if(!endpoint.startsWith('https://')||!p256dh||!auth)return res.status(400).json({ok:false,error:'Suscripción push no válida.'});
  const ts=now();
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id<>?').run(endpoint,req.user.id);
  const existing=db.prepare('SELECT id FROM push_subscriptions WHERE user_id=? AND endpoint=?').get(req.user.id,endpoint);
  if(existing) db.prepare('UPDATE push_subscriptions SET p256dh=?,auth=?,updated_at=? WHERE id=?').run(p256dh,auth,ts,existing.id);
  else db.prepare('INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(safeId('push'),req.user.id,endpoint,p256dh,auth,ts,ts);
  const p=notificationPreferences(req.user.id);
  db.prepare(`INSERT INTO notification_preferences(user_id,new_match,new_message,game_invite,game_turn,retention_email,push_enabled,updated_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET push_enabled=1,updated_at=excluded.updated_at`)
    .run(req.user.id,p.newMatch?1:0,p.newMessage?1:0,p.gameInvite?1:0,p.gameTurn?1:0,p.retentionEmail?1:0,1,ts);
  res.json({ok:true,preferences:notificationPreferences(req.user.id)});
});
app.post('/api/push/unsubscribe', requireAuth, (req,res) => {
  const endpoint=String(req.body?.endpoint||'').slice(0,2000);
  if(endpoint)db.prepare('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?').run(req.user.id,endpoint);
  else db.prepare('DELETE FROM push_subscriptions WHERE user_id=?').run(req.user.id);
  const remaining=Number(db.prepare('SELECT COUNT(*) n FROM push_subscriptions WHERE user_id=?').get(req.user.id)?.n||0);
  db.prepare('UPDATE notification_preferences SET push_enabled=?,updated_at=? WHERE user_id=?').run(remaining?1:0,now(),req.user.id);
  res.json({ok:true,preferences:notificationPreferences(req.user.id)});
});
app.post('/api/push/open', requireAuth, (req,res) => {
  const notificationId=cleanShortText(req.body?.notificationId,80);
  if(!notificationId)return res.status(400).json({ok:false,error:'Notificación no válida.'});
  const owned=db.prepare('SELECT 1 FROM notifications WHERE id=? AND user_id=?').get(notificationId,req.user.id);
  if(!owned)return res.status(404).json({ok:false,error:'Notificación no encontrada.'});
  db.prepare('UPDATE push_delivery_log SET opened_at=COALESCE(opened_at,?) WHERE notification_id=? AND user_id=?').run(now(),notificationId,req.user.id);
  res.json({ok:true});
});

app.put('/api/profile', requireAuth, (req,res) => {
  try {
    const userId = req.user.id;
    const name = cleanName(req.body?.nombre);
    const age = Number(req.body?.edad);
    if (name.length < 2) return res.status(400).json({ok:false,error:'Escribe un nombre válido.'});
    if (!Number.isInteger(age) || age < 18 || age > 99) return res.status(400).json({ok:false,error:'V/R Match es solo para mayores de 18 años.'});
    const existing = getProfile(userId);
    const firstProfileSave = !existing;
    const photosInput = Array.isArray(req.body?.fotos) ? req.body.fotos : (existing?.fotos || []);
    const photos = savePhotos(userId, photosInput);
    const hasAvatarField = Object.prototype.hasOwnProperty.call(req.body || {}, 'avatar');
    const safeExistingAvatar = cleanAvatar(userId, existing?.avatar || '');
    const avatarInput = hasAvatarField ? req.body.avatar : (photos[0] || safeExistingAvatar || '');
    const avatar = cleanAvatar(userId, avatarInput) || (hasAvatarField ? '' : (photos[0] || safeExistingAvatar || ''));
    const ageMin = Math.max(18, Math.min(99, Number(req.body?.preferences?.ageMin) || 18));
    const ageMax = Math.max(ageMin, Math.min(99, Number(req.body?.preferences?.ageMax) || 99));
    const existingRow = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(userId);
    const radiusKm = cleanRadius(req.body?.preferences?.radiusKm, existingRow?.radius_km || 50);
    let locationLat = existingRow?.location_lat ?? null;
    let locationLng = existingRow?.location_lng ?? null;
    let locationUpdatedAt = existingRow?.location_updated_at ?? null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'location')) {
      const location = req.body?.location || {};
      if (location.clear === true) {
        locationLat = null; locationLng = null; locationUpdatedAt = null;
      } else {
        const lat = normalizeCoordinate(location.lat, -90, 90);
        const lng = normalizeCoordinate(location.lng, -180, 180);
        if (lat === null || lng === null) return res.status(400).json({ok:false,error:'La ubicación recibida no es válida.'});
        locationLat = lat; locationLng = lng; locationUpdatedAt = now();
      }
    }
    let communityCity=communityCityForUser(userId);
    if (!communityCity && cleanShortText(req.body?.ciudad,40)) communityCity=setCommunityCityForUser(userId,req.body.ciudad);
    const profileCity=communityCity?.name || cleanShortText(req.body?.ciudad,40);
    if (!profileCity) return res.status(400).json({ok:false,error:'Elige tu ciudad antes de completar el perfil.'});
    const values = {
      name, age, gender:cleanGender(req.body?.gender), city:profileCity, bio:cleanShortText(req.body?.bio,180),
      interests:cleanInterests(req.body?.intereses), avatar, photos,
      ageMin, ageMax, lookingFor:cleanLooking(req.body?.preferences?.lookingFor), cityPref:cleanShortText(req.body?.preferences?.city,40), interestPref:cleanShortText(req.body?.preferences?.interest,30), radiusKm,
      locationLat, locationLng, locationUpdatedAt,
      discoverable:bool01(req.body?.privacy?.discoverable, existing?.privacy?.discoverable ?? true), showOnline:bool01(req.body?.privacy?.showOnline, existing?.privacy?.showOnline ?? true), allowGameInvites:bool01(req.body?.privacy?.allowGameInvites, existing?.privacy?.allowGameInvites ?? true), communityPublic:bool01(req.body?.privacy?.communityPublic, existing?.privacy?.communityPublic ?? false)
    };
    db.prepare(`INSERT INTO profiles(user_id,name,age,gender,city,bio,interests_json,avatar,photos_json,age_min,age_max,looking_for,city_pref,interest_pref,radius_km,location_lat,location_lng,location_updated_at,discoverable,show_online,allow_game_invites,community_public,updated_at)
      VALUES(@userId,@name,@age,@gender,@city,@bio,@interests,@avatar,@photos,@ageMin,@ageMax,@lookingFor,@cityPref,@interestPref,@radiusKm,@locationLat,@locationLng,@locationUpdatedAt,@discoverable,@showOnline,@allowGameInvites,@communityPublic,@updatedAt)
      ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,age=excluded.age,gender=excluded.gender,city=excluded.city,bio=excluded.bio,interests_json=excluded.interests_json,avatar=excluded.avatar,photos_json=excluded.photos_json,age_min=excluded.age_min,age_max=excluded.age_max,looking_for=excluded.looking_for,city_pref=excluded.city_pref,interest_pref=excluded.interest_pref,radius_km=excluded.radius_km,location_lat=excluded.location_lat,location_lng=excluded.location_lng,location_updated_at=excluded.location_updated_at,discoverable=excluded.discoverable,show_online=excluded.show_online,allow_game_invites=excluded.allow_game_invites,community_public=excluded.community_public,updated_at=excluded.updated_at`)
      .run({userId,...values,interests:JSON.stringify(values.interests),photos:JSON.stringify(values.photos),updatedAt:now()});
    cleanupUnusedUploads(userId,[...photos,avatar].filter(x=>String(x).startsWith('/uploads/')));
    const profile = getProfile(userId);
    if(firstProfileSave) recordFirstUserGrowthEvent(userId,'profile_completed',{city:profile?.ciudad||''});
    maybeRecordProfileReady(userId,profile);
    refreshReferrerRewardsForInvitee(userId);
    broadcastDiscovery();
    res.json({ok:true,profile,activation:activationState(userId)});
  } catch (e) {
    console.error(e); res.status(500).json({ok:false,error:'No se pudo guardar el perfil.'});
  }
});

app.post('/api/account/change-password', requireAuth, rateLimit({limit:8,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  const current=String(req.body?.currentPassword||''), next=String(req.body?.newPassword||'');
  const row=db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
  if(!row||!verifyPassword(current,row.password_hash))return res.status(400).json({ok:false,error:'La contraseña actual no es correcta.'});
  if(Buffer.byteLength(next,'utf8')<8||Buffer.byteLength(next,'utf8')>72)return res.status(400).json({ok:false,error:'La nueva contraseña debe tener entre 8 y 72 caracteres aprox.'});
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(next),req.user.id);
  const currentHash=hashToken(bearer(req)); db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(req.user.id,currentHash);
  res.json({ok:true});
});

app.put('/api/account/privacy', requireAuth, (req,res) => {
  const p=getProfile(req.user.id); if(!p)return res.status(400).json({ok:false,error:'Completa tu perfil primero.'});
  db.prepare('UPDATE profiles SET discoverable=?,show_online=?,allow_game_invites=?,community_public=?,updated_at=? WHERE user_id=?').run(bool01(req.body?.discoverable,p.privacy.discoverable),bool01(req.body?.showOnline,p.privacy.showOnline),bool01(req.body?.allowGameInvites,p.privacy.allowGameInvites),bool01(req.body?.communityPublic,p.privacy.communityPublic),now(),req.user.id);
  broadcastDiscovery(); res.json({ok:true,privacy:getProfile(req.user.id).privacy});
});


app.get('/api/account/sessions', requireAuth, (req,res) => {
  const currentHash = hashToken(bearer(req));
  const rows = db.prepare('SELECT token_hash,session_id,created_at,last_seen_at,expires_at FROM sessions WHERE user_id=? AND expires_at>? ORDER BY last_seen_at DESC,created_at DESC').all(req.user.id,now());
  res.json({ok:true,sessions:rows.map(row=>({
    id:row.session_id,
    createdAt:row.created_at,
    lastSeenAt:row.last_seen_at || row.created_at,
    expiresAt:row.expires_at,
    current:row.token_hash===currentHash
  }))});
});

app.delete('/api/account/sessions/:id', requireAuth, rateLimit({limit:20,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  const sessionId=cleanShortText(req.params.id,80);
  const row=db.prepare('SELECT token_hash FROM sessions WHERE session_id=? AND user_id=?').get(sessionId,req.user.id);
  if(!row)return res.status(404).json({ok:false,error:'Sesión no encontrada.'});
  if(row.token_hash===hashToken(bearer(req)))return res.status(400).json({ok:false,error:'Para cerrar esta sesión usa Cerrar sesión.'});
  db.prepare('DELETE FROM sessions WHERE session_id=? AND user_id=?').run(sessionId,req.user.id);
  res.json({ok:true});
});

app.post('/api/account/sessions/revoke-others', requireAuth, rateLimit({limit:10,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  const currentHash=hashToken(bearer(req));
  const result=db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(req.user.id,currentHash);
  res.json({ok:true,revoked:Number(result.changes||0)});
});

app.get('/api/account/blocked', requireAuth, (req,res) => {
  const rows=db.prepare(`SELECT b.blocked AS id,b.created_at,p.name,p.avatar,p.city
    FROM blocks b LEFT JOIN profiles p ON p.user_id=b.blocked
    WHERE b.blocker=? ORDER BY b.created_at DESC`).all(req.user.id);
  res.json({ok:true,blocked:rows.map(row=>({id:row.id,nombre:row.name||'Perfil',avatar:row.avatar||'',ciudad:row.city||'',blockedAt:row.created_at}))});
});

app.delete('/api/account/blocked/:userId', requireAuth, rateLimit({limit:30,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  const target=String(req.params.userId||'');
  const result=db.prepare('DELETE FROM blocks WHERE blocker=? AND blocked=?').run(req.user.id,target);
  if(!result.changes)return res.status(404).json({ok:false,error:'Ese perfil no estaba en tu lista de bloqueados.'});
  broadcastDiscovery();
  res.json({ok:true});
});

app.get('/api/profile/verification', requireAuth, (req,res) => {
  res.json({ok:true,...verificationState(req.user.id)});
});

app.post('/api/profile/verification/request', requireAuth, rateLimit({limit:3,windowMs:24*60*60*1000,key:req=>req.user.id}), (req,res) => {
  const user=db.prepare("SELECT email_verified,status FROM users WHERE id=?").get(req.user.id);
  if(!user || user.status!=='active')return res.status(403).json({ok:false,error:'Cuenta no disponible.'});
  if(!user.email_verified)return res.status(403).json({ok:false,error:'Verifica primero tu correo.'});
  const profile=getProfile(req.user.id);
  if(!profile || !profile.nombre || !Array.isArray(profile.fotos) || profile.fotos.length<1)return res.status(400).json({ok:false,error:'Completa tu perfil y añade al menos una foto pública antes de solicitar la verificación.'});
  if(profile.profileVerified)return res.status(409).json({ok:false,error:'Tu perfil ya está verificado.'});
  const pending=db.prepare("SELECT id FROM profile_verification_requests WHERE user_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1").get(req.user.id);
  if(pending)return res.status(409).json({ok:false,error:'Ya tienes una solicitud pendiente de revisión.'});
  const filename=saveVerificationImage(req.user.id,req.body?.image);
  if(!filename)return res.status(400).json({ok:false,error:'La selfie no es válida o supera 2,2 MB. Prueba con otra imagen.'});
  const id=safeId('ver'),ts=now();
  db.prepare('INSERT INTO profile_verification_requests(id,user_id,proof_filename,status,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,req.user.id,filename,'pending',ts,ts);
  res.json({ok:true,...verificationState(req.user.id),message:'Solicitud enviada. La selfie es privada y solo se usa para esta revisión.'});
});

app.get('/api/account/export', requireAuth, rateLimit({limit:3,windowMs:24*60*60*1000,key:req=>req.user.id}), (req,res) => {
  try {
    const userId=req.user.id;
    const user=db.prepare('SELECT id,email,status,created_at,last_seen_at,email_verified,email_verified_at,onboarding_completed FROM users WHERE id=?').get(userId);
    const profileRow=db.prepare('SELECT * FROM profiles WHERE user_id=?').get(userId);
    const profile=getProfile(userId);
    const legal=db.prepare('SELECT legal_version,adult_confirmed,terms_accepted,accepted_at FROM legal_acceptances WHERE user_id=? ORDER BY accepted_at ASC').all(userId);
    const likes=db.prepare('SELECT to_user,created_at FROM likes WHERE from_user=? ORDER BY created_at ASC').all(userId);
    const passes=db.prepare('SELECT to_user,created_at FROM passes WHERE from_user=? ORDER BY created_at ASC').all(userId);
    const blocks=db.prepare('SELECT blocked,created_at FROM blocks WHERE blocker=? ORDER BY created_at ASC').all(userId);
    const reports=db.prepare('SELECT id,reported,reason,details,created_at,status,updated_at,moderator_note FROM reports WHERE reporter=? ORDER BY created_at ASC').all(userId);
    const feedback=db.prepare('SELECT id,kind,message,page,created_at,status,admin_note,updated_at FROM feedback WHERE user_id=? ORDER BY created_at ASC').all(userId);
    const beta=betaState(userId);
    const betaActivity=db.prepare('SELECT day,first_seen_at,last_seen_at,opens FROM beta_activity_days WHERE user_id=? ORDER BY day ASC').all(userId);
    const betaFeedback=db.prepare('SELECT id,rating,category,message,page,status,admin_note,created_at,updated_at FROM beta_feedback WHERE user_id=? ORDER BY created_at ASC').all(userId);
    const notifications=db.prepare('SELECT id,source_user,type,title,body,data_json,created_at,read_at FROM notifications WHERE user_id=? ORDER BY created_at ASC').all(userId).map(n=>({...n,data:safeJsonObject(n.data_json),data_json:undefined}));
    const retentionEmails=db.prepare('SELECT kind,context_key,sent_at,status FROM retention_email_log WHERE user_id=? ORDER BY sent_at ASC').all(userId);
    const newsletterEmails=db.prepare(`SELECT q.status,q.created_at,q.sent_at,c.subject,c.title,c.audience_city FROM newsletter_queue q JOIN newsletter_campaigns c ON c.id=q.campaign_id WHERE q.user_id=? ORDER BY q.created_at ASC`).all(userId);
    const pushHistory=db.prepare('SELECT notification_id,kind,source,status,sent_at,opened_at,created_at FROM push_delivery_log WHERE user_id=? ORDER BY created_at ASC').all(userId);
    const pushSubscriptions=db.prepare('SELECT endpoint,created_at,updated_at FROM push_subscriptions WHERE user_id=? ORDER BY created_at ASC').all(userId);
    const verification=verificationState(userId);
    const securityEvents=db.prepare('SELECT kind,severity,metadata_json,created_at FROM security_events WHERE user_id=? ORDER BY created_at ASC').all(userId).map(e=>({...e,metadata:safeJsonObject(e.metadata_json),metadata_json:undefined}));
    const referralStats=memberReferralStats(userId);
    const referralAttribution=db.prepare('SELECT referral_code,attributed_at FROM user_referral_attributions WHERE invitee_user_id=?').get(userId)||null;
    const creatorAttribution=db.prepare('SELECT code,attributed_at FROM creator_attributions WHERE user_id=?').get(userId)||null;
    const referralRewards=db.prepare('SELECT reward_key,granted_at,consumed_at FROM referral_rewards WHERE user_id=? ORDER BY granted_at ASC').all(userId);
    const growthAcquisition=growthAcquisitionForUser(userId);
    const growthEvents=db.prepare('SELECT event_name,source,medium,campaign,content,term,landing_path,page,metadata_json,created_at FROM growth_events WHERE user_id=? ORDER BY created_at ASC').all(userId).map(e=>({...e,metadata:safeJsonObject(e.metadata_json),metadata_json:undefined}));
    const gameSessions=db.prepare(`SELECT id,match_id,user1,user2,deck,started_at,core_completed_at,ended_at,status,finish_reason,total_turns,sync_rounds,coincidences,guess_hits,reactions,personalized_sync,extended,duration_seconds
      FROM game_sessions WHERE user1=? OR user2=? ORDER BY started_at ASC`).all(userId,userId).map(g=>({...g,partner_id:g.user1===userId?g.user2:g.user1,user1:undefined,user2:undefined}));
    const quickChallenges=db.prepare(`SELECT q.id,q.match_id,q.created_by,q.prompt,q.option_a,q.option_b,q.status,q.created_at,q.closed_at FROM quick_challenges q JOIN matches m ON m.id=q.match_id WHERE m.user1=? OR m.user2=? ORDER BY q.created_at ASC`).all(userId,userId);
    const quickAnswers=db.prepare('SELECT challenge_id,choice,answered_at FROM quick_challenge_answers WHERE user_id=? ORDER BY answered_at ASC').all(userId);
    const gameInvitations=db.prepare(`SELECT id,match_id,from_user,to_user,deck,status,created_at,expires_at,responded_at FROM game_invitations WHERE from_user=? OR to_user=? ORDER BY created_at ASC`).all(userId,userId).map(x=>({...x,direction:x.from_user===userId?'sent':'received',from_user:undefined,to_user:undefined}));
    const matches=db.prepare('SELECT * FROM matches WHERE user1=? OR user2=? ORDER BY created_at ASC').all(userId,userId).map(m=>{
      const partnerId=m.user1===userId?m.user2:m.user1;
      const partner=publicProfile(getProfile(partnerId));
      const messages=db.prepare('SELECT id,from_user,text,created_at FROM messages WHERE match_id=? ORDER BY created_at ASC').all(m.id).map(msg=>({id:msg.id,from:msg.from_user===userId?'me':'partner',text:msg.text,createdAt:msg.created_at}));
      return {id:m.id,createdAt:m.created_at,active:Boolean(m.active),partner:partner?{id:partner.id,nombre:partner.nombre,ciudad:partner.ciudad}: {id:partnerId},messages};
    });
    const exportData={
      product:'V/R Match',formatVersion:1,appVersion:APP_VERSION,generatedAt:now(),
      account:{id:user.id,email:user.email,status:user.status,createdAt:user.created_at,lastSeenAt:user.last_seen_at,emailVerified:Boolean(user.email_verified),emailVerifiedAt:user.email_verified_at||null,onboardingCompleted:Boolean(user.onboarding_completed)},
      profile: profile ? {...profile,storedLocation:profileRow&&hasStoredLocation(profileRow)?{lat:Number(profileRow.location_lat),lng:Number(profileRow.location_lng),updatedAt:profileRow.location_updated_at}:null}:null,
      plus:getPlusState(userId),notificationPreferences:notificationPreferences(userId),legalAcceptances:legal,
      referrals:{...referralStats,referredBy:referralAttribution?{referralCode:referralAttribution.referral_code,attributedAt:referralAttribution.attributed_at}:null,rewards:referralRewards},
      creatorAttribution:creatorAttribution?{code:creatorAttribution.code,attributedAt:creatorAttribution.attributed_at}:null,
      acquisition:growthAcquisition,growthEvents,
      communityCity:communityCityForUser(userId),verification,securityEvents,
      likesSent:likes,passesSent:passes,blockedUsers:blocks,reportsMade:reports,feedback,beta,betaActivity,betaFeedback,notifications,retentionEmails,newsletterEmails,pushHistory,pushSubscriptions,gameSessions,gameInvitations,quickChallenges,quickAnswers,matches
    };
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="vr-match-mis-datos.json"');
    res.setHeader('Cache-Control','no-store');
    res.send(JSON.stringify(exportData,null,2));
  } catch(e){console.error('Error exportando cuenta:',e);res.status(500).json({ok:false,error:'No se pudieron preparar tus datos.'});}
});

app.get('/api/game-history', requireAuth, rateLimit({limit:90,windowMs:60*1000,key:req=>req.user.id}), (req,res) => {
  const partnerId=String(req.query.partnerId||'');
  if(!partnerId)return res.status(400).json({ok:false,error:'Falta el Match.'});
  if(!getActiveMatch(req.user.id,partnerId)||blockedEitherWay(req.user.id,partnerId))return res.status(404).json({ok:false,error:'Ese Match ya no está disponible.'});
  res.json({ok:true,history:gameHistoryForPair(req.user.id,partnerId)});
});

app.post('/api/account/delete', requireAuth, rateLimit({limit:3,windowMs:24*60*60*1000,key:req=>req.user.id}), async (req,res) => {
  const password=String(req.body?.password||''); const row=db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
  if(!row||!verifyPassword(password,row.password_hash))return res.status(400).json({ok:false,error:'Contraseña incorrecta.'});
  const billing=billingSubscriptionForUser(req.user.id);
  if(billing && ['active','trialing','past_due'].includes(billing.status)){
    if(!STRIPE_SECRET_KEY)return res.status(503).json({ok:false,error:'Tu cuenta tiene una suscripción vinculada y el servidor no puede cancelarla ahora. Contacta con soporte antes de borrar la cuenta.'});
    try{const canceled=await cancelStripeSubscription(billing.subscription_id);syncStripeSubscription(canceled);}catch(e){console.error('Cancelación antes de borrar cuenta:',cleanShortText(e.message,220));return res.status(502).json({ok:false,error:'No pudimos cancelar la suscripción. La cuenta no se borró para evitar un cobro posterior.'});}
  }
  db.prepare('DELETE FROM growth_events WHERE user_id=?').run(req.user.id);
  const referralRow=db.prepare('SELECT referral_code FROM user_referrals WHERE user_id=?').get(req.user.id);
  if(referralRow?.referral_code){
    db.prepare('DELETE FROM user_referral_events WHERE referral_code=? OR user_id=?').run(referralRow.referral_code,req.user.id);
    db.prepare("UPDATE user_referral_attributions SET referrer_user_id=NULL,referral_code='DELETED' WHERE referrer_user_id=?").run(req.user.id);
  } else db.prepare('DELETE FROM user_referral_events WHERE user_id=?').run(req.user.id);
  disconnectUserSockets(req.user.id,'account_deleted',{}); deleteUserUploads(req.user.id); deleteVerificationFilesForUser(req.user.id); db.prepare('DELETE FROM users WHERE id=?').run(req.user.id); onlineUsers.delete(req.user.id); broadcastDiscovery();
  res.json({ok:true});
});


app.get('/api/billing/status', requireAuth, (req,res) => res.json({ok:true,billing:billingPublicState(req.user.id)}));

app.post('/api/billing/checkout', requireAuth, rateLimit({limit:8,windowMs:60*60*1000,key:req=>req.user.id}), async (req,res) => {
  if(freePremiumDuringLaunch())return res.status(409).json({ok:false,error:'V/R+ está incluido gratis durante el lanzamiento. No necesitas pagar ni añadir una tarjeta.'});
  if(!billingConfigured())return res.status(503).json({ok:false,error:'El cobro V/R+ todavía no está activado.'});
  const full=db.prepare('SELECT email,email_verified FROM users WHERE id=?').get(req.user.id);
  if(!full?.email_verified)return res.status(403).json({ok:false,error:'Verifica tu correo antes de contratar V/R+.'});
  const current=getPlusState(req.user.id);
  if(current.active && current.source!=='stripe')return res.status(409).json({ok:false,error:'Tu acceso V/R+ ya está activo. Podrás suscribirte cuando finalice ese acceso.'});
  const existing=billingSubscriptionForUser(req.user.id);
  if(existing && ['active','trialing'].includes(existing.status))return res.status(409).json({ok:false,error:'Ya tienes una suscripción V/R+ activa. Usa Gestionar suscripción.'});
  try{
    const customer=await ensureStripeCustomer(req.user.id,full.email);
    const session=await stripeRequest('/checkout/sessions',{params:{
      mode:'subscription',customer,'line_items[0][price]':STRIPE_PRICE_PLUS_MONTHLY,'line_items[0][quantity]':'1',
      client_reference_id:req.user.id,'metadata[user_id]':req.user.id,'subscription_data[metadata][user_id]':req.user.id,
      success_url:`${APP_BASE_URL}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${APP_BASE_URL}/?billing=cancel`,allow_promotion_codes:'true'
    }});
    res.json({ok:true,url:String(session.url||'')});
  }catch(e){console.error('Stripe checkout:',cleanShortText(e.message,220));res.status(502).json({ok:false,error:'No se pudo abrir el pago. Inténtalo de nuevo.'});}
});

app.post('/api/billing/portal', requireAuth, rateLimit({limit:12,windowMs:60*60*1000,key:req=>req.user.id}), async (req,res) => {
  if(!billingConfigured())return res.status(503).json({ok:false,error:'La gestión de cobros todavía no está activada.'});
  const customer=billingCustomerForUser(req.user.id); if(!customer)return res.status(404).json({ok:false,error:'No hay una suscripción de pago asociada a esta cuenta.'});
  try{
    const session=await stripeRequest('/billing_portal/sessions',{params:{customer,return_url:`${APP_BASE_URL}/?billing=portal`}});
    res.json({ok:true,url:String(session.url||'')});
  }catch(e){console.error('Stripe portal:',cleanShortText(e.message,220));res.status(502).json({ok:false,error:'No se pudo abrir la gestión de suscripción.'});}
});

app.get('/api/plus', requireAuth, (req,res) => {
  res.json({ok:true,plus:getPlusState(req.user.id)});
});

app.put('/api/plus/settings', requireAuth, requirePlus, (req,res) => {
  const verifiedOnly = bool01(req.body?.verifiedOnly,false);
  const minSharedInterests = Math.max(0,Math.min(3,Number(req.body?.minSharedInterests)||0));
  const sortMode = ['smart','distance','interests','recent'].includes(String(req.body?.sortMode||'')) ? String(req.body.sortMode) : 'smart';
  db.prepare(`INSERT INTO plus_settings(user_id,verified_only,min_shared_interests,sort_mode,updated_at)
    VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET verified_only=excluded.verified_only,
    min_shared_interests=excluded.min_shared_interests,sort_mode=excluded.sort_mode,updated_at=excluded.updated_at`)
    .run(req.user.id,verifiedOnly,minSharedInterests,sortMode,now());
  const plus=getPlusState(req.user.id);
  emitToUser(req.user.id,'plus_state',plus);
  emitToUser(req.user.id,'dating_profiles',discoverFor(req.user.id));
  res.json({ok:true,plus});
});

app.post('/api/plus/boost', requireAuth, requirePlus, (req,res) => {
  const state = plusBoostState(req.user.id);
  if (state.active) return res.status(409).json({ok:false,error:'Tu Boost ya está activo.',plus:getPlusState(req.user.id)});
  if (!state.available) return res.status(429).json({ok:false,error:'Tu siguiente Boost estará disponible más tarde.',plus:getPlusState(req.user.id)});
  const ts=now(), activeUntil=ts+30*60*1000;
  db.prepare(`INSERT INTO plus_boosts(user_id,active_until,last_used_at) VALUES(?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET active_until=excluded.active_until,last_used_at=excluded.last_used_at`)
    .run(req.user.id,activeUntil,ts);
  const plus=getPlusState(req.user.id);
  emitToUser(req.user.id,'plus_state',plus);
  broadcastDiscovery();
  res.json({ok:true,plus});
});

app.post('/api/feedback', requireAuth, rateLimit({limit:8,windowMs:24*60*60*1000,key:req=>req.user.id}), (req,res) => {
  const kind = ['bug','idea','ux','other'].includes(String(req.body?.kind||'')) ? String(req.body.kind) : 'other';
  const message = cleanShortText(req.body?.message,1200);
  const page = cleanShortText(req.body?.page,120).split('?')[0];
  if (message.length < 10) return res.status(400).json({ok:false,error:'Cuéntanos un poco más para poder revisarlo.'});
  const id = safeId('fb');
  db.prepare('INSERT INTO feedback(id,user_id,kind,message,page,created_at,status,admin_note,updated_at) VALUES(?,?,?,?,?,?,\'open\',\'\',NULL)')
    .run(id,req.user.id,kind,message,page,now());
  res.json({ok:true,id,message:'Gracias. Tu comentario quedó enviado al equipo.'});
});

app.post('/api/telemetry/client-error', requireAuth, rateLimit({limit:20,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  const message = cleanShortText(req.body?.message,300);
  if (!message) return res.json({ok:true});
  const source = cleanShortText(req.body?.source,120);
  const page = cleanShortText(req.body?.page,120).split('?')[0];
  const line = clampInt(req.body?.line,0,1000000,0);
  const column = clampInt(req.body?.column,0,1000000,0);
  const duplicate = db.prepare('SELECT 1 FROM client_errors WHERE user_id=? AND message=? AND created_at>=? LIMIT 1').get(req.user.id,message,now()-5*60*1000);
  if (!duplicate) db.prepare('INSERT INTO client_errors(id,user_id,message,source,line,column_no,page,app_version,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(safeId('err'),req.user.id,message,source,line,column,page,APP_VERSION,now());
  res.json({ok:true});
});


// ---- CRECIMIENTO VIRAL · API DE REFERIDOS ----
// ---- COMUNIDAD POR CIUDADES · registro abierto ----
app.get('/api/community/cities', rateLimit({limit:180,windowMs:60*60*1000,key:req=>req.ip}), (req,res) => {
  const cities=communityCitiesStats(Number(req.query.limit)||100);
  const total=Number(db.prepare(`SELECT COUNT(*) n FROM community_city_memberships m JOIN users u ON u.id=m.user_id WHERE u.status='active'`).get()?.n||0);
  res.json({ok:true,total,cities});
});
app.get('/api/community/leaderboard', rateLimit({limit:180,windowMs:60*60*1000,key:req=>req.ip}), (req,res) => {
  const days=[1,7,30,90].includes(Number(req.query.days))?Number(req.query.days):7;
  res.json({ok:true,days,cities:communityCityLeaderboard(days,Number(req.query.limit)||10)});
});

// V18.21.1 · Escaparate público opcional de comunidad. Solo devuelve la
// información mínima que cada usuario ha aceptado publicar expresamente.
app.get('/api/community/public-profiles', rateLimit({limit:180,windowMs:60*60*1000,key:req=>req.ip}), (req,res) => {
  const limit=Math.max(1,Math.min(36,Number(req.query.limit)||18));
  const city=cleanShortText(req.query.city,40);
  const where=["u.status='active'","p.discoverable=1","p.community_public=1","p.age BETWEEN 18 AND 99"];
  const params=[];
  if(city){where.push('LOWER(TRIM(p.city))=LOWER(TRIM(?))');params.push(city);}
  const rows=db.prepare(`SELECT p.name,p.age,p.city,p.avatar,p.photos_json,p.interests_json,p.profile_verified,p.updated_at
    FROM profiles p JOIN users u ON u.id=p.user_id
    WHERE ${where.join(' AND ')}
    ORDER BY p.profile_verified DESC,u.last_seen_at DESC,p.updated_at DESC
    LIMIT ?`).all(...params,limit);
  const profiles=rows.map(row=>{
    const fullName=cleanName(row.name||'');
    const firstName=(fullName.split(/\s+/).filter(Boolean)[0]||'Usuario').slice(0,30);
    const photos=safeJsonArray(row.photos_json).filter(x=>String(x||'').startsWith('/uploads/'));
    const avatar=String(row.avatar||'').startsWith('/uploads/')?String(row.avatar):'';
    const interests=safeJsonArray(row.interests_json).map(x=>cleanShortText(x,30)).filter(Boolean).slice(0,3);
    return {name:firstName,age:Number(row.age)||18,city:cleanShortText(row.city,40),photo:photos[0]||avatar||'',interests,verified:row.profile_verified===1};
  });
  res.setHeader('Cache-Control','public, max-age=60, stale-while-revalidate=120');
  res.json({ok:true,profiles});
});
app.get('/api/community/me', requireAuth, rateLimit({limit:120,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  res.json({ok:true,city:communityCityForUser(req.user.id)});
});
app.put('/api/community/me', requireAuth, rateLimit({limit:30,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  const cityName=cleanCommunityCityName(req.body?.city);
  if(!cityName)return res.status(400).json({ok:false,error:'Escribe una ciudad o municipio válido.'});
  const previousCity=communityCityForUser(req.user.id);
  const city=setCommunityCityForUser(req.user.id,cityName);
  if(!city)return res.status(400).json({ok:false,error:'No se pudo guardar la ciudad.'});
  if(!previousCity) recordFirstUserGrowthEvent(req.user.id,'city_selected',{city:city.name});
  if(getProfile(req.user.id)) broadcastDiscovery();
  const total=Number(db.prepare(`SELECT COUNT(*) n FROM community_city_memberships m JOIN users u ON u.id=m.user_id WHERE u.status='active'`).get()?.n||0);
  res.json({ok:true,city,total,activation:activationState(req.user.id)});
});

app.post('/api/growth/event', rateLimit({limit:240,windowMs:60*60*1000,key:req=>req.ip}), (req,res) => {
  const eventName=cleanGrowthValue(req.body?.event,50).toLowerCase();
  if(!GROWTH_PUBLIC_EVENTS.has(eventName))return res.status(400).json({ok:false,error:'Evento no válido.'});
  const token=bearer(req), authUser=token?userFromToken(token):null;
  const acquisition=normalizeGrowthAcquisition(req.body?.acquisition||{});
  if(!acquisition.sessionId)return res.status(400).json({ok:false,error:'Sesión analítica requerida.'});
  recordGrowthEvent(eventName,{sessionId:acquisition.sessionId,userId:authUser?.id||null,acquisition,page:req.body?.page||'/',metadata:req.body?.metadata||{}});
  res.json({ok:true});
});

app.post('/api/creators/visit', rateLimit({limit:120,windowMs:60*60*1000,key:req=>req.ip}), (req,res) => {
  const creator=creatorCodeRow(req.body?.code,true);
  if(!creator)return res.status(404).json({ok:false,error:'Código de creador no disponible.'});
  const sessionId=cleanGrowthValue(req.body?.sessionId,80);
  if(sessionId){
    const duplicate=db.prepare("SELECT 1 FROM creator_events WHERE code=? AND event_type='VISIT' AND session_id=? LIMIT 1").get(creator.code,sessionId);
    if(duplicate)return res.json({ok:true,creator:{code:creator.code,displayName:creator.display_name}});
  }
  db.prepare('INSERT INTO creator_events(id,code,event_type,user_id,session_id,created_at) VALUES(?,?,?,?,?,?)').run(safeId('crev'),creator.code,'VISIT',null,sessionId,now());
  res.json({ok:true,creator:{code:creator.code,displayName:creator.display_name,campaign:creator.campaign}});
});

app.post('/api/referrals/visit', rateLimit({limit:120,windowMs:60*60*1000,key:req=>req.ip}), (req,res) => {
  const code=normalizeMemberReferralCode(req.body?.code);
  if (!code) return res.status(400).json({ok:false,error:'Código requerido.'});
  const owner=db.prepare('SELECT user_id,referral_code FROM user_referrals WHERE referral_code=?').get(code);
  if (!owner) return res.status(404).json({ok:false,error:'Código de invitación no encontrado.'});
  db.prepare('INSERT INTO user_referral_events(id,referral_code,event_type,user_id,created_at) VALUES(?,?,?,?,?)')
    .run(safeId('uref'),owner.referral_code,'VISIT',null,now());
  res.json({ok:true});
});

app.get('/api/referrals/me', requireAuth, rateLimit({limit:90,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  const stats=memberReferralStats(req.user.id);
  const referralUrl=`${baseUrl(req)}/?ref=${encodeURIComponent(stats.code)}&utm_source=referral&utm_medium=member&utm_campaign=invite3`;
  res.json({ok:true,referral:{...stats,url:referralUrl}});
});

app.post('/api/referrals/share', requireAuth, rateLimit({limit:120,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  const row=ensureMemberReferral(req.user.id);
  const source=['invite','game_result'].includes(String(req.body?.source||''))?String(req.body.source):'invite';
  db.prepare('INSERT INTO user_referral_events(id,referral_code,event_type,user_id,created_at) VALUES(?,?,?,?,?)')
    .run(safeId('uref'),row.referral_code,source==='game_result'?'SHARE_GAME':'SHARE_INVITE',req.user.id,now());
  const a=growthAcquisitionForUser(req.user.id)||{};
  recordGrowthEvent(source==='game_result'?'share_game_result':'share_invite',{userId:req.user.id,sessionId:a.session_id||'',acquisition:{sessionId:a.session_id||'',source:a.source,medium:a.medium,campaign:a.campaign,content:a.content,term:a.term,referrer:a.referrer,landingPath:a.landing_path},metadata:{source}});
  res.json({ok:true,referral:memberReferralStats(req.user.id)});
});

app.post('/api/referrals/boost', requireAuth, rateLimit({limit:12,windowMs:24*60*60*1000,key:req=>req.user.id}), (req,res) => {
  syncReferralRewards(req.user.id);
  const active=plusBoostState(req.user.id);
  if(active.active)return res.status(409).json({ok:false,error:'Ya tienes un Boost activo.',referral:memberReferralStats(req.user.id)});
  const credit=db.prepare("SELECT reward_key FROM referral_rewards WHERE user_id=? AND reward_key LIKE 'boost_credit_%' AND consumed_at IS NULL ORDER BY granted_at ASC LIMIT 1").get(req.user.id);
  if(!credit)return res.status(409).json({ok:false,error:'No tienes Boost de referidos disponible.',referral:memberReferralStats(req.user.id)});
  const ts=now(),activeUntil=ts+30*60*1000;
  const used=db.prepare('UPDATE referral_rewards SET consumed_at=? WHERE user_id=? AND reward_key=? AND consumed_at IS NULL').run(ts,req.user.id,credit.reward_key);
  if(!used.changes)return res.status(409).json({ok:false,error:'Ese premio ya fue utilizado.'});
  db.prepare(`INSERT INTO plus_boosts(user_id,active_until,last_used_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET active_until=excluded.active_until,last_used_at=excluded.last_used_at`).run(req.user.id,activeUntil,ts);
  broadcastDiscovery();
  res.json({ok:true,activeUntil,referral:memberReferralStats(req.user.id)});
});

// ---- LANZAMIENTO POR CIUDADES · API PÚBLICA ----
app.get('/api/launch/cities', (req,res) => {
  res.json({ok:true,cityLaunchEnabled:CITY_LAUNCH_ENABLED,cities:launchCitiesStats()});
});

app.get('/api/launch/cities/:slug/people', (req,res) => {
  const slug=normalizeLaunchCity(req.params.slug);
  const limit=Math.max(1,Math.min(24,Number(req.query.limit)||8));
  const people=db.prepare(`
    SELECT w.alias,w.age,w.city_slug city,COALESCE(p.avatar,'') avatar
    FROM launch_waitlist_users w
    LEFT JOIN profiles p ON p.user_id=w.app_user_id
    WHERE w.city_slug=? AND w.public_profile=1 AND w.status!='BLOCKED'
    ORDER BY w.created_at DESC LIMIT ?
  `).all(slug,limit);
  res.json({ok:true,people});
});

app.post('/api/launch/referrals/visit', rateLimit({limit:120,windowMs:60*60*1000,key:req=>req.ip}), (req,res) => {
  const code=cleanShortText(req.body?.code,80);
  if (!code) return res.status(400).json({ok:false,error:'Código requerido.'});
  if (!db.prepare("SELECT 1 FROM launch_waitlist_users WHERE referral_code=? AND status!='BLOCKED'").get(code)) return res.status(404).json({ok:false,error:'Código no encontrado.'});
  db.prepare('INSERT INTO launch_referral_events(id,referral_code,event_type,created_at) VALUES(?,?,?,?)')
    .run(safeId('lref'),code,'VISIT',now());
  res.json({ok:true});
});

app.get('/api/launch/referrals/:code', rateLimit({limit:120,windowMs:60*60*1000,key:req=>req.ip}), (req,res) => {
  const stats=launchReferralStats(req.params.code);
  if (!stats) return res.status(404).json({ok:false,error:'Código de invitación no encontrado.'});
  // Solo métricas agregadas: nunca devuelve email, identidad del propietario ni datos de invitados.
  res.json({ok:true,referral:stats});
});

app.post('/api/launch/waitlist', rateLimit({limit:12,windowMs:60*60*1000,key:req=>req.ip}), async (req,res) => {
  try {
    const alias=cleanName(req.body?.alias);
    const age=Number(req.body?.age);
    const email=cleanEmail(req.body?.email);
    const citySlug=normalizeLaunchCity(req.body?.city);
    const publicProfile=req.body?.publicProfile===true?1:0;
    const launchConsent=req.body?.launchConsent===true;
    const referredByInput=cleanShortText(req.body?.referredBy,80)||null;
    let referredBy=null;
    if (alias.length<2) return res.status(400).json({ok:false,error:'Escribe un nombre o alias válido.'});
    if (!Number.isInteger(age)||age<18||age>99) return res.status(400).json({ok:false,error:'V/R Match es solo para mayores de 18 años.'});
    if (!validEmail(email)) return res.status(400).json({ok:false,error:'Introduce un correo válido.'});
    if (!launchConsent) return res.status(400).json({ok:false,error:'Debes aceptar recibir los mensajes necesarios de la lista de espera y el lanzamiento.'});
    const city=db.prepare('SELECT * FROM launch_cities WHERE slug=?').get(citySlug);
    if (!city) return res.status(400).json({ok:false,error:'Ciudad no disponible.'});
    if (city.status==='ACTIVE') {
      return res.status(409).json({ok:false,cityActive:true,nextUrl:'/',error:`V/R Match ya está disponible en ${city.name}. Entra directamente en la app.`});
    }

    if (referredByInput) {
      const refOwner=db.prepare("SELECT referral_code FROM launch_waitlist_users WHERE referral_code=? AND status!='BLOCKED'").get(referredByInput);
      if (refOwner) referredBy=refOwner.referral_code;
    }

    const existingWait=db.prepare('SELECT * FROM launch_waitlist_users WHERE email=?').get(email);
    if (existingWait) {
      const stats=launchCityStats(existingWait.city_slug);
      return res.json({ok:true,alreadyRegistered:true,referralCode:existingWait.referral_code,
        referralUrl:`${baseUrl(req)}/espera?ref=${encodeURIComponent(existingWait.referral_code)}`,
        referral:launchReferralStats(existingWait.referral_code),city:stats,status:existingWait.status});
    }

    const existingUser=db.prepare('SELECT id,status FROM users WHERE email=?').get(email);
    if (existingUser && existingUser.status==='active') {
      return res.status(409).json({ok:false,error:'Ese correo ya tiene una cuenta de V/R Match. Puedes entrar directamente.',existingAccount:true,loginUrl:'/'});
    }

    let referralCode;
    do { referralCode=makeLaunchReferralCode(alias,citySlug); }
    while(db.prepare('SELECT 1 FROM launch_waitlist_users WHERE referral_code=?').get(referralCode));

    const ts=now(), id=safeId('wait');
    db.prepare(`INSERT INTO launch_waitlist_users
      (id,alias,age,email,city_slug,public_profile,launch_consent,referral_code,referred_by,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,'WAITLIST',?,?)`)
      .run(id,alias,age,email,citySlug,publicProfile,1,referralCode,referredBy,ts,ts);

    if (referredBy) {
      db.prepare('INSERT INTO launch_referral_events(id,referral_code,event_type,created_at) VALUES(?,?,?,?)')
        .run(safeId('lref'),referredBy,'SIGNUP',ts);
      refreshLaunchFounderQualification(referredBy,ts);
    }

    const referralUrl=`${baseUrl(req)}/espera?ref=${encodeURIComponent(referralCode)}`;
    queueLaunchEmail(id,email,`Ya estás esperando V/R Match en ${city.name} 🔥`,'WAITLIST_WELCOME',{alias,city:city.name,referralUrl});
    refreshLaunchCityStatus(citySlug);
    processLaunchMailQueue(5).catch(e=>console.warn('Launch mail:',e.message));
    res.status(201).json({ok:true,referralCode,referralUrl,referral:launchReferralStats(referralCode),city:launchCityStats(citySlug),immediateActivation:false});
  } catch(e) {
    console.error('Waitlist:',e);
    res.status(500).json({ok:false,error:'No se pudo completar el registro en la lista.'});
  }
});

app.post('/api/launch/resend-activation',
  rateLimit({limit:6,windowMs:60*60*1000,key:req=>`${req.ip}:${hashToken(cleanEmail(req.body?.email)).slice(0,16)}`}),
  async (req,res) => {
    const generic={ok:true,message:'Si ese correo tiene un acceso pendiente en una ciudad abierta, recibirás un nuevo enlace en unos minutos.'};
    try {
      const email=cleanEmail(req.body?.email);
      if (!validEmail(email)) return res.json(generic);

      const row=db.prepare(`SELECT w.id,w.email,w.alias,w.status,w.city_slug,c.name cityName,c.status cityStatus
        FROM launch_waitlist_users w JOIN launch_cities c ON c.slug=w.city_slug
        WHERE w.email=?`).get(email);
      // Respuesta genérica para no revelar si un correo está o no registrado.
      if (!row || row.cityStatus!=='ACTIVE' || row.status==='ACTIVATED' || row.status==='BLOCKED') return res.json(generic);

      const last=db.prepare(`SELECT created_at createdAt FROM launch_mail_queue
        WHERE waitlist_user_id=? AND template='CITY_UNLOCKED' ORDER BY created_at DESC LIMIT 1`).get(row.id);
      if (last && now()-Number(last.createdAt||0)<LAUNCH_RESEND_COOLDOWN_MS) return res.json(generic);

      queueLaunchActivationEmail(row.id,row.email,`${row.cityName} está abierta 🔓 Nuevo acceso a V/R Match`,baseUrl(req));
      db.prepare("UPDATE launch_waitlist_users SET status='CITY_READY',updated_at=? WHERE id=?").run(now(),row.id);
      processLaunchMailQueue(2).catch(e=>console.warn('Launch resend:',e.message));
      return res.json(generic);
    } catch(e) {
      console.warn('Launch resend:',e.message);
      return res.json(generic);
    }
  });

app.get('/api/launch/activation/:token', rateLimit({limit:60,windowMs:60*60*1000,key:req=>req.ip}), (req,res) => {
  const raw=String(req.params.token||'');
  const row=db.prepare(`
    SELECT t.expires_at expiresAt,t.used_at usedAt,w.id waitlistId,w.alias,w.email,w.city_slug citySlug,w.status,
      c.name cityName,c.status cityStatus
    FROM launch_activation_tokens t
    JOIN launch_waitlist_users w ON w.id=t.waitlist_user_id
    JOIN launch_cities c ON c.slug=w.city_slug
    WHERE t.token_hash=?
  `).get(hashToken(raw));
  if (!row) return res.status(404).json({ok:false,error:'El enlace de acceso no es válido.'});
  if (row.usedAt) return res.status(410).json({ok:false,error:'Este enlace ya fue utilizado.'});
  if (Number(row.expiresAt)<=now()) return res.status(410).json({ok:false,error:'Este enlace ha caducado. Puedes solicitar uno nuevo.'});
  if (row.cityStatus!=='ACTIVE') return res.status(403).json({ok:false,error:'Tu ciudad todavía no está activa.'});
  const existing=db.prepare('SELECT id,status FROM users WHERE email=?').get(row.email);
  res.json({ok:true,alias:row.alias,email:row.email,city:row.cityName,existingAccount:Boolean(existing&&existing.status==='active'),expiresAt:row.expiresAt});
});

app.post('/api/launch/activate', rateLimit({limit:12,windowMs:60*60*1000,key:req=>req.ip}), (req,res) => {
  try {
    const raw=String(req.body?.token||'');
    const row=db.prepare(`
      SELECT t.token_hash tokenHash,t.expires_at expiresAt,t.used_at usedAt,w.id waitlistId,w.alias,w.age,w.email,w.city_slug citySlug,
        c.name cityName,c.status cityStatus
      FROM launch_activation_tokens t
      JOIN launch_waitlist_users w ON w.id=t.waitlist_user_id
      JOIN launch_cities c ON c.slug=w.city_slug
      WHERE t.token_hash=?
    `).get(hashToken(raw));
    if (!row) return res.status(404).json({ok:false,error:'El enlace de acceso no es válido.'});
    if (row.usedAt) return res.status(410).json({ok:false,error:'Este enlace ya fue utilizado.'});
    if (Number(row.expiresAt)<=now()) return res.status(410).json({ok:false,error:'Este enlace ha caducado.'});
    if (row.cityStatus!=='ACTIVE') return res.status(403).json({ok:false,error:'Tu ciudad todavía no está activa.'});

    let user=db.prepare('SELECT * FROM users WHERE email=?').get(row.email);
    let created=false;
    if (user && user.status!=='active') return res.status(403).json({ok:false,error:'Esta cuenta no está disponible. Contacta con soporte.'});

    const tx=db.transaction(()=>{
      if (!user) {
        const password=String(req.body?.password||'');
        if (req.body?.confirmAdult!==true) throw new Error('ADULT_REQUIRED');
        if (req.body?.acceptTerms!==true) throw new Error('TERMS_REQUIRED');
        if (Buffer.byteLength(password,'utf8')<8||Buffer.byteLength(password,'utf8')>72) throw new Error('PASSWORD_INVALID');
        const userId=safeId('usr'),ts=now();
        db.prepare('INSERT INTO users(id,email,password_hash,created_at,last_seen_at,email_verified,email_verified_at,onboarding_completed,status) VALUES(?,?,?,?,?,1,?,0,?)')
          .run(userId,row.email,hashPassword(password),ts,ts,ts,'active');
        db.prepare('INSERT INTO legal_acceptances(id,user_id,legal_version,adult_confirmed,terms_accepted,accepted_at) VALUES(?,?,?,?,?,?)')
          .run(safeId('legal'),userId,LEGAL_VERSION,1,1,ts);
        user=db.prepare('SELECT * FROM users WHERE id=?').get(userId);
        created=true;
      } else if (!user.email_verified) {
        db.prepare('UPDATE users SET email_verified=1,email_verified_at=? WHERE id=?').run(now(),user.id);
        user=db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
      }
      const token=createSession(user.id);
      db.prepare('UPDATE launch_activation_tokens SET used_at=? WHERE token_hash=?').run(now(),row.tokenHash);
      db.prepare("UPDATE launch_waitlist_users SET status='ACTIVATED',app_user_id=?,activated_at=?,updated_at=? WHERE id=?")
        .run(user.id,now(),now(),row.waitlistId);
      return token;
    });

    let token;
    try { token=tx(); }
    catch(e) {
      if (e.message==='ADULT_REQUIRED') return res.status(400).json({ok:false,error:'Debes confirmar que tienes 18 años o más.'});
      if (e.message==='TERMS_REQUIRED') return res.status(400).json({ok:false,error:'Debes aceptar las Condiciones y la Privacidad.'});
      if (e.message==='PASSWORD_INVALID') return res.status(400).json({ok:false,error:'La contraseña debe tener entre 8 y 72 caracteres aprox.'});
      throw e;
    }
    const fresh=db.prepare('SELECT id,email,email_verified,onboarding_completed FROM users WHERE id=?').get(user.id);
    const launchRecord=db.prepare('SELECT founder_qualified_at FROM launch_waitlist_users WHERE id=?').get(row.waitlistId);
    res.json({ok:true,token,created,user:{id:fresh.id,email:fresh.email,emailVerified:Boolean(fresh.email_verified),admin:isAdmin(fresh)},
      profile:getProfile(fresh.id),plus:getPlusState(fresh.id),onboardingCompleted:Boolean(fresh.onboarding_completed),beta:betaState(fresh.id),
      founderQualified:Boolean(launchRecord?.founder_qualified_at),nextUrl:'/?launch=activated'});
  } catch(e) {
    console.error('Launch activation:',e);
    res.status(500).json({ok:false,error:'No se pudo activar el acceso.'});
  }
});


// ---- ADMIN · LANZAMIENTO POR CIUDADES ----
function launchPreflight() {
  const readiness=productionReadiness();
  const mail=db.prepare(`SELECT
      SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) pending,
      SUM(CASE WHEN status='ERROR' THEN 1 ELSE 0 END) errors
    FROM launch_mail_queue`).get();
  const latestBackup=db.prepare(`SELECT created_at FROM moderation_actions
    WHERE action='system_backup_download' ORDER BY created_at DESC LIMIT 1`).get();
  const lastBackupAt=Number(latestBackup?.created_at||0)||null;
  const recentBackup=Boolean(lastBackupAt && now()-lastBackupAt <= 7*86400000);
  const checks=[
    {key:'productionMode',label:'Modo de producción',ok:Boolean(readiness.productionMode),required:true,detail:'VR_LAUNCH_MODE=production'},
    {key:'customDomain',label:'Dominio y URL base definitivos',ok:Boolean(readiness.customDomain),required:true,detail:'VR_APP_BASE_URL debe apuntar al dominio público final'},
    {key:'persistentStorage',label:'SQLite y uploads persistentes',ok:Boolean(readiness.persistentStorage),required:true,detail:'VR_STORAGE_DIR fuera del filesystem efímero'},
    {key:'smtp',label:'Correo SMTP',ok:Boolean(readiness.smtpConfigured),required:true,detail:'Necesario para activaciones y recuperación'},
    {key:'emailVerification',label:'Verificación de correo',ok:Boolean(readiness.emailVerificationRequired),required:true,detail:'VR_REQUIRE_EMAIL_VERIFICATION=true'},
    {key:'admin',label:'Administrador configurado',ok:Boolean(readiness.adminConfigured),required:true,detail:'VR_ADMIN_EMAILS'},
    {key:'socketOrigin',label:'Socket.IO restringido al origen',ok:Boolean(readiness.socketOriginRestricted),required:true,detail:'VR_APP_BASE_URL o VR_ALLOWED_ORIGINS'},
    {key:'cityLaunch',label:'Lanzamiento por ciudades',ok:Boolean(CITY_LAUNCH_ENABLED),required:true,detail:'VR_CITY_LAUNCH_ENABLED=true'},
    {key:'mailErrors',label:'Cola de correo sin errores',ok:Number(mail.errors||0)===0,required:true,detail:`Errores actuales: ${Number(mail.errors||0)}`},
    {key:'backup',label:'Backup reciente',ok:recentBackup,required:true,detail:lastBackupAt?`Último: ${new Date(lastBackupAt).toISOString()}`:'Todavía no consta un backup manual'}
  ];
  return {
    version:APP_VERSION,
    ready:checks.filter(x=>x.required).every(x=>x.ok),
    checks,
    pendingMail:Number(mail.pending||0),
    mailErrors:Number(mail.errors||0),
    lastBackupAt,
    cities:launchCitiesStats().map(c=>({slug:c.slug,name:c.name,status:c.status,current:c.current,goal:c.goal}))
  };
}

app.get('/api/admin/launch/preflight', requireAuth, requireAdmin, (req,res) => {
  res.json({ok:true,preflight:launchPreflight()});
});

app.get('/api/admin/launch/summary', requireAuth, requireAdmin, (req,res) => {
  const s=db.prepare(`SELECT COUNT(*) total,
    SUM(CASE WHEN date(created_at/1000,'unixepoch')=date('now') THEN 1 ELSE 0 END) today,
    SUM(CASE WHEN referred_by IS NOT NULL AND referred_by!='' THEN 1 ELSE 0 END) referred,
    SUM(CASE WHEN status='ACTIVATED' THEN 1 ELSE 0 END) activated,
    SUM(CASE WHEN activation_sent_at IS NOT NULL THEN 1 ELSE 0 END) invited,
    SUM(CASE WHEN founder_qualified_at IS NOT NULL THEN 1 ELSE 0 END) founders
    FROM launch_waitlist_users WHERE status!='BLOCKED'`).get();
  const m=db.prepare(`SELECT
    SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) pending,
    SUM(CASE WHEN status='ERROR' THEN 1 ELSE 0 END) errors
    FROM launch_mail_queue`).get();
  const visits=Number(db.prepare("SELECT COUNT(*) n FROM launch_referral_events WHERE event_type='VISIT'").get()?.n||0);
  const referralSignups=Number(db.prepare("SELECT COUNT(*) n FROM launch_referral_events WHERE event_type='SIGNUP'").get()?.n||0);
  const invited=Number(s.invited||0),activated=Number(s.activated||0);
  res.json({ok:true,total:Number(s.total||0),today:Number(s.today||0),referred:Number(s.referred||0),activated,
    invited,activationRate:invited?Math.round(activated*100/invited):0,founders:Number(s.founders||0),
    referralVisits:visits,referralSignups,
    pendingMail:Number(m.pending||0),mailErrors:Number(m.errors||0),cityLaunchEnabled:CITY_LAUNCH_ENABLED,
    founderTarget:FOUNDER_REFERRALS_TARGET});
});

app.get('/api/admin/launch/analytics', requireAuth, requireAdmin, (req,res) => {
  const requested=String(req.query.days||'30');
  const days=['7','30','90','all'].includes(requested)?requested:'30';
  const since=days==='all'?0:now()-Number(days)*86400000;
  const dateClause=(column)=>since?` AND ${column}>=?`:'';
  const dateArgs=()=>since?[since]:[];

  const signups=db.prepare(`SELECT COUNT(*) total,
      SUM(CASE WHEN referred_by IS NOT NULL AND referred_by!='' THEN 1 ELSE 0 END) referred
    FROM launch_waitlist_users
    WHERE status!='BLOCKED'${dateClause('created_at')}`).get(...dateArgs());

  const invited=db.prepare(`SELECT COUNT(*) total,
      SUM(CASE WHEN status='ACTIVATED' THEN 1 ELSE 0 END) activatedFromCohort
    FROM launch_waitlist_users
    WHERE status!='BLOCKED' AND activation_sent_at IS NOT NULL${dateClause('activation_sent_at')}`).get(...dateArgs());

  const activated=db.prepare(`SELECT COUNT(*) total,
      AVG(CASE WHEN activation_sent_at IS NOT NULL THEN (activated_at-activation_sent_at)/3600000.0 END) avgActivationHours
    FROM launch_waitlist_users
    WHERE status!='BLOCKED' AND activated_at IS NOT NULL${dateClause('activated_at')}`).get(...dateArgs());

  const founders=db.prepare(`SELECT COUNT(*) total FROM launch_waitlist_users
    WHERE status!='BLOCKED' AND founder_qualified_at IS NOT NULL${dateClause('founder_qualified_at')}`).get(...dateArgs());

  const visits=Number(db.prepare(`SELECT COUNT(*) n FROM launch_referral_events
    WHERE event_type='VISIT'${dateClause('created_at')}`).get(...dateArgs())?.n||0);
  const referralSignups=Number(db.prepare(`SELECT COUNT(*) n FROM launch_referral_events
    WHERE event_type='SIGNUP'${dateClause('created_at')}`).get(...dateArgs())?.n||0);

  const cities=launchCitiesStats().map(c=>{
    const base=[c.slug];
    const signup=db.prepare(`SELECT COUNT(*) total,
        SUM(CASE WHEN referred_by IS NOT NULL AND referred_by!='' THEN 1 ELSE 0 END) referred
      FROM launch_waitlist_users
      WHERE city_slug=? AND status!='BLOCKED'${since?' AND created_at>=?':''}`).get(...(since?[...base,since]:base));
    const invite=db.prepare(`SELECT COUNT(*) total,
        SUM(CASE WHEN status='ACTIVATED' THEN 1 ELSE 0 END) activatedFromCohort
      FROM launch_waitlist_users
      WHERE city_slug=? AND status!='BLOCKED' AND activation_sent_at IS NOT NULL${since?' AND activation_sent_at>=?':''}`).get(...(since?[...base,since]:base));
    const actualActivated=db.prepare(`SELECT COUNT(*) total FROM launch_waitlist_users
      WHERE city_slug=? AND status!='BLOCKED' AND activated_at IS NOT NULL${since?' AND activated_at>=?':''}`).get(...(since?[...base,since]:base));
    const cityVisits=Number(db.prepare(`SELECT COUNT(*) n
      FROM launch_referral_events e
      JOIN launch_waitlist_users owner ON owner.referral_code=e.referral_code
      WHERE owner.city_slug=? AND e.event_type='VISIT'${since?' AND e.created_at>=?':''}`).get(...(since?[...base,since]:base))?.n||0);
    const cityRefSignups=Number(db.prepare(`SELECT COUNT(*) n
      FROM launch_referral_events e
      JOIN launch_waitlist_users owner ON owner.referral_code=e.referral_code
      WHERE owner.city_slug=? AND e.event_type='SIGNUP'${since?' AND e.created_at>=?':''}`).get(...(since?[...base,since]:base))?.n||0);
    const invites=Number(invite.total||0), activatedFromCohort=Number(invite.activatedFromCohort||0);
    return {...c,
      signups:Number(signup.total||0),
      referred:Number(signup.referred||0),
      invited:invites,
      activated:Number(actualActivated.total||0),
      referralVisits:cityVisits,
      referralSignups:cityRefSignups,
      activationRate:invites?Math.round(activatedFromCohort*100/invites):0,
      referralEventRate:cityVisits?Math.round(cityRefSignups*100/cityVisits):0
    };
  }).sort((a,b)=>b.signups-a.signups || a.name.localeCompare(b.name,'es'));

  const topReferrers=db.prepare(`SELECT
      w.alias,w.city_slug city,w.referral_code referralCode,w.founder_qualified_at founderQualifiedAt,
      (SELECT COUNT(*) FROM launch_waitlist_users x
        WHERE x.referred_by=w.referral_code AND x.status!='BLOCKED'${since?' AND x.created_at>=?':''}) successfulInvites,
      (SELECT COUNT(*) FROM launch_referral_events e
        WHERE e.referral_code=w.referral_code AND e.event_type='VISIT'${since?' AND e.created_at>=?':''}) visits
    FROM launch_waitlist_users w
    WHERE w.status!='BLOCKED'
    ORDER BY successfulInvites DESC,visits DESC,w.created_at ASC
    LIMIT 20`).all(...(since?[since,since]:[])).map(r=>({
      ...r,
      successfulInvites:Number(r.successfulInvites||0),
      visits:Number(r.visits||0),
      founderQualified:Boolean(r.founderQualifiedAt || Number(r.successfulInvites||0)>=FOUNDER_REFERRALS_TARGET)
    }));

  const daily=db.prepare(`SELECT day,
      SUM(waitlist) waitlist,
      SUM(referred) referred,
      SUM(activated) activated,
      SUM(visits) visits
    FROM (
      SELECT date(created_at/1000,'unixepoch') day,COUNT(*) waitlist,
        SUM(CASE WHEN referred_by IS NOT NULL AND referred_by!='' THEN 1 ELSE 0 END) referred,
        0 activated,0 visits
      FROM launch_waitlist_users
      WHERE status!='BLOCKED'${since?' AND created_at>=?':''}
      GROUP BY day
      UNION ALL
      SELECT date(activated_at/1000,'unixepoch') day,0 waitlist,0 referred,COUNT(*) activated,0 visits
      FROM launch_waitlist_users
      WHERE status!='BLOCKED' AND activated_at IS NOT NULL${since?' AND activated_at>=?':''}
      GROUP BY day
      UNION ALL
      SELECT date(created_at/1000,'unixepoch') day,0 waitlist,0 referred,0 activated,
        SUM(CASE WHEN event_type='VISIT' THEN 1 ELSE 0 END) visits
      FROM launch_referral_events
      WHERE 1=1${since?' AND created_at>=?':''}
      GROUP BY day
    )
    GROUP BY day ORDER BY day ASC`).all(...(since?[since,since,since]:[])).map(d=>({
      day:d.day,waitlist:Number(d.waitlist||0),referred:Number(d.referred||0),
      activated:Number(d.activated||0),visits:Number(d.visits||0)
    }));

  const total=Number(signups.total||0),inviteCount=Number(invited.total||0);
  const actualActivated=Number(activated.total||0),activatedFromCohort=Number(invited.activatedFromCohort||0);
  res.json({ok:true,days,founderTarget:FOUNDER_REFERRALS_TARGET,
    summary:{
      total,referred:Number(signups.referred||0),invited:inviteCount,activated:actualActivated,
      activationRate:inviteCount?Math.round(activatedFromCohort*100/inviteCount):0,
      founders:Number(founders.total||0),
      avgActivationHours:activated.avgActivationHours==null?null:Math.round(Number(activated.avgActivationHours)*10)/10,
      referralVisits:visits,referralSignups,
      referralEventRate:visits?Math.round(referralSignups*100/visits):0
    },
    cities,topReferrers,daily});
});

app.get('/api/admin/launch/cities', requireAuth, requireAdmin, (req,res) => res.json({ok:true,cities:launchCitiesStats()}));

app.post('/api/admin/launch/cities', requireAuth, requireAdmin, rateLimit({limit:20,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  try {
    const name=cleanShortText(req.body?.name,50);
    const slug=normalizeLaunchCity(name);
    const goal=Number(req.body?.goal);
    if (name.length<2 || slug.length<2) return res.status(400).json({ok:false,error:'Escribe un nombre de ciudad válido.'});
    if (!Number.isInteger(goal)||goal<1||goal>1000000) return res.status(400).json({ok:false,error:'Objetivo no válido.'});
    if (db.prepare('SELECT 1 FROM launch_cities WHERE slug=?').get(slug)) {
      return res.status(409).json({ok:false,error:'Esa ciudad ya existe en el lanzamiento.'});
    }
    const ts=now();
    db.prepare(`INSERT INTO launch_cities(slug,name,target_users,default_target_users,status,activated_at,created_at,updated_at)
      VALUES(?,?,?,?, 'WAITING',NULL,?,?)`).run(slug,name,goal,goal,ts,ts);
    logModerationAction(req.user.id,req.user.id,'launch_city_created',`Ciudad ${name} creada · objetivo ${goal}`,null);
    res.status(201).json({ok:true,city:launchCityStats(slug)});
  } catch(e) {
    console.error('Create launch city:',e);
    res.status(500).json({ok:false,error:'No se pudo añadir la ciudad.'});
  }
});

app.get('/api/admin/launch/cities/:slug/users', requireAuth, requireAdmin, (req,res) => {
  const slug=normalizeLaunchCity(req.params.slug),q=cleanShortText(req.query.q,80),limit=Math.max(1,Math.min(500,Number(req.query.limit)||200));
  const like=`%${q}%`;
  const rows=db.prepare(`
    SELECT w.id,w.alias,w.age,w.email,w.city_slug city,w.public_profile publicProfile,w.referral_code referralCode,w.referred_by referredBy,
      w.status,w.app_user_id appUserId,w.activation_sent_at activationSentAt,w.activated_at activatedAt,
      w.founder_qualified_at founderQualifiedAt,w.created_at createdAt,
      (SELECT COUNT(*) FROM launch_waitlist_users x WHERE x.referred_by=w.referral_code) successfulInvites,
      (SELECT COUNT(*) FROM launch_referral_events e WHERE e.referral_code=w.referral_code AND e.event_type='VISIT') referralVisits
    FROM launch_waitlist_users w
    WHERE w.city_slug=? AND (?='' OR w.alias LIKE ? OR w.email LIKE ? OR w.referral_code LIKE ?)
    ORDER BY w.created_at DESC LIMIT ?
  `).all(slug,q,like,like,like,limit);
  res.json({ok:true,users:rows});
});

app.patch('/api/admin/launch/cities/:slug/goal', requireAuth, requireAdmin, (req,res) => {
  const slug=normalizeLaunchCity(req.params.slug),goal=Number(req.body?.goal),setAsDefault=req.body?.setAsDefault===true;
  if (!Number.isInteger(goal)||goal<1||goal>1000000) return res.status(400).json({ok:false,error:'Objetivo no válido.'});
  const city=db.prepare('SELECT name FROM launch_cities WHERE slug=?').get(slug);
  if (!city) return res.status(404).json({ok:false,error:'Ciudad no encontrada.'});
  if (setAsDefault) {
    db.prepare('UPDATE launch_cities SET target_users=?,default_target_users=?,updated_at=? WHERE slug=?').run(goal,goal,now(),slug);
  } else {
    db.prepare('UPDATE launch_cities SET target_users=?,updated_at=? WHERE slug=?').run(goal,now(),slug);
  }
  logModerationAction(req.user.id,req.user.id,'launch_city_goal_changed',
    `Ciudad ${city.name} · objetivo ${goal}${setAsDefault?' · objetivo base actualizado':''}`,null);
  res.json({ok:true,city:refreshLaunchCityStatus(slug)});
});

app.post('/api/admin/launch/cities/:slug/unlock', requireAuth, requireAdmin, rateLimit({limit:12,windowMs:60*60*1000,key:req=>req.user.id}), async (req,res) => {
  try {
    const slug=normalizeLaunchCity(req.params.slug),city=launchCityStats(slug);
    if (!city) return res.status(404).json({ok:false,error:'Ciudad no encontrada.'});
    if (city.status==='ACTIVE') return res.json({ok:true,alreadyActive:true,city});
    const users=db.prepare("SELECT id,alias,email FROM launch_waitlist_users WHERE city_slug=? AND status='WAITLIST'").all(slug);
    const ts=now();
    const tx=db.transaction(()=>{
      db.prepare("UPDATE launch_cities SET status='ACTIVE',activated_at=?,updated_at=? WHERE slug=?").run(ts,ts,slug);
      for (const w of users) {
        queueLaunchActivationEmail(w.id,w.email,`${city.name} está abierta 🔓 Entra en V/R Match`,baseUrl(req));
        db.prepare("UPDATE launch_waitlist_users SET status='CITY_READY',updated_at=? WHERE id=?").run(ts,w.id);
      }
    });
    tx();
    logModerationAction(req.user.id,req.user.id,'launch_city_unlocked',`Ciudad ${city.name} · ${users.length} accesos`,null);
    const mail=await processLaunchMailQueue(20);
    res.json({ok:true,city:launchCityStats(slug),activationEmailsQueued:users.length,mail});
  } catch(e) {
    console.error('Unlock city:',e);
    res.status(500).json({ok:false,error:'No se pudo desbloquear la ciudad.'});
  }
});

app.post('/api/admin/launch/cities/:slug/reset-test', requireAuth, requireAdmin, rateLimit({limit:6,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  try {
    const slug=normalizeLaunchCity(req.params.slug);
    const city=db.prepare('SELECT * FROM launch_cities WHERE slug=?').get(slug);
    if (!city) return res.status(404).json({ok:false,error:'Ciudad no encontrada.'});
    const password=String(req.body?.password||'');
    const confirmText=cleanShortText(req.body?.confirmText,100).toUpperCase();
    const expected=`REINICIAR ${city.name}`.toUpperCase();
    if (confirmText!==expected) return res.status(400).json({ok:false,error:`Escribe ${expected} para confirmar.`});
    const account=db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
    if (!account || !verifyPassword(password,account.password_hash)) return res.status(400).json({ok:false,error:'La contraseña de administrador no es correcta.'});

    const rows=db.prepare('SELECT id,referral_code,app_user_id FROM launch_waitlist_users WHERE city_slug=?').all(slug);
    const linkedAccountsLeft=[...new Set(rows.map(r=>r.app_user_id).filter(Boolean))].length;
    const defaultGoal=launchDefaultGoal(slug);
    const tx=db.transaction(()=>{
      db.prepare(`DELETE FROM launch_mail_queue WHERE waitlist_user_id IN
        (SELECT id FROM launch_waitlist_users WHERE city_slug=?)`).run(slug);
      db.prepare(`DELETE FROM launch_activation_tokens WHERE waitlist_user_id IN
        (SELECT id FROM launch_waitlist_users WHERE city_slug=?)`).run(slug);
      db.prepare(`DELETE FROM launch_referral_events WHERE referral_code IN
        (SELECT referral_code FROM launch_waitlist_users WHERE city_slug=?)`).run(slug);
      db.prepare(`UPDATE launch_waitlist_users SET referred_by=NULL,updated_at=? WHERE referred_by IN
        (SELECT referral_code FROM launch_waitlist_users WHERE city_slug=?)`).run(now(),slug);
      db.prepare('DELETE FROM launch_waitlist_users WHERE city_slug=?').run(slug);
      db.prepare("UPDATE launch_cities SET target_users=?,status='WAITING',activated_at=NULL,updated_at=? WHERE slug=?")
        .run(defaultGoal,now(),slug);
    });
    tx();
    logModerationAction(req.user.id,req.user.id,'launch_city_test_reset',`Ciudad ${city.name} reiniciada · ${rows.length} registros de lista eliminados · ${linkedAccountsLeft} cuentas reales conservadas`,null);
    res.json({ok:true,removedWaitlist:rows.length,linkedAccountsLeft,city:launchCityStats(slug)});
  } catch(e) {
    console.error('Reset launch city:',e);
    res.status(500).json({ok:false,error:'No se pudo reiniciar la ciudad.'});
  }
});

app.post('/api/admin/launch/waitlist/:id/resend', requireAuth, requireAdmin,
  rateLimit({limit:40,windowMs:60*60*1000,key:req=>req.user.id}), async (req,res) => {
  try {
    const id=cleanShortText(req.params.id,100);
    const row=db.prepare(`SELECT w.id,w.email,w.alias,w.status,c.name cityName,c.status cityStatus
      FROM launch_waitlist_users w JOIN launch_cities c ON c.slug=w.city_slug WHERE w.id=?`).get(id);
    if (!row) return res.status(404).json({ok:false,error:'Registro de lista no encontrado.'});
    if (row.cityStatus!=='ACTIVE') return res.status(409).json({ok:false,error:'La ciudad todavía no está activa.'});
    if (row.status==='ACTIVATED') return res.status(409).json({ok:false,error:'La cuenta ya fue activada.'});
    if (row.status==='BLOCKED') return res.status(409).json({ok:false,error:'Este registro está bloqueado.'});

    const recent=db.prepare(`SELECT created_at createdAt,status FROM launch_mail_queue
      WHERE waitlist_user_id=? AND template='CITY_UNLOCKED' ORDER BY created_at DESC LIMIT 1`).get(row.id);
    if (recent && now()-Number(recent.createdAt||0)<60*1000 && ['PENDING','ERROR'].includes(recent.status)) {
      return res.status(409).json({ok:false,error:'Ya existe un envío pendiente o recién generado.'});
    }

    queueLaunchActivationEmail(row.id,row.email,`${row.cityName} está abierta 🔓 Nuevo acceso a V/R Match`,baseUrl(req));
    db.prepare("UPDATE launch_waitlist_users SET status='CITY_READY',updated_at=? WHERE id=?").run(now(),row.id);
    logModerationAction(req.user.id,req.user.id,'launch_activation_resent',`Reenvío de acceso · ${row.cityName} · ${row.id}`,null);
    const mail=await processLaunchMailQueue(2);
    res.json({ok:true,mail});
  } catch(e) {
    console.error('Admin launch resend:',e);
    res.status(500).json({ok:false,error:'No se pudo reenviar el acceso.'});
  }
});

app.post('/api/admin/launch/mail/send', requireAuth, requireAdmin, rateLimit({limit:20,windowMs:60*60*1000,key:req=>req.user.id}), async (req,res) => {
  try { res.json({ok:true,...await processLaunchMailQueue(Math.max(1,Math.min(100,Number(req.body?.limit)||50)))}); }
  catch(e){res.status(500).json({ok:false,error:'No se pudieron procesar los correos.'});}
});

app.get('/api/admin/launch/cities/:slug/export.csv', requireAuth, requireAdmin, (req,res) => {
  const slug=normalizeLaunchCity(req.params.slug);
  const rows=db.prepare(`SELECT id,alias,age,email,city_slug,public_profile,referral_code,referred_by,status,app_user_id,activation_sent_at,activated_at,founder_qualified_at,created_at
    FROM launch_waitlist_users WHERE city_slug=? ORDER BY created_at ASC`).all(slug);
  const headers=['id','alias','age','email','city_slug','public_profile','referral_code','referred_by','status','app_user_id','activation_sent_at','activated_at','founder_qualified_at','created_at'];
  const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;
  const csv=[headers.join(','),...rows.map(r=>headers.map(h=>esc(r[h])).join(','))].join('\n');
  res.type('text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',`attachment; filename="vr-match-${slug}-waitlist.csv"`);
  res.send('\ufeff'+csv);
});

app.get('/api/admin/creator-codes', requireAuth, requireAdmin, (req,res) => {
  const days=[1,7,30,90].includes(Number(req.query.days))?Number(req.query.days):30;
  res.json({ok:true,days,creators:creatorPerformance(days)});
});
app.post('/api/admin/creator-codes', requireAuth, requireAdmin, rateLimit({limit:40,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  const code=normalizeCreatorCode(req.body?.code),displayName=cleanShortText(req.body?.displayName,80),campaign=cleanShortText(req.body?.campaign,120);
  if(code.length<3)return res.status(400).json({ok:false,error:'El código debe tener al menos 3 caracteres.'});
  if(displayName.length<2)return res.status(400).json({ok:false,error:'Escribe el nombre del creador o colaborador.'});
  if(db.prepare('SELECT 1 FROM creator_codes WHERE code=?').get(code))return res.status(409).json({ok:false,error:'Ese código ya existe.'});
  const ts=now();db.prepare('INSERT INTO creator_codes(code,display_name,campaign,active,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(code,displayName,campaign,1,req.user.id,ts,ts);
  res.status(201).json({ok:true,creator:creatorCodeRow(code,false),url:`${baseUrl(req)}/?register=1&creator=${encodeURIComponent(code)}&utm_source=creator&utm_medium=collab&utm_campaign=${encodeURIComponent(campaign||code)}`});
});
app.post('/api/admin/creator-codes/:code/toggle', requireAuth, requireAdmin, (req,res) => {
  const code=normalizeCreatorCode(req.params.code),row=creatorCodeRow(code,false);
  if(!row)return res.status(404).json({ok:false,error:'Código no encontrado.'});
  const active=req.body?.active===true?1:0;db.prepare('UPDATE creator_codes SET active=?,updated_at=? WHERE code=?').run(active,now(),code);
  res.json({ok:true,creator:creatorCodeRow(code,false)});
});


app.get('/api/admin/beta', requireAuth, requireAdmin, (req,res,next) => {
  try{
    ensureBetaSchemaCompatibility();
    const city=cleanCommunityCityName(req.query.city||BETA_DEFAULT_CITY)||BETA_DEFAULT_CITY;
    const status=['all','active','paused','completed','removed'].includes(String(req.query.status||''))?String(req.query.status):'all';
    const participants=betaAdminRows(city,status);
    const feedback=db.prepare(`SELECT f.id,f.user_id,f.rating,f.category,f.message,f.page,f.status,f.admin_note,f.created_at,f.updated_at,
        u.email,p.name,b.city,b.wave
        FROM beta_feedback f JOIN users u ON u.id=f.user_id LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN beta_memberships b ON b.user_id=f.user_id
        WHERE LOWER(COALESCE(b.city,''))=LOWER(?) ORDER BY f.created_at DESC LIMIT 80`).all(city);
    const summary=betaAdminSummary(city);
    res.json({ok:true,city,defaultCity:BETA_DEFAULT_CITY,bulkLimit:BETA_BULK_LIMIT,summary,participants,feedback});
  }catch(error){
    recordServerError('admin.beta.load',error,{userId:req.user?.id||null,city:String(req.query.city||'')});
    next(error);
  }
});

app.post('/api/admin/beta/bulk', requireAuth, requireAdmin, rateLimit({limit:8,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  if(String(req.body?.confirm||'').trim().toUpperCase()!=='BETA')return res.status(400).json({ok:false,error:'Escribe BETA para confirmar.'});
  const city=cleanCommunityCityName(req.body?.city||BETA_DEFAULT_CITY)||BETA_DEFAULT_CITY;
  const wave=clampInt(req.body?.wave,1,999,1),limit=clampInt(req.body?.limit,1,BETA_BULK_LIMIT,50),note=cleanShortText(req.body?.note,500);
  const rows=db.prepare(`SELECT u.id FROM users u LEFT JOIN profiles p ON p.user_id=u.id
      LEFT JOIN community_city_memberships cm ON cm.user_id=u.id LEFT JOIN community_cities c ON c.slug=cm.city_slug
      LEFT JOIN beta_memberships b ON b.user_id=u.id
      WHERE u.status='active' AND LOWER(COALESCE(c.name,p.city,''))=LOWER(?) AND b.user_id IS NULL
      ORDER BY u.last_seen_at DESC LIMIT ?`).all(city,limit);
  let added=0;
  const tx=db.transaction(items=>{for(const row of items){const result=addBetaMember(row.id,{city,wave,source:'admin_bulk',note});if(result.ok)added++;}});
  tx(rows);
  logModerationAction(req.user.id,req.user.id,'beta_bulk',`Beta ${city} · ola ${wave} · ${added} usuarios añadidos`,null);
  res.json({ok:true,added,candidates:rows.length,summary:betaAdminSummary(city)});
});

app.post('/api/admin/beta/users/:id/action', requireAuth, requireAdmin, rateLimit({limit:120,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  const target=String(req.params.id||''),action=String(req.body?.action||''),city=cleanCommunityCityName(req.body?.city||BETA_DEFAULT_CITY)||BETA_DEFAULT_CITY,wave=clampInt(req.body?.wave,1,999,1),note=cleanShortText(req.body?.note,500);
  const user=db.prepare('SELECT id,status FROM users WHERE id=?').get(target);
  if(!user)return res.status(404).json({ok:false,error:'Usuario no encontrado.'});
  if(!['add','pause','resume','complete','remove'].includes(action))return res.status(400).json({ok:false,error:'Acción beta no válida.'});
  if(action==='add' || action==='resume'){
    const result=addBetaMember(target,{city,wave,source:action==='add'?'admin':'admin_resume',note});
    if(!result.ok && result.reason==='inactive_user')return res.status(409).json({ok:false,error:'La cuenta no está activa.'});
    if(!result.ok && result.reason==='already_active')return res.json({ok:true,beta:betaState(target),alreadyActive:true});
  } else {
    const membership=betaMembership(target);
    if(!membership)return res.status(404).json({ok:false,error:'Ese usuario todavía no pertenece a la beta.'});
    const nextStatus=action==='pause'?'paused':action==='complete'?'completed':'removed',ts=now();
    db.prepare('UPDATE beta_memberships SET status=?,updated_at=?,ended_at=?,admin_note=? WHERE user_id=?').run(nextStatus,ts,nextStatus==='paused'?null:ts,note||membership.adminNote||'',target);
    if(action==='complete')createNotification(target,'system','Gracias por participar en la beta','Tu participación en esta fase de prueba ha quedado completada. Gracias por ayudarnos a mejorar VRMatch.',{reason:'beta_completed'});
  }
  logModerationAction(req.user.id,target,`beta_${action}`,note||`Beta ${city} · ola ${wave}`,null);
  res.json({ok:true,beta:betaState(target),summary:betaAdminSummary(city)});
});

app.post('/api/admin/beta/feedback/:id/action', requireAuth, requireAdmin, (req,res) => {
  const id=String(req.params.id||''),action=String(req.body?.action||''),note=cleanShortText(req.body?.note,500);
  const row=db.prepare('SELECT id,user_id,status FROM beta_feedback WHERE id=?').get(id);
  if(!row)return res.status(404).json({ok:false,error:'Feedback no encontrado.'});
  if(!['resolve','dismiss','reopen'].includes(action))return res.status(400).json({ok:false,error:'Acción no válida.'});
  const status=action==='resolve'?'resolved':action==='dismiss'?'dismissed':'open';
  db.prepare('UPDATE beta_feedback SET status=?,admin_note=?,updated_at=? WHERE id=?').run(status,note,now(),id);
  logModerationAction(req.user.id,row.user_id,`beta_feedback_${action}`,note,null);
  res.json({ok:true,status});
});

app.get('/api/admin/beta/export.csv', requireAuth, requireAdmin, (req,res) => {
  const city=cleanCommunityCityName(req.query.city||BETA_DEFAULT_CITY)||BETA_DEFAULT_CITY;
  const rows=betaAdminRows(city,'all');
  const headers=['email','name','city','wave','status','joined_at','last_seen_at','activation_percent','profile_ready','first_like','first_match','first_message','first_game','first_invite','d1','d7','feedback_count'];
  const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;
  const csvRows=rows.map(r=>({email:r.email,name:r.name||'',city:r.city,wave:r.wave,status:r.status,joined_at:new Date(Number(r.joined_at)).toISOString(),last_seen_at:r.last_seen_at?new Date(Number(r.last_seen_at)).toISOString():'',activation_percent:r.milestones.activationPercent,profile_ready:r.milestones.profileReady?1:0,first_like:r.milestones.firstLike?1:0,first_match:r.milestones.firstMatch?1:0,first_message:r.milestones.firstMessage?1:0,first_game:r.milestones.firstGame?1:0,first_invite:r.milestones.firstInvite?1:0,d1:r.milestones.d1?1:0,d7:r.milestones.d7?1:0,feedback_count:r.feedbackCount}));
  const csv=[headers.join(','),...csvRows.map(r=>headers.map(h=>esc(r[h])).join(','))].join('\n');
  res.type('text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="vrmatch-beta-${city.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.csv"`);res.send('\ufeff'+csv);
});

app.get('/api/admin/stats', requireAuth, requireAdmin, (req,res) => {
  const since24 = now() - 24*60*60*1000;
  const stats = {
    activeUsers: db.prepare("SELECT COUNT(*) n FROM users WHERE status='active'").get().n,
    suspendedUsers: db.prepare("SELECT COUNT(*) n FROM users WHERE status='suspended'").get().n,
    matches: db.prepare('SELECT COUNT(*) n FROM matches WHERE active=1').get().n,
    openReports: db.prepare("SELECT COUNT(*) n FROM reports WHERE status='open'").get().n,
    messages: db.prepare('SELECT COUNT(*) n FROM messages').get().n,
    actions24h: db.prepare('SELECT COUNT(*) n FROM moderation_actions WHERE created_at>=?').get(since24).n
  };
  res.json({ok:true,stats});
});

app.get('/api/admin/metrics', requireAuth, requireAdmin, (req,res) => {
  const days = [1,7,30,90].includes(Number(req.query.days)) ? Number(req.query.days) : 7;
  const until = now();
  const since = until - days*24*60*60*1000;
  const metric = {
    visits: db.prepare("SELECT COUNT(DISTINCT session_id) n FROM growth_events WHERE event_name='page_view' AND created_at>=? AND session_id<>''").get(since).n,
    registrationStarted: db.prepare("SELECT COUNT(DISTINCT session_id) n FROM growth_events WHERE event_name='registration_started' AND created_at>=? AND session_id<>''").get(since).n,
    registered: db.prepare('SELECT COUNT(*) n FROM users WHERE created_at>=?').get(since).n,
    activeUsers: db.prepare("SELECT COUNT(*) n FROM users WHERE status='active' AND last_seen_at>=?").get(since).n,
    likes: db.prepare('SELECT COUNT(*) n FROM likes WHERE created_at>=?').get(since).n,
    matches: db.prepare('SELECT COUNT(*) n FROM matches WHERE created_at>=?').get(since).n,
    messages: db.prepare('SELECT COUNT(*) n FROM messages WHERE created_at>=?').get(since).n,
    gamesStarted: db.prepare('SELECT COUNT(*) n FROM game_sessions WHERE started_at>=?').get(since).n,
    gamesCompleted: db.prepare("SELECT COUNT(*) n FROM game_sessions WHERE status='completed' AND ended_at>=?").get(since).n,
    quickChallenges: db.prepare('SELECT COUNT(*) n FROM quick_challenges WHERE created_at>=?').get(since).n,
    gameInvites: db.prepare('SELECT COUNT(*) n FROM game_invitations WHERE created_at>=?').get(since).n,
    gameInvitesAccepted: db.prepare("SELECT COUNT(*) n FROM game_invitations WHERE status='accepted' AND created_at>=?").get(since).n,
    reports: db.prepare('SELECT COUNT(*) n FROM reports WHERE created_at>=?').get(since).n,
    feedback: db.prepare('SELECT COUNT(*) n FROM feedback WHERE created_at>=?').get(since).n,
    clientErrors: db.prepare('SELECT COUNT(*) n FROM client_errors WHERE created_at>=?').get(since).n,
    referralVisits: db.prepare("SELECT COUNT(*) n FROM user_referral_events WHERE event_type='VISIT' AND created_at>=?").get(since).n,
    referralShares: db.prepare("SELECT COUNT(*) n FROM user_referral_events WHERE event_type LIKE 'SHARE_%' AND created_at>=?").get(since).n,
    referralSignups: db.prepare('SELECT COUNT(*) n FROM user_referral_attributions WHERE attributed_at>=?').get(since).n,
    referralActive: db.prepare(`SELECT COUNT(*) n FROM user_referral_attributions a JOIN users u ON u.id=a.invitee_user_id JOIN profiles p ON p.user_id=u.id JOIN community_city_memberships cm ON cm.user_id=u.id WHERE a.attributed_at>=? AND u.status='active' AND json_valid(COALESCE(p.photos_json,'[]')) AND json_array_length(COALESCE(p.photos_json,'[]'))>=1 AND EXISTS(SELECT 1 FROM likes l WHERE l.from_user=u.id LIMIT 1)`).get(since).n,
    creatorSignups: db.prepare('SELECT COUNT(*) n FROM creator_attributions WHERE attributed_at>=?').get(since).n,
    retentionEmails: db.prepare("SELECT COUNT(*) n FROM retention_email_log WHERE status='sent' AND sent_at>=?").get(since).n,
    pushesSent: db.prepare("SELECT COUNT(*) n FROM push_delivery_log WHERE status='sent' AND sent_at>=?").get(since).n,
    pushesOpened: db.prepare("SELECT COUNT(*) n FROM push_delivery_log WHERE status='sent' AND sent_at>=? AND opened_at IS NOT NULL").get(since).n,
    verifiedTotal: db.prepare('SELECT COUNT(*) n FROM users WHERE email_verified=1').get().n,
    activePlus: db.prepare("SELECT COUNT(*) n FROM plus_memberships WHERE status='active' AND (expires_at IS NULL OR expires_at>?)").get(until).n
  };
  const cohortBase='u.created_at>=?';
  const funnel = {
    visits:Number(metric.visits||0),
    registrationStarted:Number(metric.registrationStarted||0),
    registered:Number(metric.registered||0),
    city: db.prepare(`SELECT COUNT(*) n FROM users u WHERE ${cohortBase} AND EXISTS(SELECT 1 FROM community_city_memberships c WHERE c.user_id=u.id)`).get(since).n,
    profile: db.prepare(`SELECT COUNT(*) n FROM users u WHERE ${cohortBase} AND EXISTS(SELECT 1 FROM profiles p WHERE p.user_id=u.id)`).get(since).n,
    profileReady: db.prepare(`SELECT COUNT(*) n FROM users u WHERE ${cohortBase} AND EXISTS(SELECT 1 FROM profiles p WHERE p.user_id=u.id AND TRIM(COALESCE(p.bio,''))<>'' AND LENGTH(TRIM(COALESCE(p.bio,'')))>=20 AND json_valid(COALESCE(p.photos_json,'[]')) AND json_array_length(COALESCE(p.photos_json,'[]'))>=1 AND json_valid(COALESCE(p.interests_json,'[]')) AND json_array_length(COALESCE(p.interests_json,'[]'))>=2)`).get(since).n,
    liked: db.prepare(`SELECT COUNT(*) n FROM users u WHERE ${cohortBase} AND EXISTS(SELECT 1 FROM likes l WHERE l.from_user=u.id)`).get(since).n,
    matched: db.prepare(`SELECT COUNT(*) n FROM users u WHERE ${cohortBase} AND EXISTS(SELECT 1 FROM matches m WHERE m.user1=u.id OR m.user2=u.id)`).get(since).n,
    messaged: db.prepare(`SELECT COUNT(*) n FROM users u WHERE ${cohortBase} AND EXISTS(SELECT 1 FROM messages m WHERE m.from_user=u.id)`).get(since).n,
    interacted: db.prepare(`SELECT COUNT(*) n FROM users u WHERE ${cohortBase} AND (EXISTS(SELECT 1 FROM messages m WHERE m.from_user=u.id) OR EXISTS(SELECT 1 FROM chat_events ce WHERE ce.actor_user=u.id AND ce.type IN ('game_invite','quick_challenge')))`).get(since).n,
    played: db.prepare(`SELECT COUNT(*) n FROM users u WHERE ${cohortBase} AND EXISTS(SELECT 1 FROM game_sessions g WHERE g.user1=u.id OR g.user2=u.id)`).get(since).n,
    shared: db.prepare(`SELECT COUNT(DISTINCT e.user_id) n FROM user_referral_events e JOIN users u ON u.id=e.user_id WHERE u.created_at>=? AND e.event_type LIKE 'SHARE_%'`).get(since).n
  };
  function grouped(table,col){
    const rows=db.prepare(`SELECT date(${col}/1000,'unixepoch') day,COUNT(*) n FROM ${table} WHERE ${col}>=? GROUP BY day`).all(since);
    return new Map(rows.map(r=>[r.day,Number(r.n)||0]));
  }
  const registrations=grouped('users','created_at'), matches=grouped('matches','created_at'), messages=grouped('messages','created_at'), games=grouped('game_sessions','started_at');
  const visitsRows=db.prepare(`SELECT date(created_at/1000,'unixepoch') day,COUNT(DISTINCT session_id) n FROM growth_events WHERE event_name='page_view' AND created_at>=? AND session_id<>'' GROUP BY day`).all(since);
  const visitsByDay=new Map(visitsRows.map(r=>[r.day,Number(r.n)||0]));
  const daily=[];
  const first = new Date(since); first.setUTCHours(0,0,0,0);
  const last = new Date(until); last.setUTCHours(0,0,0,0);
  for(let t=first.getTime();t<=last.getTime();t+=24*60*60*1000){
    const day=new Date(t).toISOString().slice(0,10);
    daily.push({day,visits:visitsByDay.get(day)||0,registered:registrations.get(day)||0,matches:matches.get(day)||0,messages:messages.get(day)||0,games:games.get(day)||0});
  }
  const visitChannels=db.prepare(`SELECT source,medium,COUNT(DISTINCT session_id) visits
    FROM growth_events WHERE event_name='page_view' AND created_at>=? AND session_id<>'' GROUP BY source,medium`).all(since);
  const signupChannels=db.prepare(`SELECT COALESCE(NULLIF(a.source,''),'direct') source,COALESCE(NULLIF(a.medium,''),'none') medium,COUNT(*) signups
    FROM users u LEFT JOIN growth_acquisition a ON a.user_id=u.id WHERE u.created_at>=? GROUP BY source,medium`).all(since);
  const channelMap=new Map();
  for(const r of visitChannels){const key=`${r.source}|${r.medium}`;channelMap.set(key,{source:r.source||'direct',medium:r.medium||'none',visits:Number(r.visits)||0,signups:0});}
  for(const r of signupChannels){const key=`${r.source}|${r.medium}`;const row=channelMap.get(key)||{source:r.source||'direct',medium:r.medium||'none',visits:0,signups:0};row.signups=Number(r.signups)||0;channelMap.set(key,row);}
  const channels=[...channelMap.values()].map(r=>({...r,conversion:r.visits?Math.round(r.signups*1000/r.visits)/10:null})).sort((a,b)=>b.signups-a.signups||b.visits-a.visits).slice(0,20);
  const campaigns=db.prepare(`SELECT COALESCE(NULLIF(a.source,''),'direct') source,COALESCE(NULLIF(a.medium,''),'none') medium,
      COALESCE(NULLIF(a.campaign,''),'(sin campaña)') campaign,COALESCE(NULLIF(a.content,''),'') content,COUNT(*) signups
    FROM users u LEFT JOIN growth_acquisition a ON a.user_id=u.id WHERE u.created_at>=?
    GROUP BY source,medium,campaign,content ORDER BY signups DESC LIMIT 40`).all(since).map(r=>({...r,signups:Number(r.signups)||0}));
  const campaignVisits=db.prepare(`SELECT source,medium,COALESCE(NULLIF(campaign,''),'(sin campaña)') campaign,COALESCE(NULLIF(content,''),'') content,COUNT(DISTINCT session_id) visits
    FROM growth_events WHERE event_name='page_view' AND created_at>=? AND session_id<>'' GROUP BY source,medium,campaign,content`).all(since);
  const cvMap=new Map(campaignVisits.map(r=>[`${r.source}|${r.medium}|${r.campaign}|${r.content}`,Number(r.visits)||0]));
  const campaignPerformance=campaigns.map(r=>{const visits=cvMap.get(`${r.source}|${r.medium}|${r.campaign}|${r.content}`)||0;return {...r,visits,conversion:visits?Math.round(r.signups*1000/visits)/10:null};}).sort((a,b)=>b.signups-a.signups||b.visits-a.visits).slice(0,25);
  const cities=db.prepare(`SELECT c.name city,COUNT(*) signups FROM users u JOIN community_city_memberships m ON m.user_id=u.id JOIN community_cities c ON c.slug=m.city_slug WHERE u.created_at>=? GROUP BY c.slug,c.name ORDER BY signups DESC LIMIT 15`).all(since).map(r=>({city:r.city,signups:Number(r.signups)||0}));
  const creators=creatorPerformance(days);
  const cityLeaderboard=communityCityLeaderboard(days,15);
  const retentionEmails=db.prepare(`SELECT r.kind,COUNT(*) sent,SUM(CASE WHEN u.last_seen_at>r.sent_at THEN 1 ELSE 0 END) activity_after
    FROM retention_email_log r JOIN users u ON u.id=r.user_id WHERE r.status='sent' AND r.sent_at>=? GROUP BY r.kind ORDER BY sent DESC`).all(since)
    .map(r=>({kind:r.kind,sent:Number(r.sent)||0,activityAfter:Number(r.activity_after)||0}));
  const pushStats=db.prepare(`SELECT p.kind,COUNT(*) sent,SUM(CASE WHEN p.opened_at IS NOT NULL THEN 1 ELSE 0 END) opened,
      SUM(CASE WHEN u.last_seen_at>p.sent_at THEN 1 ELSE 0 END) activity_after,
      SUM(CASE WHEN EXISTS(SELECT 1 FROM likes l WHERE l.from_user=p.user_id AND l.created_at>p.sent_at) THEN 1 ELSE 0 END) liked_after,
      SUM(CASE WHEN EXISTS(SELECT 1 FROM matches m WHERE (m.user1=p.user_id OR m.user2=p.user_id) AND m.created_at>p.sent_at) THEN 1 ELSE 0 END) matched_after
    FROM push_delivery_log p JOIN users u ON u.id=p.user_id WHERE p.status='sent' AND p.sent_at>=?
    GROUP BY p.kind ORDER BY sent DESC`).all(since).map(r=>({kind:r.kind,sent:Number(r.sent)||0,opened:Number(r.opened)||0,activityAfter:Number(r.activity_after)||0,likedAfter:Number(r.liked_after)||0,matchedAfter:Number(r.matched_after)||0}));
  const uploads=folderStatsSafe(UPLOAD_DIR), mem=process.memoryUsage();
  const system={
    uptimeSeconds:Math.round(process.uptime()),rssMb:Math.round(mem.rss/1024/1024),heapUsedMb:Math.round(mem.heapUsed/1024/1024),
    onlineUsers:onlineUsers.size,sockets:Number(io.engine?.clientsCount||0),dbBytes:fileSizeSafe(DB_PATH),uploadFiles:uploads.files,uploadBytes:uploads.bytes
  };
  const recentErrors=db.prepare(`SELECT ce.id,ce.message,ce.source,ce.line,ce.column_no,ce.page,ce.app_version,ce.created_at,u.email,p.name
    FROM client_errors ce LEFT JOIN users u ON u.id=ce.user_id LEFT JOIN profiles p ON p.user_id=ce.user_id
    ORDER BY ce.created_at DESC LIMIT 20`).all();
  res.json({ok:true,days,metric,funnel,daily,channels,campaigns:campaignPerformance,cities,creators,cityLeaderboard,retentionEmails,pushStats,system,recentErrors});
});

app.get('/api/admin/growth/export.csv', requireAuth, requireAdmin, (req,res) => {
  const days=[1,7,30,90].includes(Number(req.query.days))?Number(req.query.days):30, since=now()-days*86400000;
  const rawRows=db.prepare(`SELECT u.id user_id,u.created_at registered_at,u.email,COALESCE(p.name,'') name,COALESCE(c.name,p.city,'') city,
    COALESCE(a.source,'direct') source,COALESCE(a.medium,'none') medium,COALESCE(a.campaign,'') campaign,COALESCE(a.content,'') content,COALESCE(a.term,'') term,COALESCE(a.landing_path,'') landing_path,
    CASE WHEN cm.user_id IS NOT NULL THEN 1 ELSE 0 END step_city,
    CASE WHEN p.user_id IS NOT NULL AND LENGTH(TRIM(COALESCE(p.name,'')))>=2 AND COALESCE(p.age,0)>=18 THEN 1 ELSE 0 END step_profile,
    CASE WHEN json_valid(COALESCE(p.photos_json,'[]')) AND json_array_length(COALESCE(p.photos_json,'[]'))>=1 THEN 1 ELSE 0 END step_photo,
    CASE WHEN LENGTH(TRIM(COALESCE(p.bio,'')))>=20 AND json_valid(COALESCE(p.interests_json,'[]')) AND json_array_length(COALESCE(p.interests_json,'[]'))>=2 THEN 1 ELSE 0 END step_about,
    EXISTS(SELECT 1 FROM likes l WHERE l.from_user=u.id LIMIT 1) step_like,
    EXISTS(SELECT 1 FROM matches mx WHERE mx.user1=u.id OR mx.user2=u.id LIMIT 1) step_match,
    EXISTS(SELECT 1 FROM messages msg WHERE msg.from_user=u.id LIMIT 1) step_message
    FROM users u LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN growth_acquisition a ON a.user_id=u.id
    LEFT JOIN community_city_memberships cm ON cm.user_id=u.id LEFT JOIN community_cities c ON c.slug=cm.city_slug
    WHERE u.created_at>=? ORDER BY u.created_at DESC`).all(since);
  const stepKeys=['city','profile','photo','about','like','match','message'];
  const rows=rawRows.map(r=>{const done=stepKeys.filter(k=>Number(r[`step_${k}`])===1).length;const next=stepKeys.find(k=>Number(r[`step_${k}`])!==1)||'done';const out={...r,activation_percent:Math.round(done*100/stepKeys.length),profile_ready:Number(r.step_profile)&&Number(r.step_photo)&&Number(r.step_about)?1:0,next_step:next};delete out.user_id;for(const k of stepKeys)delete out[`step_${k}`];return out;});
  const headers=['registered_at','email','name','city','activation_percent','profile_ready','next_step','source','medium','campaign','content','term','landing_path'];
  const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;
  const csv=[headers.join(','),...rows.map(r=>headers.map(h=>esc(r[h])).join(','))].join('\n');
  res.type('text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="vrmatch-growth-${days}d.csv"`);res.send('\ufeff'+csv);
});

app.get('/api/admin/feedback', requireAuth, requireAdmin, (req,res) => {
  const status = ['open','resolved','dismissed','all'].includes(String(req.query.status||'open')) ? String(req.query.status||'open') : 'open';
  const kind = ['bug','idea','ux','other',''].includes(String(req.query.kind||'')) ? String(req.query.kind||'') : '';
  const where=[],params=[];
  if(status!=='all'){where.push('f.status=?');params.push(status);}
  if(kind){where.push('f.kind=?');params.push(kind);}
  const rows=db.prepare(`SELECT f.*,u.email,p.name FROM feedback f JOIN users u ON u.id=f.user_id LEFT JOIN profiles p ON p.user_id=f.user_id
    ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY CASE WHEN f.status='open' THEN 0 ELSE 1 END,f.created_at DESC LIMIT 250`).all(...params);
  res.json({ok:true,feedback:rows});
});

app.post('/api/admin/feedback/:id/action', requireAuth, requireAdmin, (req,res) => {
  const row=db.prepare('SELECT * FROM feedback WHERE id=?').get(String(req.params.id||''));
  if(!row)return res.status(404).json({ok:false,error:'Comentario no encontrado.'});
  const action=String(req.body?.action||'');
  if(!['resolve','dismiss','reopen'].includes(action))return res.status(400).json({ok:false,error:'Acción no válida.'});
  const status=action==='resolve'?'resolved':action==='dismiss'?'dismissed':'open';
  const note=cleanShortText(req.body?.note,500);
  db.prepare('UPDATE feedback SET status=?,admin_note=?,updated_at=? WHERE id=?').run(status,note,now(),row.id);
  logModerationAction(req.user.id,row.user_id,`feedback_${action}`,note,null);
  res.json({ok:true,status});
});

app.get('/api/admin/security', requireAuth, requireAdmin, (req,res) => {
  const requested=String(req.query.status||'pending');
  const status=['pending','approved','rejected','all'].includes(requested)?requested:'pending';
  const where=status==='all'?'':'WHERE v.status=?';
  const params=status==='all'?[]:[status];
  const verifications=db.prepare(`SELECT v.id,v.user_id,v.status,v.note,v.created_at,v.updated_at,v.reviewed_at,u.email,u.status user_status,p.name,p.city,p.avatar,p.profile_verified
    FROM profile_verification_requests v JOIN users u ON u.id=v.user_id LEFT JOIN profiles p ON p.user_id=v.user_id
    ${where} ORDER BY CASE WHEN v.status='pending' THEN 0 ELSE 1 END,v.created_at ASC LIMIT 200`).all(...params);
  const candidates=db.prepare(`SELECT u.id,u.email,u.status,u.created_at,u.last_seen_at,p.name,p.city,p.avatar,p.profile_verified
    FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.status='active' ORDER BY u.last_seen_at DESC LIMIT 800`).all();
  const risk=candidates.map(row=>({...row,risk:securityRiskForUser(row.id)})).filter(row=>row.risk.score>0).sort((a,b)=>b.risk.score-a.risk.score).slice(0,80);
  res.json({ok:true,verifications,risk});
});

app.get('/api/admin/verifications/:id/proof', requireAuth, requireAdmin, rateLimit({limit:120,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  const row=db.prepare('SELECT proof_filename,status FROM profile_verification_requests WHERE id=?').get(String(req.params.id||''));
  if(!row)return res.status(404).json({ok:false,error:'Solicitud no encontrada.'});
  if(!row.proof_filename)return res.status(404).json({ok:false,error:'La prueba ya fue eliminada tras la revisión.'});
  const base=path.basename(row.proof_filename),full=path.join(VERIFICATION_DIR,base);
  if(!base.startsWith('verify_')||!fs.existsSync(full))return res.status(404).json({ok:false,error:'La prueba ya no está disponible.'});
  const buffer=fs.readFileSync(full);
  res.setHeader('Cache-Control','no-store');
  res.json({ok:true,image:`data:${verificationMime(base)};base64,${buffer.toString('base64')}`});
});

app.post('/api/admin/verifications/:id/action', requireAuth, requireAdmin, rateLimit({limit:120,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  const row=db.prepare('SELECT * FROM profile_verification_requests WHERE id=?').get(String(req.params.id||''));
  if(!row)return res.status(404).json({ok:false,error:'Solicitud no encontrada.'});
  if(row.status!=='pending')return res.status(409).json({ok:false,error:'Esta solicitud ya fue revisada.'});
  const action=String(req.body?.action||'');
  if(!['approve','reject'].includes(action))return res.status(400).json({ok:false,error:'Acción no válida.'});
  const note=cleanShortText(req.body?.note,500),ts=now(),status=action==='approve'?'approved':'rejected';
  const tx=db.transaction(()=>{
    db.prepare('UPDATE profile_verification_requests SET status=?,note=?,updated_at=?,reviewed_at=?,reviewed_by=? WHERE id=?').run(status,note,ts,ts,req.user.id,row.id);
    if(action==='approve')db.prepare('UPDATE profiles SET profile_verified=1,profile_verified_at=?,updated_at=? WHERE user_id=?').run(ts,ts,row.user_id);
    else db.prepare('UPDATE profiles SET profile_verified=0,profile_verified_at=NULL,updated_at=? WHERE user_id=?').run(ts,row.user_id);
    logModerationAction(req.user.id,row.user_id,action==='approve'?'verify_profile':'reject_verification',note,null);
  });
  tx();
  removeVerificationProof(row.proof_filename);
  db.prepare("UPDATE profile_verification_requests SET proof_filename='' WHERE id=?").run(row.id);
  createNotification(row.user_id,'system',action==='approve'?'Perfil verificado':'Revisión de perfil',action==='approve'?'Tu perfil ya muestra la insignia de verificación.':'Tu solicitud de verificación necesita una nueva selfie.',{verification:true});
  emitToUser(row.user_id,'dating_profiles',discoverFor(row.user_id));broadcastDiscovery();emitMatches(row.user_id);
  res.json({ok:true,status,...verificationState(row.user_id)});
});

app.get('/api/admin/reports', requireAuth, requireAdmin, (req,res) => {
  const requestedStatus = String(req.query.status || 'open');
  const status = ['open','resolved','dismissed','all'].includes(requestedStatus) ? requestedStatus : 'open';
  const reason = VALID_REPORT_REASONS.has(String(req.query.reason || '')) ? String(req.query.reason) : '';
  const q = cleanShortText(req.query.q,80).toLowerCase();
  const where = [], params = [];
  if (status !== 'all') { where.push('r.status=?'); params.push(status); }
  if (reason) { where.push('r.reason=?'); params.push(reason); }
  if (q) {
    where.push(`(
      LOWER(ru.email) LIKE ? OR LOWER(tu.email) LIKE ? OR
      LOWER(COALESCE(rp.name,'')) LIKE ? OR LOWER(COALESCE(tp.name,'')) LIKE ? OR
      LOWER(COALESCE(r.details,'')) LIKE ?
    )`);
    const like = `%${q}%`; params.push(like,like,like,like,like);
  }
  const sql = `SELECT r.*,
    ru.email reporter_email, tu.email reported_email, tu.status reported_status,tu.suspended_until,
    rp.name reporter_name, tp.name reported_name,
    (SELECT COUNT(*) FROM reports rr WHERE rr.reported=r.reported) reported_reports_total,
    (SELECT COUNT(DISTINCT rr.reporter) FROM reports rr WHERE rr.reported=r.reported) unique_reporters_total,
    (SELECT COUNT(*) FROM blocks bb WHERE bb.blocked=r.reported) blocks_received_total,
    (SELECT COUNT(*) FROM moderation_actions ma WHERE ma.target_user=r.reported AND ma.action='warning') warnings_total
    FROM reports r
    JOIN users ru ON ru.id=r.reporter
    JOIN users tu ON tu.id=r.reported
    LEFT JOIN profiles rp ON rp.user_id=r.reporter
    LEFT JOIN profiles tp ON tp.user_id=r.reported
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY CASE WHEN r.status='open' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 200`;
  const rows = db.prepare(sql).all(...params).map(row => {
    const evidence = parseEvidence(row.evidence_json);
    delete row.evidence_json;
    return {...row,evidence};
  });
  res.json({ok:true,reports:rows});
});

app.post('/api/admin/reports/:id/action', requireAuth, requireAdmin, (req,res) => {
  const report = db.prepare('SELECT * FROM reports WHERE id=?').get(String(req.params.id||''));
  if (!report) return res.status(404).json({ok:false,error:'Denuncia no encontrada.'});
  const action = String(req.body?.action||'');
  const note = cleanShortText(req.body?.note,500);
  if (!['resolve','dismiss','suspend','reactivate'].includes(action)) return res.status(400).json({ok:false,error:'Acción no válida.'});
  const status = action === 'dismiss' ? 'dismissed' : 'resolved';
  db.prepare('UPDATE reports SET status=?,updated_at=?,moderator_note=? WHERE id=?').run(status,now(),note,report.id);
  if (action === 'suspend') suspendUser(report.reported);
  if (action === 'reactivate') reactivateUser(report.reported);
  logModerationAction(req.user.id,report.reported,action,note,report.id);
  broadcastDiscovery(); emitMatches(report.reported);
  res.json({ok:true,status,userStatus:db.prepare('SELECT status FROM users WHERE id=?').get(report.reported)?.status||null});
});


app.get('/newsletter/unsubscribe', (req,res) => {
  const token=String(req.query.token||'').trim();
  const row=token?db.prepare(`SELECT t.user_id,u.email FROM newsletter_unsubscribe_tokens t JOIN users u ON u.id=t.user_id WHERE t.token=?`).get(token):null;
  if(!row)return res.status(404).type('html').send('<!doctype html><html lang="es"><meta charset="utf-8"><body style="font-family:Arial;background:#09090d;color:white;padding:40px"><h1>Enlace no válido</h1><p>Este enlace de preferencias no está disponible.</p><a style="color:#ff4f88" href="/">Volver a V/R Match</a></body></html>');
  res.setHeader('Cache-Control','no-store');
  res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Novedades · V/R Match</title></head><body style="margin:0;background:#09090d;color:#f8f7fb;font-family:Arial,sans-serif"><main style="max-width:560px;margin:70px auto;padding:28px"><div style="color:#ff4f88;font-weight:900;letter-spacing:.15em">V/R MATCH</div><h1>¿Dejar de recibir novedades?</h1><p style="color:#b8b6c2;line-height:1.6">Seguirás recibiendo los avisos imprescindibles de seguridad o de tu cuenta. Solo desactivaremos los emails de novedades y mejoras de V/R Match.</p><form method="post" action="/newsletter/unsubscribe"><input type="hidden" name="token" value="${escapeEmailHtml(token)}"><button style="border:0;border-radius:12px;background:#ff2f78;color:white;font-weight:900;padding:14px 18px;cursor:pointer" type="submit">Sí, desactivar novedades</button></form><p style="margin-top:24px"><a style="color:#ff78ab" href="/">Cancelar y volver</a></p></main></body></html>`);
});
app.post('/newsletter/unsubscribe', express.urlencoded({extended:false}), (req,res) => {
  const token=String(req.body?.token||'').trim();
  const row=token?db.prepare('SELECT user_id FROM newsletter_unsubscribe_tokens WHERE token=?').get(token):null;
  if(!row)return res.status(404).type('html').send('<!doctype html><html lang="es"><meta charset="utf-8"><body style="font-family:Arial;background:#09090d;color:white;padding:40px"><h1>Enlace no válido</h1></body></html>');
  const ts=now();
  db.prepare(`INSERT INTO notification_preferences(user_id,newsletter_email,updated_at) VALUES(?,0,?) ON CONFLICT(user_id) DO UPDATE SET newsletter_email=0,updated_at=excluded.updated_at`).run(row.user_id,ts);
  db.prepare("UPDATE newsletter_queue SET status='cancelled',last_error='' WHERE user_id=? AND status IN ('pending','error')").run(row.user_id);
  res.setHeader('Cache-Control','no-store');
  res.type('html').send('<!doctype html><html lang="es"><meta charset="utf-8"><body style="margin:0;background:#09090d;color:#f8f7fb;font-family:Arial,sans-serif"><main style="max-width:560px;margin:70px auto;padding:28px"><div style="color:#ff4f88;font-weight:900;letter-spacing:.15em">V/R MATCH</div><h1>Novedades desactivadas</h1><p style="color:#b8b6c2">Puedes volver a activarlas cuando quieras desde Notificaciones.</p><a style="color:#ff78ab" href="/">Volver a V/R Match</a></main></body></html>');
});

app.get('/api/admin/newsletters', requireAuth, requireAdmin, (req,res) => {
  const city=cleanShortText(req.query.city,80);
  const campaigns=db.prepare(`SELECT c.*,
    (SELECT COUNT(*) FROM newsletter_queue q WHERE q.campaign_id=c.id) total,
    (SELECT COUNT(*) FROM newsletter_queue q WHERE q.campaign_id=c.id AND q.status='sent') sent,
    (SELECT COUNT(*) FROM newsletter_queue q WHERE q.campaign_id=c.id AND q.status='error') errors,
    (SELECT COUNT(*) FROM newsletter_queue q WHERE q.campaign_id=c.id AND q.status='cancelled') cancelled
    FROM newsletter_campaigns c ORDER BY c.created_at DESC LIMIT 30`).all();
  const eligible=newsletterEligibleUsers(city).length;
  res.json({ok:true,smtpConfigured:SMTP_CONFIGURED,eligible,city,campaigns});
});
app.post('/api/admin/newsletters/test', requireAuth, requireAdmin, rateLimit({limit:12,windowMs:60*60*1000,key:req=>req.user.id}), async (req,res) => {
  if(!SMTP_CONFIGURED)return res.status(503).json({ok:false,error:'SMTP no está configurado.'});
  const p=newsletterPayload(req.body||{});
  if(!p.subject||!p.title||p.bodyText.length<10)return res.status(400).json({ok:false,error:'Completa asunto, título y contenido.'});
  const account=db.prepare('SELECT email FROM users WHERE id=?').get(req.user.id);
  if(!account?.email)return res.status(400).json({ok:false,error:'Tu cuenta administradora no tiene email.'});
  await sendEmail({to:account.email,subject:`[PRUEBA] ${p.subject}`,text:`${p.title}\n\n${p.bodyText}${p.ctaUrl?`\n\n${p.ctaUrl}`:''}`,html:renderNewsletterEmail({subject:p.subject,preheader:p.preheader,eyebrow:p.eyebrow,title:p.title,body_text:p.bodyText,cta_label:p.ctaLabel,cta_url:p.ctaUrl},'',true)});
  logModerationAction(req.user.id,req.user.id,'newsletter_test',p.subject,null);
  res.json({ok:true,email:account.email});
});
app.post('/api/admin/newsletters/send', requireAuth, requireAdmin, rateLimit({limit:6,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  if(!SMTP_CONFIGURED)return res.status(503).json({ok:false,error:'SMTP no está configurado.'});
  if(String(req.body?.confirm||'').trim().toUpperCase()!=='ENVIAR')return res.status(400).json({ok:false,error:'Confirma el envío escribiendo ENVIAR.'});
  const p=newsletterPayload(req.body||{});
  if(!p.subject||!p.title||p.bodyText.length<10)return res.status(400).json({ok:false,error:'Completa asunto, título y contenido.'});
  const users=newsletterEligibleUsers(p.audienceCity);
  if(!users.length)return res.status(409).json({ok:false,error:'No hay destinatarios elegibles para este envío.'});
  const id=safeId('nl'),ts=now();
  const tx=db.transaction(()=>{
    db.prepare(`INSERT INTO newsletter_campaigns(id,subject,preheader,eyebrow,title,body_text,cta_label,cta_url,audience_city,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,'queued',?,?)`).run(id,p.subject,p.preheader,p.eyebrow,p.title,p.bodyText,p.ctaLabel,p.ctaUrl,p.audienceCity,req.user.id,ts);
    const ins=db.prepare(`INSERT INTO newsletter_queue(id,campaign_id,user_id,status,attempts,last_error,created_at) VALUES(?,?,?,'pending',0,'',?)`);
    for(const u of users)ins.run(safeId('nlq'),id,u.id,ts);
  }); tx();
  logModerationAction(req.user.id,req.user.id,'newsletter_queued',`${p.subject} · ${users.length} destinatarios${p.audienceCity?` · ${p.audienceCity}`:''}`,null);
  setImmediate(()=>processNewsletterQueue().catch(e=>recordServerError('newsletter.manual_start',e,{campaignId:id})));
  res.json({ok:true,id,queued:users.length});
});
app.post('/api/admin/newsletters/:id/process', requireAuth, requireAdmin, rateLimit({limit:30,windowMs:60*60*1000,key:req=>req.user.id}), async (req,res) => {
  const id=String(req.params.id||''); const c=db.prepare('SELECT id,status FROM newsletter_campaigns WHERE id=?').get(id);
  if(!c)return res.status(404).json({ok:false,error:'Campaña no encontrada.'});
  if(c.status==='cancelled'||c.status==='completed')return res.status(409).json({ok:false,error:'Esta campaña ya no tiene envíos pendientes.'});
  res.json({ok:true,...await processNewsletterQueue(NEWSLETTER_BATCH_SIZE)});
});
app.post('/api/admin/newsletters/:id/cancel', requireAuth, requireAdmin, (req,res) => {
  const id=String(req.params.id||''); const c=db.prepare('SELECT id,status FROM newsletter_campaigns WHERE id=?').get(id);
  if(!c)return res.status(404).json({ok:false,error:'Campaña no encontrada.'});
  db.transaction(()=>{db.prepare("UPDATE newsletter_campaigns SET status='cancelled',completed_at=? WHERE id=?").run(now(),id);db.prepare("UPDATE newsletter_queue SET status='cancelled',last_error='' WHERE campaign_id=? AND status IN ('pending','error')").run(id);})();
  logModerationAction(req.user.id,req.user.id,'newsletter_cancelled',id,null);
  res.json({ok:true});
});

app.get('/api/admin/city-invites', requireAuth, requireAdmin, (req,res) => {
  const missing=Number(db.prepare(`SELECT COUNT(*) n FROM users u LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN community_city_memberships m ON m.user_id=u.id WHERE u.status='active' AND m.user_id IS NULL AND TRIM(COALESCE(p.city,''))=''`).get()?.n||0);
  const invited7d=Number(db.prepare('SELECT COUNT(DISTINCT user_id) n FROM profile_city_invites WHERE created_at>?').get(now()-7*86400000)?.n||0);
  const completed30d=Number(db.prepare('SELECT COUNT(DISTINCT user_id) n FROM profile_city_invites WHERE completed_at>?').get(now()-30*86400000)?.n||0);
  const pendingEmail=Number(db.prepare("SELECT COUNT(*) n FROM profile_city_invites WHERE email_status IN ('pending','error') AND email_attempts<4").get()?.n||0);
  const recent=db.prepare(`SELECT i.id,i.user_id,i.source,i.email_requested,i.email_status,i.email_sent_at,i.created_at,i.completed_at,u.email,p.name,COALESCE(c.name,p.city,'') city
    FROM profile_city_invites i JOIN users u ON u.id=i.user_id LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN community_city_memberships m ON m.user_id=u.id LEFT JOIN community_cities c ON c.slug=m.city_slug ORDER BY i.created_at DESC LIMIT 20`).all();
  res.json({ok:true,missing,invited7d,completed30d,pendingEmail,smtpConfigured:SMTP_CONFIGURED,cooldownDays:CITY_INVITE_COOLDOWN_DAYS,recent});
});
app.post('/api/admin/users/:id/invite-city', requireAuth, requireAdmin, rateLimit({limit:80,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  const target=String(req.params.id||'');
  const result=createCityProfileInvite(target,req.user.id,{source:'admin_single',email:req.body?.email===true,force:req.body?.force===true});
  if(!result.ok){const messages={inactive:'La cuenta no está activa.',has_city:'Este perfil ya tiene ciudad.',cooldown:`Ya se le pidió la ciudad recientemente. Espera ${CITY_INVITE_COOLDOWN_DAYS} días.`};return res.status(result.reason==='cooldown'?409:400).json({ok:false,error:messages[result.reason]||'No se pudo crear la invitación.',reason:result.reason});}
  logModerationAction(req.user.id,target,'city_invite',result.emailQueued?'Aviso interno + email en cola':'Aviso interno',null);
  setImmediate(()=>processCityInviteEmailQueue().catch(e=>recordServerError('city_invite.manual',e,{userId:target})));
  res.json({ok:true,emailQueued:result.emailQueued,id:result.id});
});
app.post('/api/admin/city-invites/bulk', requireAuth, requireAdmin, rateLimit({limit:8,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  if(String(req.body?.confirm||'').toUpperCase()!=='INVITAR')return res.status(400).json({ok:false,error:'Escribe INVITAR para confirmar el envío masivo.'});
  const email=req.body?.email===true;
  const rows=db.prepare(`SELECT u.id FROM users u LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN community_city_memberships m ON m.user_id=u.id
    WHERE u.status='active' AND m.user_id IS NULL AND TRIM(COALESCE(p.city,''))='' ORDER BY u.created_at ASC LIMIT 1000`).all();
  let invited=0,skipped=0,emailQueued=0;
  const tx=db.transaction(items=>{for(const row of items){const r=createCityProfileInvite(row.id,req.user.id,{source:'admin_bulk',email});if(r.ok){invited++;if(r.emailQueued)emailQueued++;}else skipped++;}});
  tx(rows);logModerationAction(req.user.id,req.user.id,'city_invite_bulk',`${invited} invitados · ${emailQueued} emails en cola · ${skipped} omitidos`,null);
  setImmediate(()=>processCityInviteEmailQueue().catch(e=>recordServerError('city_invite.bulk',e)));
  res.json({ok:true,invited,skipped,emailQueued});
});
app.post('/api/admin/city-invites/process', requireAuth, requireAdmin, rateLimit({limit:30,windowMs:60*60*1000,key:req=>req.user.id}), async (req,res) => {
  const result=await processCityInviteEmailQueue(CITY_INVITE_BATCH_SIZE);res.json({ok:true,...result});
});

app.get('/api/admin/users', requireAuth, requireAdmin, (req,res) => {
  const q = cleanShortText(req.query.q,80).toLowerCase();
  const status = ['active','suspended','all'].includes(String(req.query.status||'all')) ? String(req.query.status||'all') : 'all';
  const cityState = ['all','missing','set'].includes(String(req.query.cityState||'all')) ? String(req.query.cityState||'all') : 'all';
  const where = [], params = [];
  if (status !== 'all') { where.push('u.status=?'); params.push(status); }
  if (cityState === 'missing') where.push("m.user_id IS NULL AND TRIM(COALESCE(p.city,''))=''");
  if (cityState === 'set') where.push("(m.user_id IS NOT NULL OR TRIM(COALESCE(p.city,''))<>'')");
  if (q) {
    where.push("(LOWER(u.email) LIKE ? OR LOWER(COALESCE(p.name,'')) LIKE ? OR LOWER(COALESCE(c.name,p.city,'')) LIKE ?)");
    const like = `%${q}%`; params.push(like,like,like);
  }
  const sql = `SELECT u.id,u.email,u.status,u.created_at,u.last_seen_at,u.email_verified,u.suspended_until,u.suspension_reason,
    p.name,p.age,COALESCE(c.name,p.city,'') city,p.avatar,p.discoverable,p.profile_verified,p.profile_verified_at,
    (SELECT COUNT(*) FROM reports r WHERE r.reported=u.id) reports_received,
    (SELECT COUNT(*) FROM reports r WHERE r.reporter=u.id) reports_sent,
    (SELECT COUNT(*) FROM messages m WHERE m.from_user=u.id) messages_sent,
    (SELECT COUNT(*) FROM matches mm WHERE mm.active=1 AND (mm.user1=u.id OR mm.user2=u.id)) active_matches,
    (SELECT CASE WHEN pm.status='active' AND (pm.expires_at IS NULL OR pm.expires_at>?) THEN 1 ELSE 0 END FROM plus_memberships pm WHERE pm.user_id=u.id) plus_active,
    (SELECT pm.expires_at FROM plus_memberships pm WHERE pm.user_id=u.id) plus_expires_at
    FROM users u LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN community_city_memberships m ON m.user_id=u.id LEFT JOIN community_cities c ON c.slug=m.city_slug
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY u.last_seen_at DESC LIMIT 120`;
  const users=db.prepare(sql).all(now(),...params).map(row=>({...row,risk:securityRiskForUser(row.id)}));
  res.json({ok:true,users});
});

app.get('/api/admin/users/:id', requireAuth, requireAdmin, (req,res) => {
  const id = String(req.params.id||'');
  const user = db.prepare(`SELECT u.id,u.email,u.status,u.created_at,u.last_seen_at,u.email_verified,u.email_verified_at,u.suspended_until,u.suspension_reason,u.onboarding_completed,
      p.name,p.age,p.gender,COALESCE(c.name,p.city,'') city,p.bio,p.interests_json,p.avatar,p.photos_json,p.discoverable,p.show_online,p.allow_game_invites,p.community_public,p.age_min,p.age_max,p.looking_for,p.city_pref,p.interest_pref,p.radius_km,p.location_updated_at,p.profile_verified,p.profile_verified_at,
      pm.status plus_status,pm.expires_at plus_expires_at,
      COALESCE(np.retention_email,1) retention_email,COALESCE(np.newsletter_email,1) newsletter_email,COALESCE(np.push_enabled,0) push_enabled
      FROM users u LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN community_city_memberships m ON m.user_id=u.id LEFT JOIN community_cities c ON c.slug=m.city_slug LEFT JOIN plus_memberships pm ON pm.user_id=u.id LEFT JOIN notification_preferences np ON np.user_id=u.id WHERE u.id=?`).get(id);
  if (!user) return res.status(404).json({ok:false,error:'Usuario no encontrado.'});
  const summary = {
    reportsReceived: db.prepare('SELECT COUNT(*) n FROM reports WHERE reported=?').get(id).n,
    reportsSent: db.prepare('SELECT COUNT(*) n FROM reports WHERE reporter=?').get(id).n,
    messagesSent: db.prepare('SELECT COUNT(*) n FROM messages WHERE from_user=?').get(id).n,
    activeMatches: db.prepare('SELECT COUNT(*) n FROM matches WHERE active=1 AND (user1=? OR user2=?)').get(id,id).n,
    blocksMade: db.prepare('SELECT COUNT(*) n FROM blocks WHERE blocker=?').get(id).n,
    blocksReceived: db.prepare('SELECT COUNT(*) n FROM blocks WHERE blocked=?').get(id).n,
    openReports: db.prepare("SELECT COUNT(*) n FROM reports WHERE reported=? AND status='open'").get(id).n,
    reports30d: db.prepare('SELECT COUNT(*) n FROM reports WHERE reported=? AND created_at>?').get(id,now()-30*86400000).n,
    uniqueReporters: db.prepare('SELECT COUNT(DISTINCT reporter) n FROM reports WHERE reported=?').get(id).n,
    warnings: db.prepare("SELECT COUNT(*) n FROM moderation_actions WHERE target_user=? AND action='warning'").get(id).n,
    suspensions: db.prepare("SELECT COUNT(*) n FROM moderation_actions WHERE target_user=? AND action LIKE 'suspend%'").get(id).n,
    cityInvites: db.prepare('SELECT COUNT(*) n FROM profile_city_invites WHERE user_id=?').get(id).n,
    risk: securityRiskForUser(id)
  };
  const reports = db.prepare(`SELECT r.id,r.reason,r.details,r.status,r.created_at,r.updated_at,r.moderator_note,
      ru.email reporter_email,rp.name reporter_name
      FROM reports r JOIN users ru ON ru.id=r.reporter LEFT JOIN profiles rp ON rp.user_id=r.reporter
      WHERE r.reported=? ORDER BY r.created_at DESC LIMIT 20`).all(id);
  const actions = db.prepare(`SELECT ma.id,ma.action,ma.note,ma.created_at,au.email admin_email
      FROM moderation_actions ma LEFT JOIN users au ON au.id=ma.admin_user
      WHERE ma.target_user=? ORDER BY ma.created_at DESC LIMIT 30`).all(id);
  const cityInvites=db.prepare(`SELECT id,source,email_requested,email_status,email_sent_at,created_at,completed_at FROM profile_city_invites WHERE user_id=? ORDER BY created_at DESC LIMIT 12`).all(id);
  const resultUser = {
    ...user,
    interests:safeJsonArray(user.interests_json),
    photos:safeJsonArray(user.photos_json),
    locationEnabled:Boolean(user.location_updated_at)
  };
  delete resultUser.interests_json;
  delete resultUser.photos_json;
  delete resultUser.location_updated_at;
  res.json({ok:true,user:resultUser,summary,reports,actions,cityInvites,beta:betaState(id)});
});

app.post('/api/admin/users/:id/action', requireAuth, requireAdmin, (req,res) => {
  const target = String(req.params.id||'');
  const user = db.prepare('SELECT id,email,status FROM users WHERE id=?').get(target);
  if (!user) return res.status(404).json({ok:false,error:'Usuario no encontrado.'});
  const action = String(req.body?.action||'');
  const note = cleanShortText(req.body?.note,500);
  if (target === req.user.id && ['suspend','suspend_24h','suspend_7d','suspend_30d','delete_profile','delete_account'].includes(action)) return res.status(400).json({ok:false,error:'No puedes aplicar esa acción destructiva a tu propia cuenta administradora.'});
  if (!['warning','suspend','suspend_24h','suspend_7d','suspend_30d','reactivate','hide_profile','show_profile','clear_photos','clear_bio','delete_profile','delete_account','grant_plus_30d','revoke_plus','revoke_verification'].includes(action)) return res.status(400).json({ok:false,error:'Acción no válida.'});
  if (action === 'warning') {
    createNotification(target,'system','Aviso de moderación','Te recordamos que el uso de VRMatch debe respetar a las demás personas y las normas de la comunidad.',{reason:'moderation_warning'});
    const account=cityInviteEligibleForEmail(target);
    if(SMTP_CONFIGURED&&account?.email_verified){setImmediate(()=>sendEmail({to:account.email,subject:'Aviso de moderación · VRMatch',text:'Hemos revisado actividad asociada a tu cuenta. Recuerda respetar las normas de la comunidad y a las demás personas.',html:vrEmailShell({eyebrow:'SEGURIDAD',title:'Aviso de moderación',bodyHtml:'<p style="margin:0;color:#eee;line-height:1.6;">Hemos revisado actividad asociada a tu cuenta. Te recordamos que VRMatch debe utilizarse respetando a las demás personas y las normas de la comunidad.</p>',ctaLabel:'ABRIR VRMATCH',ctaUrl:retentionBaseUrl(),footerHtml:'Si crees que este aviso es un error, puedes enviarnos feedback desde tu cuenta.'})}).catch(e=>recordServerError('moderation.warning_email',e,{userId:target})));}
  }
  if (action === 'suspend') suspendUser(target,null,note);
  if (action === 'suspend_24h') suspendUser(target,now()+24*3600000,note);
  if (action === 'suspend_7d') suspendUser(target,now()+7*86400000,note);
  if (action === 'suspend_30d') suspendUser(target,now()+30*86400000,note);
  if (action === 'reactivate') reactivateUser(target);
  if (action === 'hide_profile') db.prepare('UPDATE profiles SET discoverable=0,updated_at=? WHERE user_id=?').run(now(),target);
  if (action === 'show_profile') db.prepare('UPDATE profiles SET discoverable=1,updated_at=? WHERE user_id=?').run(now(),target);
  if (action === 'clear_photos') clearProfilePhotos(target);
  if (action === 'clear_bio') db.prepare("UPDATE profiles SET bio='',updated_at=? WHERE user_id=?").run(now(),target);
  if (action === 'delete_profile') {
    deleteUserUploads(target); deleteVerificationFilesForUser(target);
    db.transaction(()=>{
      db.prepare('DELETE FROM profile_verification_requests WHERE user_id=?').run(target);
      db.prepare('DELETE FROM game_sessions WHERE user1=? OR user2=?').run(target,target);
      db.prepare('DELETE FROM matches WHERE user1=? OR user2=?').run(target,target);
      db.prepare('DELETE FROM likes WHERE from_user=? OR to_user=?').run(target,target);
      db.prepare('DELETE FROM passes WHERE from_user=? OR to_user=?').run(target,target);
      db.prepare('DELETE FROM community_city_memberships WHERE user_id=?').run(target);
      db.prepare('DELETE FROM profiles WHERE user_id=?').run(target);
      db.prepare('UPDATE users SET onboarding_completed=0 WHERE id=?').run(target);
    })();
    disconnectUserSockets(target,'profile_deleted_by_admin',{});
  }
  if (action === 'delete_account') {
    const sub=billingSubscriptionForUser(target);
    if(sub && ['active','trialing','past_due'].includes(sub.status))return res.status(409).json({ok:false,error:'Esta cuenta tiene una suscripción vinculada. Cancélala antes de eliminar definitivamente la cuenta.'});
    const referralRow=db.prepare('SELECT referral_code FROM user_referrals WHERE user_id=?').get(target);
    db.prepare('DELETE FROM growth_events WHERE user_id=?').run(target);
    if(referralRow?.referral_code){
      db.prepare('DELETE FROM user_referral_events WHERE referral_code=? OR user_id=?').run(referralRow.referral_code,target);
      db.prepare("UPDATE user_referral_attributions SET referrer_user_id=NULL,referral_code='DELETED' WHERE referrer_user_id=?").run(target);
    } else db.prepare('DELETE FROM user_referral_events WHERE user_id=?').run(target);
    disconnectUserSockets(target,'account_deleted_by_admin',{}); deleteUserUploads(target); deleteVerificationFilesForUser(target);
    db.prepare('DELETE FROM users WHERE id=?').run(target); onlineUsers.delete(target);
  }
  if (action === 'revoke_verification') db.prepare('UPDATE profiles SET profile_verified=0,profile_verified_at=NULL,updated_at=? WHERE user_id=?').run(now(),target);
  if (action === 'grant_plus_30d') grantPlus(target,30,'admin');
  if (action === 'revoke_plus') revokePlus(target);
  logModerationAction(req.user.id,target,action,note,null);
  if (action === 'grant_plus_30d' || action === 'revoke_plus') {
    emitToUser(target,'plus_state',getPlusState(target));
    emitToUser(target,'dating_profiles',discoverFor(target));
  }
  broadcastDiscovery(); emitMatches(target);
  res.json({ok:true,deleted:action==='delete_account',profileDeleted:action==='delete_profile',userStatus:db.prepare('SELECT status FROM users WHERE id=?').get(target)?.status||null});
});

app.post('/api/admin/messages/:id/delete', requireAuth, requireAdmin, (req,res) => {
  const id = String(req.params.id||'');
  const row = db.prepare(`SELECT m.id,m.match_id,m.from_user,m.text,ma.user1,ma.user2
    FROM messages m JOIN matches ma ON ma.id=m.match_id WHERE m.id=?`).get(id);
  if (!row) return res.status(404).json({ok:false,error:'Mensaje no encontrado o ya eliminado.'});
  const note = cleanShortText(req.body?.note,500);
  const requestedReportId = cleanShortText(req.body?.reportId,80) || null;
  const reportId = requestedReportId && db.prepare('SELECT 1 FROM reports WHERE id=?').get(requestedReportId) ? requestedReportId : null;
  db.prepare('DELETE FROM messages WHERE id=?').run(id);
  logModerationAction(req.user.id,row.from_user,'delete_message',note,reportId);
  const payload={id:row.id,matchId:row.match_id};
  emitToUser(row.user1,'dating_message_removed',payload);
  emitToUser(row.user2,'dating_message_removed',payload);
  emitMatches(row.user1); emitMatches(row.user2);
  res.json({ok:true});
});

app.get('/api/admin/actions', requireAuth, requireAdmin, (req,res) => {
  const rows = db.prepare(`SELECT ma.id,ma.report_id,ma.target_user,ma.action,ma.note,ma.created_at,
      au.email admin_email, ap.name admin_name,
      tu.email target_email, tp.name target_name
    FROM moderation_actions ma
    LEFT JOIN users au ON au.id=ma.admin_user LEFT JOIN profiles ap ON ap.user_id=ma.admin_user
    LEFT JOIN users tu ON tu.id=ma.target_user LEFT JOIN profiles tp ON tp.user_id=ma.target_user
    ORDER BY ma.created_at DESC LIMIT 250`).all();
  res.json({ok:true,actions:rows});
});

app.get('/api/discover', requireAuth, (req,res) => res.json({ok:true,profiles:discoverFor(req.user.id)}));
app.get('/api/matches', requireAuth, (req,res) => res.json({ok:true,matches:matchesFor(req.user.id)}));

app.post('/api/block', requireAuth, (req,res) => {
  const target = String(req.body?.userId || '');
  if (!target || target === req.user.id || !db.prepare('SELECT 1 FROM users WHERE id=?').get(target)) return res.status(400).json({ok:false,error:'Usuario no válido.'});
  const ts=now();
  db.prepare('INSERT OR IGNORE INTO blocks(blocker,blocked,created_at) VALUES(?,?,?)').run(req.user.id,target,ts);
  db.prepare('DELETE FROM likes WHERE (from_user=? AND to_user=?) OR (from_user=? AND to_user=?)').run(req.user.id,target,target,req.user.id);
  const [u1,u2]=pair(req.user.id,target); db.prepare('UPDATE matches SET active=0 WHERE user1=? AND user2=?').run(u1,u2);
  emitToUser(target,'dating_blocked',{by:req.user.id});
  emitMatches(req.user.id); emitMatches(target); broadcastDiscovery();
  res.json({ok:true});
});

app.post('/api/report', requireAuth, rateLimit({limit:10,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  const target = String(req.body?.userId || '');
  const reason = cleanShortText(req.body?.reason,60);
  const details = cleanShortText(req.body?.details,600);
  if (!target || target === req.user.id || !VALID_REPORT_REASONS.has(reason) || !db.prepare('SELECT 1 FROM users WHERE id=?').get(target)) return res.status(400).json({ok:false,error:'Selecciona un motivo válido.'});
  const [u1,u2] = pair(req.user.id,target);
  const match = db.prepare('SELECT id FROM matches WHERE user1=? AND user2=? ORDER BY created_at DESC LIMIT 1').get(u1,u2);
  const evidence = match ? db.prepare(`SELECT id,from_user AS "from",text,created_at AS ts FROM
    (SELECT id,from_user,text,created_at FROM messages WHERE match_id=? ORDER BY created_at DESC LIMIT 12)
    ORDER BY ts ASC`).all(match.id) : [];
  db.prepare('INSERT INTO reports(id,reporter,reported,reason,details,match_id,evidence_json,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(safeId('rep'),req.user.id,target,reason,details,match?.id||null,JSON.stringify(evidence),now());
  res.json({ok:true});
});

function productionReadiness() {
  let hostname = '';
  try { hostname = APP_BASE_URL ? new URL(APP_BASE_URL).hostname : ''; } catch {}
  const customDomain = Boolean(hostname && !hostname.endsWith('.onrender.com') && hostname !== 'localhost');
  const persistentStorage = path.resolve(STORAGE_DIR) !== path.resolve(ROOT);
  const productionMode = LAUNCH_MODE === 'production';
  const socketOriginRestricted = Boolean(allowedOrigins.length || appBaseOrigin);
  const launchFree = freePremiumDuringLaunch();
  const billingEnabled = billingSwitchEnabled();
  const billingConfiguredNow = billingConfigured();
  const billingLive = Boolean(billingConfiguredNow && STRIPE_MODE === 'live');
  const smtpCheck=lastSystemCheck('smtp');
  const backupRestoreCheck=lastSystemCheck('backup_restore');
  const smtpVerified=Boolean(smtpCheck?.ok && Number(smtpCheck.checkedAt||0)>now()-30*86400000);
  const backupRestoreVerified=Boolean(backupRestoreCheck?.ok && Number(backupRestoreCheck.checkedAt||0)>now()-30*86400000);
  const coreReady = Boolean(customDomain && persistentStorage && SMTP_CONFIGURED && smtpVerified && backupRestoreVerified && REQUIRE_EMAIL_VERIFICATION && ADMIN_EMAILS.size > 0 && socketOriginRestricted);
  return {
    version: APP_VERSION,
    legalVersion: LEGAL_VERSION,
    launchMode:LAUNCH_MODE,
    productionMode,
    cityLaunchEnabled:CITY_LAUNCH_ENABLED,
    customDomain,
    persistentStorage,
    smtpConfigured: SMTP_CONFIGURED,
    smtpVerified,
    smtpVerifiedAt:Number(smtpCheck?.checkedAt||0)||null,
    backupRestoreVerified,
    backupRestoreVerifiedAt:Number(backupRestoreCheck?.checkedAt||0)||null,
    emailVerificationRequired: REQUIRE_EMAIL_VERIFICATION,
    adminConfigured: ADMIN_EMAILS.size > 0,
    socketOriginRestricted,
    allowedSocketOrigins: allowedOrigins.length || (appBaseOrigin ? 1 : 0),
    webPushConfigured: PUSH_CONFIGURED,
    billingPrepared:STRIPE_PREPARED,
    billingEnabled,
    freePremiumDuringLaunch:launchFree,
    billingConfigured:billingConfiguredNow,
    billingMode:STRIPE_MODE,
    billingLive,
    coreReady,
    productionReady: Boolean(coreReady && productionMode && (launchFree || billingLive)),
    pending: [
      !customDomain ? 'Dominio propio y VR_APP_BASE_URL definitivo' : null,
      !persistentStorage ? 'Render de pago + Persistent Disk en /var/data (o almacenamiento administrado)' : null,
      !REQUIRE_EMAIL_VERIFICATION ? 'VR_REQUIRE_EMAIL_VERIFICATION=true' : null,
      !SMTP_CONFIGURED ? 'SMTP profesional con dominio verificado' : null,
      SMTP_CONFIGURED && !smtpVerified ? 'Ejecutar y superar la prueba SMTP desde Administración → Sistema' : null,
      !backupRestoreVerified ? 'Ejecutar y superar una prueba de restauración de backup desde Administración → Sistema' : null,
      !socketOriginRestricted ? 'Restringir Socket.IO con VR_APP_BASE_URL o VR_ALLOWED_ORIGINS' : null,
      !launchFree && !STRIPE_PREPARED ? 'Configurar el proveedor de pago antes de ofrecer Premium de pago' : null,
      !launchFree && STRIPE_PREPARED && STRIPE_MODE !== 'live' ? 'Pasar el proveedor de sandbox a producción solo al final' : null,
      !launchFree && STRIPE_MODE === 'live' && !productionMode ? 'El cobro live está protegido: no se habilitará hasta VR_LAUNCH_MODE=production' : null,
      !productionMode ? 'VR_LAUNCH_MODE=production cuando termine la validación final' : null,
      !PUSH_CONFIGURED ? 'Web Push VAPID (recomendado, no bloquea el lanzamiento)' : null,
      'Funciones V/R+ actuales habilitadas para todos los usuarios.'
    ].filter(Boolean)
  };
}

app.get('/api/admin/monetization', requireAuth, requireAdmin, (req,res) => {
  res.json({ok:true,monetization:monetizationAdminState()});
});

app.post('/api/admin/monetization/mode', requireAuth, requireAdmin, rateLimit({limit:10,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  const mode=String(req.body?.mode||'').trim();
  const password=String(req.body?.password||'');
  const confirmText=String(req.body?.confirmText||'').trim().toUpperCase();
  if(!['launch_free','paid'].includes(mode))return res.status(400).json({ok:false,error:'Modo de monetización no válido.'});
  const account=db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
  if(!account || !verifyPassword(password,account.password_hash))return res.status(400).json({ok:false,error:'La contraseña de administrador no es correcta.'});
  if(mode==='paid'){
    if(req.body?.legalConfirmed!==true)return res.status(400).json({ok:false,error:'Confirma la revisión legal, fiscal y comercial antes de activar cobros reales.'});
    if(confirmText!=='ACTIVAR PREMIUM')return res.status(400).json({ok:false,error:'Escribe ACTIVAR PREMIUM para confirmar.'});
    const ready=productionReadiness();
    if(!ready.coreReady || !ready.productionMode)return res.status(409).json({ok:false,error:'La plataforma todavía no cumple el checklist base de producción. Completa Producción antes de activar cobros.'});
    if(!STRIPE_PREPARED)return res.status(409).json({ok:false,error:'El proveedor de pagos todavía no está configurado.'});
    if(STRIPE_MODE!=='live')return res.status(409).json({ok:false,error:'El proveedor está en sandbox/test. Para activar Premium de pago público debe estar en modo LIVE.'});
    if(!billingInfrastructureReady({requireLive:true}))return res.status(409).json({ok:false,error:'La infraestructura de pagos aún no está lista para cobros reales.'});
    setAppSetting('premium_mode','paid',req.user.id);
    setAppSetting('premium_mode_updated_at',String(now()),req.user.id);
    logModerationAction(req.user.id,null,'monetization_paid_enabled','Premium de pago activado desde el panel de administración.');
  } else {
    if(confirmText!=='VOLVER A GRATIS')return res.status(400).json({ok:false,error:'Escribe VOLVER A GRATIS para confirmar.'});
    const active=activePaidSubscriptionsCount();
    if(active>0)return res.status(409).json({ok:false,error:`Hay ${active} suscripción(es) de pago activa(s). No se puede hacer Premium gratis mientras sigan cobrando; gestiona primero esas suscripciones.`});
    setAppSetting('premium_mode','launch_free',req.user.id);
    setAppSetting('premium_mode_updated_at',String(now()),req.user.id);
    logModerationAction(req.user.id,null,'monetization_launch_free_enabled','Premium incluido gratis activado desde el panel de administración.');
  }
  broadcastPlusStateAll();
  res.json({ok:true,monetization:monetizationAdminState(),readiness:productionReadiness()});
});


app.get('/api/admin/system', requireAuth, requireAdmin, (req,res) => {
  try { res.json({ok:true,system:systemMaintenanceStatus()}); }
  catch(e){console.error('Error leyendo estado de sistema:',e.message);res.status(500).json({ok:false,error:'No se pudo comprobar el sistema.'});}
});

app.get('/api/admin/system/errors', requireAuth, requireAdmin, (req,res) => {
  const limit=Math.max(1,Math.min(100,Number(req.query.limit)||40));
  const errors=db.prepare(`SELECT se.id,se.fingerprint,se.context,se.message,se.method,se.path,se.request_id,se.user_id,se.created_at,
    u.email,COALESCE(p.name,'') name FROM server_errors se
    LEFT JOIN users u ON u.id=se.user_id LEFT JOIN profiles p ON p.user_id=se.user_id
    ORDER BY se.created_at DESC LIMIT ?`).all(limit);
  res.json({ok:true,errors});
});

app.post('/api/admin/system/smtp-test', requireAuth, requireAdmin, rateLimit({limit:4,windowMs:60*60*1000,key:req=>req.user.id}), async (req,res) => {
  const password=String(req.body?.password||'');
  const account=db.prepare('SELECT password_hash,email FROM users WHERE id=?').get(req.user.id);
  if(!account||!verifyPassword(password,account.password_hash))return res.status(400).json({ok:false,error:'La contraseña de administrador no es correcta.'});
  if(!SMTP_CONFIGURED||!mailTransport)return res.status(503).json({ok:false,error:'SMTP no está configurado.'});
  try{
    const verify=await runSmtpVerify(req.user.id);
    if(!verify.ok)return res.status(502).json({ok:false,error:'La conexión SMTP no ha superado la prueba.',diagnostic:verify});
    await sendEmail({to:account.email,subject:'✅ Prueba técnica SMTP · V/R Match',text:`V/R Match ${APP_VERSION}\n\nEl servidor ha enviado correctamente este correo de prueba.\n\nFecha: ${new Date().toISOString()}`,html:vrEmailShell({eyebrow:'DIAGNÓSTICO',title:'SMTP funcionando correctamente',bodyHtml:`<p style="margin:0;color:#eee;">V/R Match <strong>${APP_VERSION}</strong> ha completado la prueba de correo desde el servidor.</p><p style="margin:16px 0 0;color:#a9a5b4;font-size:13px;">${new Date().toISOString()}</p>`,ctaLabel:'Abrir V/R Match',ctaUrl:APP_BASE_URL||retentionBaseUrl(),footerHtml:'Mensaje técnico solicitado por una cuenta administradora.'})});
    setAppSetting('system_check_smtp_send',JSON.stringify({ok:true,checkedAt:now(),recipient:account.email}),req.user.id);
    logModerationAction(req.user.id,req.user.id,'system_smtp_test','Prueba SMTP enviada a la cuenta administradora',null);
    res.json({ok:true,diagnostic:verify,recipient:account.email});
  }catch(e){recordServerError('smtp.send_test',e,{userId:req.user.id,method:req.method,path:req.path,requestId:req.requestId});res.status(502).json({ok:false,error:'No se pudo enviar el correo de prueba.'});}
});

app.post('/api/admin/system/backup-check', requireAuth, requireAdmin, rateLimit({limit:4,windowMs:60*60*1000,key:req=>req.user.id}), async (req,res) => {
  const password=String(req.body?.password||'');
  const account=db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
  if(!account||!verifyPassword(password,account.password_hash))return res.status(400).json({ok:false,error:'La contraseña de administrador no es correcta.'});
  const result=await runBackupSelfTest(req.user.id);
  res.status(result.ok?200:500).json({ok:Boolean(result.ok),result,error:result.ok?undefined:'La prueba de restauración no se ha completado correctamente.'});
});

app.post('/api/admin/system/maintenance', requireAuth, requireAdmin, rateLimit({limit:20,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  try{
    const action=String(req.body?.action||''); const ts=now(); let result={};
    if(action==='cleanup_expired'){
      const sessions=db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(ts).changes;
      const tokens=db.prepare('DELETE FROM auth_tokens WHERE expires_at<=? OR used_at IS NOT NULL').run(ts).changes;
      result={sessions,tokens};
    } else if(action==='cleanup_telemetry'){
      const errors=db.prepare('DELETE FROM client_errors WHERE created_at<?').run(ts-30*86400000).changes;
      const serverErrors=db.prepare('DELETE FROM server_errors WHERE created_at<?').run(ts-SYSTEM_ERROR_RETENTION_DAYS*86400000).changes;
      const notifications=db.prepare('DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at<?').run(ts-90*86400000).changes;
      const pushLogs=db.prepare('DELETE FROM push_delivery_log WHERE created_at<?').run(ts-180*86400000).changes;
      const smartPushLogs=db.prepare('DELETE FROM smart_push_log WHERE created_at<?').run(ts-180*86400000).changes;
      const deferredPushes=db.prepare('DELETE FROM deferred_pushes WHERE expires_at<?').run(ts).changes;
      result={clientErrors:errors,serverErrors,notifications,pushLogs,smartPushLogs,deferredPushes};
    } else if(action==='cleanup_orphan_uploads'){
      const files=orphanUploadFiles(); let deleted=0,bytes=0;
      for(const file of files){try{fs.unlinkSync(file.path);deleted++;bytes+=file.bytes||0;}catch{}}
      result={deleted,bytes};
    } else if(action==='optimize'){
      db.pragma('optimize');
      let checkpoint=null; try{checkpoint=db.pragma('wal_checkpoint(TRUNCATE)');}catch{}
      result={optimized:true,checkpoint};
    } else return res.status(400).json({ok:false,error:'Acción de mantenimiento no válida.'});
    logModerationAction(req.user.id,null,`system_${action}`,'Mantenimiento manual desde panel de administración',null);
    res.json({ok:true,result,system:systemMaintenanceStatus()});
  }catch(e){console.error('Error de mantenimiento:',e);res.status(500).json({ok:false,error:'No se pudo completar el mantenimiento.'});}
});

app.post('/api/admin/system/backup', requireAuth, requireAdmin, rateLimit({limit:2,windowMs:60*60*1000,key:req=>req.user.id}), async (req,res) => {
  const password=String(req.body?.password||'');
  const account=db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
  if(!account || !verifyPassword(password,account.password_hash)) return res.status(400).json({ok:false,error:'La contraseña de administrador no es correcta.'});
  const tmpRoot=fs.mkdtempSync(path.join(os.tmpdir(),'vrmatch-backup-'));
  const dbCopy=path.join(tmpRoot,'vrmatch.db'), manifestPath=path.join(tmpRoot,'backup-manifest.json');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const archivePath=path.join(tmpRoot,`vr-match-backup-${stamp}.tar.gz`);
  try{
    await db.backup(dbCopy);
    const uploads=folderStatsSafe(UPLOAD_DIR);
    const manifest={product:'V/R Match',appVersion:APP_VERSION,generatedAt:new Date().toISOString(),format:'vrmatch-backup-v1',sensitive:true,notes:['Contiene hashes de contraseña y datos privados almacenados en SQLite.','No contiene secretos de Render ni claves SMTP porque esos valores viven en variables de entorno.','Guarda esta copia en un lugar privado y elimínala cuando deje de ser necesaria.'],database:{file:'data/vrmatch.db',bytes:fileSizeSafe(dbCopy)},uploads:{directory:'uploads/',files:uploads.files,bytes:uploads.bytes}};
    fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
    const entries=[{path:manifestPath,name:'backup-manifest.json'},{path:dbCopy,name:'data/vrmatch.db'}];
    try{for(const entry of fs.readdirSync(UPLOAD_DIR,{withFileTypes:true})){if(entry.isFile())entries.push({path:path.join(UPLOAD_DIR,entry.name),name:`uploads/${entry.name}`});}}catch{}
    await createTarGz(entries,archivePath);
    logModerationAction(req.user.id,req.user.id,'system_backup_download','Copia manual de seguridad descargada',null);
    res.setHeader('Cache-Control','no-store');
    res.download(archivePath,`vr-match-backup-${new Date().toISOString().slice(0,10)}.tar.gz`,err=>{
      try{fs.rmSync(tmpRoot,{recursive:true,force:true});}catch{}
      if(err && !res.headersSent){console.error('Error descargando backup:',err.message);res.status(500).json({ok:false,error:'No se pudo descargar la copia.'});}
    });
  }catch(e){
    try{fs.rmSync(tmpRoot,{recursive:true,force:true});}catch{}
    console.error('Error creando backup:',e); if(!res.headersSent)res.status(500).json({ok:false,error:'No se pudo crear la copia de seguridad.'});
  }
});

app.get('/api/admin/production-readiness', requireAuth, requireAdmin, (req,res) => res.json({ok:true,readiness:productionReadiness()}));
app.get('/api/product/monetization', (req,res) => res.json({ok:true,commercial:{
  freeBaseAlways:true,
  premiumOptional:true,
  mode:monetizationMode(),
  freePremiumDuringLaunch:freePremiumDuringLaunch(),
  paidPremiumAvailable:false
}}));

app.get('/espera', (req,res) => { res.setHeader('Cache-Control','no-cache, no-store, must-revalidate'); res.sendFile(path.join(PUBLIC_DIR,'waitlist.html')); });
app.get('/activar', (req,res) => { res.setHeader('Cache-Control','no-cache, no-store, must-revalidate'); res.sendFile(path.join(PUBLIC_DIR,'activate.html')); });
app.get('/admin/launch', (req,res) => { res.setHeader('Cache-Control','no-cache, no-store, must-revalidate'); res.sendFile(path.join(PUBLIC_DIR,'admin-launch.html')); });

app.get('/healthz', (req,res) => { try { const database=shallowDatabaseCheck(); const storage=cachedStorageWriteCheck(); const ok=Boolean(database.ok&&storage.ok); res.status(ok?200:503).json({ok,db:Boolean(database.ok),storage:Boolean(storage.ok),version:APP_VERSION,uptimeSeconds:Math.round(process.uptime())}); } catch(e) { recordServerError('healthz',e,{method:req.method,path:req.path,requestId:req.requestId}); res.status(503).json({ok:false,db:false,storage:false,version:APP_VERSION}); } });
app.use('/uploads', express.static(UPLOAD_DIR, { fallthrough:false, maxAge:'7d', dotfiles:'deny' }));
app.get(['/', '/index.html'], (req,res) => { res.setHeader('Cache-Control','no-cache, no-store, must-revalidate'); res.sendFile(path.join(ROOT,'index.html')); });
app.get('/styles.css', (req,res) => res.sendFile(path.join(ROOT,'styles.css')));
app.get('/manifest.webmanifest', (req,res) => { res.type('application/manifest+json'); res.setHeader('Cache-Control','public, max-age=3600'); res.sendFile(path.join(ROOT,'manifest.webmanifest')); });
app.get('/offline.html', (req,res) => res.sendFile(path.join(ROOT,'offline.html')));
app.get('/icons/icon-192.png', (req,res) => res.sendFile(path.join(ROOT,'icons','icon-192.png')));
app.get('/icons/icon-512.png', (req,res) => res.sendFile(path.join(ROOT,'icons','icon-512.png')));
app.get('/icons/icon-maskable-512.png', (req,res) => res.sendFile(path.join(ROOT,'icons','icon-maskable-512.png')));
app.get('/icons/apple-touch-icon.png', (req,res) => res.sendFile(path.join(ROOT,'icons','apple-touch-icon.png')));
app.get('/sw.js', (req,res) => { res.type('application/javascript'); res.setHeader('Cache-Control','no-cache, no-store, must-revalidate'); res.sendFile(path.join(ROOT,'sw.js')); });
app.get('/terms.html', (req,res) => res.sendFile(path.join(ROOT,'terms.html')));
app.get('/privacy.html', (req,res) => res.sendFile(path.join(ROOT,'privacy.html')));
app.get('/community.html', (req,res) => res.sendFile(path.join(ROOT,'community.html')));
app.get(['/como-funciona','/como-funciona.html'], (req,res) => res.sendFile(path.join(ROOT,'como-funciona.html')));
app.get(['/funciones','/funciones.html'], (req,res) => res.sendFile(path.join(ROOT,'funciones.html')));
app.get(['/descubrir','/descubrir.html'], (req,res) => res.sendFile(path.join(ROOT,'descubrir.html')));

// SEO V/R Match: 50 landings + recursos compartidos. Se añaden sin tocar
// /espera, /activar, /admin/launch ni las APIs del lanzamiento por ciudades.
// Las URLs canónicas SEO terminan en .html. Si alguien entra sin extensión,
// redirigimos a la URL canónica para evitar contenido duplicado.
function redirectSeoCanonical(section) {
  return (req,res,next) => {
    const slug=String(req.params.slug||'').toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug)) return next();
    const file=path.join(ROOT,section,`${slug}.html`);
    if (!fs.existsSync(file)) return next();
    return res.redirect(301,`/${section}/${slug}.html`);
  };
}
app.get('/ciudades/:slug', redirectSeoCanonical('ciudades'));
app.get('/guias/:slug', redirectSeoCanonical('guias'));
app.use('/ciudades', express.static(path.join(ROOT,'ciudades'), {
  dotfiles: 'deny',
  index: false,
  maxAge: '5m'
}));
app.use('/guias', express.static(path.join(ROOT,'guias'), {
  dotfiles: 'deny',
  index: false,
  maxAge: '5m'
}));
app.use('/seo-assets', express.static(path.join(ROOT,'seo-assets'), {
  dotfiles: 'deny',
  index: false,
  maxAge: '1d'
}));
app.get('/robots.txt', (req,res) => {
  res.type('text/plain');
  res.sendFile(path.join(ROOT,'robots.txt'));
});
app.get('/sitemap.xml', (req,res) => {
  res.type('application/xml');
  res.setHeader('Cache-Control','public, max-age=3600');
  res.sendFile(path.join(ROOT,'sitemap.xml'));
});
app.get('/sitemap-landings.xml', (req,res) => {
  res.type('application/xml');
  res.setHeader('Cache-Control','public, max-age=3600');
  res.sendFile(path.join(ROOT,'sitemap-landings.xml'));
});
app.get(['/premium','/premium.html'], (req,res) => res.redirect(302,'/funciones.html'));
app.get('/preview.html', (req,res) => res.sendFile(path.join(ROOT,'preview.html')));

function socketSet(userId) {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId,new Set());
  return onlineUsers.get(userId);
}
function emitToUser(userId,event,payload) {
  const set=onlineUsers.get(userId); if (!set) return;
  for (const sid of set) io.sockets.sockets.get(sid)?.emit(event,payload);
}
function disconnectUserSockets(userId, event, payload={}) {
  const set=onlineUsers.get(userId);
  if(set){for(const sid of [...set]){const sock=io.sockets.sockets.get(sid);if(sock){if(event)sock.emit(event,payload);sock.disconnect(true);}}}
  onlineUsers.delete(userId);
  clearGameInvitesFor(userId);
}
function emitMatches(userId) { emitToUser(userId,'dating_matches',matchesFor(userId)); }
function broadcastDiscovery() {
  for (const userId of onlineUsers.keys()) emitToUser(userId,'dating_profiles',discoverFor(userId));
}

io.use((socket,next) => {
  const token = String(socket.handshake.auth?.token || '');
  const user = userFromToken(token);
  if (!user) return next(new Error('AUTH_REQUIRED'));
  const full=db.prepare('SELECT email_verified FROM users WHERE id=?').get(user.id);
  if (REQUIRE_EMAIL_VERIFICATION && !full?.email_verified) return next(new Error('EMAIL_VERIFICATION_REQUIRED'));
  socket.user = user; socket.userId = user.id; next();
});

function removeFromLobby(socketId) { waitingPlayers.delete(socketId); broadcastLobby(); }
function broadcastLobby() {
  for (const s of io.sockets.sockets.values()) {
    const me=s.id, deck=s.mazo||'rompehielos';
    const list=[...waitingPlayers.values()].filter(p=>p.id!==me&&p.mazo===deck); s.emit('actualizar_lista_espera',list);
  }
}
function roomUserIds(room) {
  if(!room)return [];
  return [...room.players].map(sid=>room.userIds?.[sid]||roomSocket(room,sid)?.userId).filter(Boolean);
}
function gameHistoryStart(room, matchId=null) {
  if(!room?.dating || room.historyId)return room?.historyId||null;
  const users=roomUserIds(room);
  if(users.length!==2)return null;
  const [user1,user2]=pair(users[0],users[1]);
  const ts=now(), id=safeId('game');
  db.prepare(`INSERT INTO game_sessions(
    id,match_id,user1,user2,deck,started_at,updated_at,status,total_turns,sync_rounds,coincidences,guess_hits,reactions,personalized_sync,extended,duration_seconds
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id,matchId||null,user1,user2,validDeck(room.mazo),ts,ts,'active',0,0,0,0,0,0,0,0
  );
  room.historyId=id;room.matchId=matchId||null;room.startedAt=ts;room.historyFinalized=false;
  recordFirstUserGrowthEvent(user1,'first_game'); recordFirstUserGrowthEvent(user2,'first_game');
  return id;
}
function gameHistoryPersist(room) {
  if(!room?.historyId || room.historyFinalized || !room.game)return;
  const ts=now();
  const totalTurns=Object.values(room.game.turns||{}).reduce((sum,n)=>sum+(Number(n)||0),0);
  const started=Number(room.startedAt)||ts;
  db.prepare(`UPDATE game_sessions SET
    core_completed_at=COALESCE(core_completed_at,?),updated_at=?,total_turns=?,sync_rounds=?,coincidences=?,guess_hits=?,reactions=?,personalized_sync=?,extended=?,duration_seconds=?
    WHERE id=?`).run(
      room.game.coreCompletedAt||null,ts,totalTurns,Number(room.game.syncRounds||0),Number(room.game.coincidences||0),Number(room.game.guessHits||0),
      Number(room.game.reactions||0),Number(room.game.personalizedSync||0),room.game.extended?1:0,Math.max(0,Math.round((ts-started)/1000)),room.historyId
    );
}
function gameHistoryFinalize(room, reason='finish') {
  if(!room?.historyId || room.historyFinalized)return;
  gameHistoryPersist(room);
  const ts=now(), completed=Boolean(room.game?.coreCompletedAt), started=Number(room.startedAt)||ts;
  db.prepare(`UPDATE game_sessions SET status=?,finish_reason=?,ended_at=?,updated_at=?,duration_seconds=? WHERE id=? AND ended_at IS NULL`).run(
    completed?'completed':'abandoned',cleanShortText(reason,40)||'finish',ts,ts,Math.max(0,Math.round((ts-started)/1000)),room.historyId
  );
  room.historyFinalized=true;
  if(completed&&room.matchId&&!db.prepare("SELECT 1 FROM chat_events WHERE match_id=? AND type='game_result' AND related_id=? LIMIT 1").get(room.matchId,room.historyId)){
    const totalTurns=Object.values(room.game?.turns||{}).reduce((sum,n)=>sum+(Number(n)||0),0);
    const payload={deck:validDeck(room.mazo),deckLabel:deckPublicLabel(room.mazo),turns:totalTurns,coincidences:Number(room.game?.coincidences||0),guessHits:Number(room.game?.guessHits||0),reactions:Number(room.game?.reactions||0),extended:Boolean(room.game?.extended),durationSeconds:Math.max(0,Math.round((ts-started)/1000))};
    const eventId=chatEventInsert(room.matchId,null,'game_result',room.historyId,payload);
    const match=db.prepare('SELECT * FROM matches WHERE id=?').get(room.matchId);
    if(match){for(const uid of [match.user1,match.user2]){const item=chatEventByRelated(room.matchId,'game_result',room.historyId,uid);if(item)emitToUser(uid,'dating_chat_event',item);}}
  }
}
function gameHistoryForPair(userId, partnerId) {
  const [user1,user2]=pair(userId,partnerId);
  const aggregate=db.prepare(`SELECT
    COUNT(*) AS started,
    SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
    MAX(CASE WHEN status='completed' THEN ended_at ELSE NULL END) AS last_played_at,
    SUM(CASE WHEN status='completed' THEN total_turns ELSE 0 END) AS total_turns,
    SUM(CASE WHEN status='completed' THEN sync_rounds ELSE 0 END) AS sync_rounds,
    SUM(CASE WHEN status='completed' THEN coincidences ELSE 0 END) AS coincidences,
    SUM(CASE WHEN status='completed' THEN guess_hits ELSE 0 END) AS guess_hits,
    SUM(CASE WHEN status='completed' THEN reactions ELSE 0 END) AS reactions,
    SUM(CASE WHEN status='completed' THEN personalized_sync ELSE 0 END) AS personalized_sync
    FROM game_sessions WHERE user1=? AND user2=?`).get(user1,user2)||{};
  const recent=db.prepare(`SELECT id,deck,status,finish_reason,started_at,ended_at,duration_seconds,total_turns,sync_rounds,coincidences,guess_hits,reactions,personalized_sync,extended
    FROM game_sessions WHERE user1=? AND user2=? ORDER BY COALESCE(ended_at,started_at) DESC LIMIT 8`).all(user1,user2);
  const activeRoom=activeRoomForPair(userId,partnerId);
  return {
    started:Number(aggregate.started||0),completed:Number(aggregate.completed||0),active:Boolean(activeRoom),lastPlayedAt:Number(aggregate.last_played_at||0)||null,
    totals:{turns:Number(aggregate.total_turns||0),syncRounds:Number(aggregate.sync_rounds||0),coincidences:Number(aggregate.coincidences||0),guessHits:Number(aggregate.guess_hits||0),reactions:Number(aggregate.reactions||0),personalizedSync:Number(aggregate.personalized_sync||0)},
    recent:recent.map(row=>({id:row.id,deck:validDeck(row.deck),status:row.status,finishReason:row.finish_reason||'',startedAt:row.started_at,endedAt:row.ended_at,durationSeconds:Number(row.duration_seconds||0),turns:Number(row.total_turns||0),syncRounds:Number(row.sync_rounds||0),coincidences:Number(row.coincidences||0),guessHits:Number(row.guess_hits||0),reactions:Number(row.reactions||0),personalizedSync:Number(row.personalized_sync||0),extended:Boolean(row.extended)}))
  };
}

function buildRoomState(playerIds, creatorId, mazo, dating=false) {
  const ids=[...playerIds];
  const userIds={};
  for(const sid of ids){const sock=io.sockets.sockets.get(sid);if(sock?.userId)userIds[sid]=sock.userId;}
  return {
    players:new Set(ids), creatorId, mazo:validDeck(mazo), dating:Boolean(dating),
    userIds,reconnects:{},syncPauseRemainingMs:null,
    turnSocketId:creatorId, activeCard:null, syncRound:null,historyId:null,matchId:null,startedAt:now(),historyFinalized:false,
    game:{turns:Object.fromEntries(ids.map(id=>[id,0])),reactions:0,syncRounds:0,coincidences:0,guessHits:0,personalizedSync:0,personalizedSyncUsed:false,completed:false,extended:false,coreCompletedAt:null,decisions:{},resumeTurnSocketId:creatorId}
  };
}
function ensureRoomPlayerState(room, socketId) {
  if(!room.game)room.game={turns:{},reactions:0,syncRounds:0,coincidences:0,guessHits:0,personalizedSync:0,personalizedSyncUsed:false,completed:false,extended:false,coreCompletedAt:null,decisions:{},resumeTurnSocketId:room.creatorId||socketId};
  if(!room.game.turns)room.game.turns={};
  if(!(socketId in room.game.turns))room.game.turns[socketId]=0;
  if(!room.turnSocketId)room.turnSocketId=room.creatorId||socketId;
  if(!room.game.decisions)room.game.decisions={};
  if(!Number.isFinite(Number(room.game.coincidences)))room.game.coincidences=0;
  if(!Number.isFinite(Number(room.game.guessHits)))room.game.guessHits=0;
  if(!Number.isFinite(Number(room.game.personalizedSync)))room.game.personalizedSync=0;
  if(typeof room.game.personalizedSyncUsed!=='boolean')room.game.personalizedSyncUsed=false;
  if(!('coreCompletedAt' in room.game))room.game.coreCompletedAt=null;
  if(!('historyFinalized' in room))room.historyFinalized=false;
  if(!room.userIds)room.userIds={};
  if(!room.reconnects)room.reconnects={};
  const sock=roomSocket(room,socketId);if(sock?.userId&&!room.userIds[socketId])room.userIds[socketId]=sock.userId;
}
function clearRoomSyncTimer(room){if(room?.syncRound?.timer){clearTimeout(room.syncRound.timer);room.syncRound.timer=null;}}

function roomUserId(room,socketId){
  return String(room?.userIds?.[socketId] || roomSocket(room,socketId)?.userId || '');
}
function roomConnectedSockets(room){
  return [...(room?.players||[])].map(sid=>roomSocket(room,sid)).filter(Boolean);
}
function roomReconnectCount(room){return Object.keys(room?.reconnects||{}).length;}
function clearRoomReconnect(room,userId){
  const item=room?.reconnects?.[userId];
  if(item?.timer)clearTimeout(item.timer);
  if(room?.reconnects)delete room.reconnects[userId];
}
function clearAllRoomReconnects(room){
  for(const userId of Object.keys(room?.reconnects||{}))clearRoomReconnect(room,userId);
}
function replaceRoomSocketId(room,oldSid,newSocket){
  const newSid=newSocket.id,userId=newSocket.userId;
  room.players.delete(oldSid);room.players.add(newSid);
  room.userIds[newSid]=userId;delete room.userIds[oldSid];
  if(room.creatorId===oldSid)room.creatorId=newSid;
  if(room.turnSocketId===oldSid)room.turnSocketId=newSid;
  if(room.game?.resumeTurnSocketId===oldSid)room.game.resumeTurnSocketId=newSid;
  if(room.activeCard?.ownerSocketId===oldSid)room.activeCard.ownerSocketId=newSid;
  if(room.syncRound?.initiatorSocketId===oldSid)room.syncRound.initiatorSocketId=newSid;
  if(room.game?.turns && Object.prototype.hasOwnProperty.call(room.game.turns,oldSid)){
    room.game.turns[newSid]=room.game.turns[oldSid];delete room.game.turns[oldSid];
  }
  if(room.game?.decisions && Object.prototype.hasOwnProperty.call(room.game.decisions,oldSid)){
    room.game.decisions[newSid]=room.game.decisions[oldSid];delete room.game.decisions[oldSid];
  }
  if(room.syncRound?.submissions && Object.prototype.hasOwnProperty.call(room.syncRound.submissions,oldSid)){
    room.syncRound.submissions[newSid]=room.syncRound.submissions[oldSid];delete room.syncRound.submissions[oldSid];
  }
}
function gameResumePayload(room,sid){
  const otherSid=[...room.players].find(x=>x!==sid)||'';
  const otherUserId=roomUserId(room,otherSid);
  const otherProfile=otherUserId?getProfile(otherUserId):null;
  const yourTurns=Number(room.game?.turns?.[sid]||0);
  const opponentTurns=Number(room.game?.turns?.[otherSid]||0);
  const progress={
    yourTurns,opponentTurns,targetTurns:GAME_TARGET_TURNS,reactions:Number(room.game?.reactions||0),
    syncRounds:Number(room.game?.syncRounds||0),coincidences:Number(room.game?.coincidences||0),
    guessHits:Number(room.game?.guessHits||0),personalizedSync:Number(room.game?.personalizedSync||0),
    extended:Boolean(room.game?.extended),completed:Boolean(room.game?.completed),yourTurn:room.turnSocketId===sid
  };
  let activeCard=null;
  if(room.activeCard){
    activeCard={
      tipo:room.activeCard.tipo,
      textoCarta:room.activeCard.textoCarta,
      isYours:room.activeCard.ownerSocketId===sid,
      startedAt:Number(room.activeCard.startedAt||0)
    };
  }
  let syncRound=null;
  if(room.syncRound){
    const remaining=Math.max(5,Math.ceil(Number(room.syncPauseRemainingMs||SYNC_ROUND_TTL_MS)/1000));
    syncRound={
      id:room.syncRound.id,mode:room.syncRound.mode,prompt:room.syncRound.prompt,options:room.syncRound.options,
      personalized:Boolean(room.syncRound.personalized),sharedInterest:room.syncRound.sharedInterest||'',
      initiatorSocketId:room.syncRound.initiatorSocketId,
      initiatorName:roomSocket(room,room.syncRound.initiatorSocketId)?.nombre||'Tu Match',
      timeoutSeconds:remaining,
      youSubmitted:Boolean(room.syncRound.submissions?.[sid])
    };
  }
  return {
    salaID:[...rooms.entries()].find(([,r])=>r===room)?.[0]||'',
    mazo:room.mazo,origen:room.dating?'dating':'legacy',matchId:room.matchId||'',
    opponentId:otherUserId,oponenteNombre:otherProfile?.nombre||roomSocket(room,otherSid)?.nombre||'Tu oponente',
    oponenteAvatar:otherProfile?.avatar||roomSocket(room,otherSid)?.avatar||'',
    yourTurn:room.turnSocketId===sid,progress,activeCard,syncRound,
    finalPending:Boolean(room.game?.completed),reconnectGraceSeconds:Math.round(GAME_RECONNECT_GRACE_MS/1000)
  };
}
function resumeSyncTimerIfReady(room,roomId){
  if(!room?.syncRound||roomReconnectCount(room)>0)return;
  const ms=Math.max(5000,Number(room.syncPauseRemainingMs||SYNC_ROUND_TTL_MS));
  room.syncPauseRemainingMs=null;
  clearRoomSyncTimer(room);
  const syncId=room.syncRound.id;
  room.syncRound.timer=setTimeout(()=>expireSyncRound(roomId,syncId),ms);
}
function expireDisconnectedRoom(roomId,userId){
  const room=rooms.get(roomId);if(!room||!room.reconnects?.[userId])return;
  clearAllRoomReconnects(room);
  clearRoomSyncTimer(room);
  gameHistoryFinalize(room,'disconnect_timeout');
  for(const sid of [...room.players]){
    const sock=roomSocket(room,sid);
    if(!sock)continue;
    sock.emit('oponente_abandono',{reason:'disconnect_timeout'});
    sock.leave(roomId);sock.room=null;
  }
  rooms.delete(roomId);
}
function scheduleRoomReconnect(socket){
  const roomId=socket.room;if(!roomId)return false;
  const room=rooms.get(roomId);if(!room||!room.players.has(socket.id))return false;
  ensureRoomPlayerState(room,socket.id);
  const userId=socket.userId||roomUserId(room,socket.id);if(!userId)return false;
  if(room.reconnects[userId])clearRoomReconnect(room,userId);
  if(room.syncRound?.timer && roomReconnectCount(room)===0){
    const elapsed=Math.max(0,now()-Number(room.syncRound.createdAt||now()));
    room.syncPauseRemainingMs=Math.max(5000,SYNC_ROUND_TTL_MS-elapsed);
    clearRoomSyncTimer(room);
  }
  const expiresAt=now()+GAME_RECONNECT_GRACE_MS;
  const timer=setTimeout(()=>expireDisconnectedRoom(roomId,userId),GAME_RECONNECT_GRACE_MS);
  room.reconnects[userId]={socketId:socket.id,expiresAt,timer};
  for(const sid of room.players){
    if(sid===socket.id)continue;
    const other=roomSocket(room,sid);
    if(other)other.emit('vr_opponent_reconnecting',{seconds:Math.round(GAME_RECONNECT_GRACE_MS/1000),expiresAt});
  }
  socket.room=null;
  return true;
}
function resumeRoomForSocket(socket){
  const userId=socket.userId;if(!userId)return null;
  for(const [roomId,room] of rooms){
    const pending=room.reconnects?.[userId];
    if(!pending)continue;
    if(Number(pending.expiresAt||0)<=now()){expireDisconnectedRoom(roomId,userId);return null;}
    const oldSid=pending.socketId;
    clearRoomReconnect(room,userId);
    replaceRoomSocketId(room,oldSid,socket);
    socket.join(roomId);socket.room=roomId;socket.mazo=room.mazo;
    ensureRoomPlayerState(room,socket.id);
    if(roomReconnectCount(room)>0){
      socket.emit('vr_opponent_reconnecting',{seconds:Math.max(1,Math.ceil((Math.max(...Object.values(room.reconnects).map(x=>Number(x.expiresAt||0)))-now())/1000))});
      return roomId;
    }
    resumeSyncTimerIfReady(room,roomId);
    for(const sid of room.players){
      const sock=roomSocket(room,sid);if(sock)sock.emit('vr_game_resumed',gameResumePayload(room,sid));
    }
    emitGameProgress(room);
    return roomId;
  }
  return null;
}

function leaveRoom(socket, notifyOpponent=false, reason='left') {
  const roomId=socket.room; if(!roomId)return;
  const room=rooms.get(roomId);
  if(room){clearAllRoomReconnects(room);gameHistoryFinalize(room,reason);}
  socket.leave(roomId); socket.room=null; if(!room)return;
  room.players.delete(socket.id);
  if(room.game?.turns)delete room.game.turns[socket.id];
  if(notifyOpponent)socket.to(roomId).emit('oponente_abandono');
  if(room.syncRound?.submissions)delete room.syncRound.submissions[socket.id];
  if(notifyOpponent&&room.players.size){
    clearRoomSyncTimer(room);
    for(const sid of [...room.players]){const other=roomSocket(room,sid);if(other){other.leave(roomId);other.room=null;}}
    rooms.delete(roomId);return;
  }
  if(room.players.size===0){clearRoomSyncTimer(room);rooms.delete(roomId);}
  else {
    if(room.creatorId===socket.id)room.creatorId=[...room.players][0];
    if(room.turnSocketId===socket.id)room.turnSocketId=[...room.players][0]||null;
    if(room.syncRound?.initiatorSocketId===socket.id){clearRoomSyncTimer(room);room.syncRound=null;}
  }
}
function socketForUser(userId) {
  const set=onlineUsers.get(userId); if(!set||!set.size)return null;
  for(const sid of set){const s=io.sockets.sockets.get(sid);if(s)return s;} return null;
}
function roomSocket(room, socketId){return socketId?io.sockets.sockets.get(socketId):null;}
function roomOpponentById(room, socketId){
  if(!room)return null;
  for(const sid of room.players){if(sid!==socketId){const other=roomSocket(room,sid);if(other)return other;}}
  return null;
}
function roomForSocket(socket, sala=''){
  const roomId=String(sala||socket.room||'');
  if(!roomId||socket.room!==roomId)return null;
  const room=rooms.get(roomId); if(!room||!room.players.has(socket.id))return null;
  ensureRoomPlayerState(room,socket.id); return room;
}
function createDatingRoom(socket, opponent, mazo) {
  const deck=validDeck(mazo); leaveRoom(socket,false,'room_changed');leaveRoom(opponent,false,'room_changed');removeFromLobby(socket.id);removeFromLobby(opponent.id);
  const salaID=safeRoomId(); socket.join(salaID);opponent.join(salaID);socket.room=salaID;opponent.room=salaID;socket.mazo=opponent.mazo=deck;
  const room=buildRoomState([socket.id,opponent.id],socket.id,deck,true);
  const match=getActiveMatch(socket.userId,opponent.userId);
  rooms.set(salaID,room);gameHistoryStart(room,match?.id||null);
  socket.emit('partida_iniciada',{salaID,creadorID:socket.id,mazo:deck,origen:'dating',matchId:match?.id||'',oponenteID:opponent.userId||'',oponenteNombre:opponent.nombre||'Tu match',oponenteAvatar:opponent.avatar||''});
  opponent.emit('partida_iniciada',{salaID,creadorID:socket.id,mazo:deck,origen:'dating',matchId:match?.id||'',oponenteID:socket.userId||'',oponenteNombre:socket.nombre||'Tu match',oponenteAvatar:socket.avatar||''});
  emitGameProgress(room);
  return salaID;
}
function roomOpponentSocket(socket) {
  if(!socket.room)return null;
  const room=rooms.get(socket.room); if(!room)return null;
  return roomOpponentById(room,socket.id);
}
function notifyOpponentTurn(socket, reason='Tu turno') {
  const other=roomOpponentSocket(socket);
  if(!other?.userId)return;
  const senderName=socket.nombre||getProfile(socket.userId)?.nombre||'Tu oponente';
  createNotification(other.userId,'game_turn','Te toca jugar',`${senderName} terminó su jugada. Es tu turno.`,{roomId:socket.room,reason},socket.userId);
}
function emitGameProgress(room){
  if(!room?.game)return;
  for(const sid of room.players){
    const sock=roomSocket(room,sid);if(!sock)continue;
    const other=roomOpponentById(room,sid);
    sock.emit('vr_game_progress',{
      yourTurns:Number(room.game.turns?.[sid]||0),opponentTurns:Number(other?room.game.turns?.[other.id]||0:0),
      targetTurns:GAME_TARGET_TURNS,reactions:Number(room.game.reactions||0),syncRounds:Number(room.game.syncRounds||0),
      coincidences:Number(room.game.coincidences||0),guessHits:Number(room.game.guessHits||0),personalizedSync:Number(room.game.personalizedSync||0),
      extended:Boolean(room.game.extended),completed:Boolean(room.game.completed),yourTurn:room.turnSocketId===sid
    });
  }
}
function emitGameComplete(room){
  if(!room?.game)return;
  for(const sid of room.players){
    const sock=roomSocket(room,sid);if(!sock)continue;
    const other=roomOpponentById(room,sid);
    sock.emit('vr_game_complete',{
      yourTurns:Number(room.game.turns?.[sid]||0),opponentTurns:Number(other?room.game.turns?.[other.id]||0:0),
      syncRounds:Number(room.game.syncRounds||0),reactions:Number(room.game.reactions||0),coincidences:Number(room.game.coincidences||0),
      guessHits:Number(room.game.guessHits||0),personalizedSync:Number(room.game.personalizedSync||0),targetTurns:GAME_TARGET_TURNS
    });
  }
}
function completeRoomTurn(room, actingSocket, meta={}){
  if(!room||!actingSocket)return {completed:false,next:null};
  ensureRoomPlayerState(room,actingSocket.id);
  room.game.turns[actingSocket.id]=Number(room.game.turns[actingSocket.id]||0)+1;
  if(meta.syncCompleted)room.game.syncRounds=Number(room.game.syncRounds||0)+1;
  const next=roomOpponentById(room,actingSocket.id);
  room.turnSocketId=next?.id||null;
  room.game.resumeTurnSocketId=room.turnSocketId;
  room.activeCard=null;
  const ids=[...room.players];
  const reached=!room.game.extended&&ids.length===2&&ids.every(id=>Number(room.game.turns?.[id]||0)>=GAME_TARGET_TURNS);
  if(reached){
    room.game.completed=true;room.game.coreCompletedAt=room.game.coreCompletedAt||now();room.game.decisions={};room.game.resumeTurnSocketId=room.turnSocketId;room.turnSocketId=null;
    gameHistoryPersist(room);emitGameProgress(room);emitGameComplete(room);return {completed:true,next};
  }
  gameHistoryPersist(room);emitGameProgress(room);
  return {completed:false,next};
}
function normalizedInterests(profile){
  const out=new Map();
  for(const item of profile?.intereses||[]){
    const label=cleanShortText(item,24);const key=label.toLowerCase();
    if(key&&!out.has(key))out.set(key,label);
  }
  return out;
}
function sharedRoomInterests(room){
  if(!room?.dating||room.players.size!==2)return [];
  const profiles=[...room.players].map(sid=>roomSocket(room,sid)?.userId).filter(Boolean).map(getProfile).filter(Boolean);
  if(profiles.length!==2)return [];
  const a=normalizedInterests(profiles[0]),b=normalizedInterests(profiles[1]),shared=[];
  for(const [key,label] of a){if(b.has(key))shared.push(label);}
  return shared.slice(0,4);
}
function personalizedSyncCard(room,mode){
  const shared=sharedRoomInterests(room);if(!shared.length)return null;
  const interest=shared[Math.floor(Math.random()*shared.length)];
  if(mode==='guess')return {personalized:true,sharedInterest:interest,prompt:`Los dos tenéis “${interest}” en común. Si hicierais un plan relacionado con eso, ¿qué elegirías?`,a:'Descubrir algo nuevo',b:'Repetir un favorito'};
  if(mode==='secret')return {personalized:true,sharedInterest:interest,prompt:`Tenéis “${interest}” en común. Escribe un plan concreto relacionado con ese interés que te apetecería compartir con tu Match.`};
  return {personalized:true,sharedInterest:interest,prompt:`Tenéis “${interest}” en común. Si lo compartierais en una cita, ¿qué os apetecería más?`,a:'Un plan tranquilo',b:'Algo nuevo e improvisado'};
}
function pickSyncCard(room,mode){
  if(room?.dating&&!room.game?.personalizedSyncUsed){
    const personalized=personalizedSyncCard(room,mode);
    if(personalized){room.game.personalizedSyncUsed=true;return personalized;}
  }
  const deck=SYNC_GAME_CARDS[validDeck(room?.mazo)]||SYNC_GAME_CARDS.rompehielos;
  const list=deck[mode]||SYNC_GAME_CARDS.rompehielos[mode]||[];
  const picked=list.length?list[Math.floor(Math.random()*list.length)]:null;
  return picked?{...picked,personalized:false,sharedInterest:''}:null;
}
function closeRoomForAll(roomId,event='vr_game_finished',payload={}){
  const room=rooms.get(roomId);if(!room)return;
  clearAllRoomReconnects(room);clearRoomSyncTimer(room);gameHistoryFinalize(room,cleanShortText(payload?.reason,40)||'finish');
  for(const sid of [...room.players]){const sock=roomSocket(room,sid);if(!sock)continue;sock.emit(event,payload);sock.leave(roomId);sock.room=null;}
  rooms.delete(roomId);
}
function expireSyncRound(roomId,syncId){
  const room=rooms.get(roomId);if(!room?.syncRound||room.syncRound.id!==syncId)return;
  const round=room.syncRound;clearRoomSyncTimer(room);room.syncRound=null;
  const initiator=roomSocket(room,round.initiatorSocketId);if(!initiator)return;
  const next=roomOpponentById(room,initiator.id);
  for(const sid of room.players){const sock=roomSocket(room,sid);if(sock)sock.emit('vr_sync_cancelled',{reason:'Tiempo agotado',initiatorSocketId:initiator.id,yourTurn:next?.id===sid});}
  const result=completeRoomTurn(room,initiator,{syncCompleted:false,timeout:true});
  if(!result.completed&&result.next)notifyOpponentTurn(initiator,'ronda sincronizada agotada');
}


io.on('connection', socket => {
  const userId=socket.userId;
  socketSet(userId).add(socket.id);
  db.prepare('UPDATE users SET last_seen_at=? WHERE id=?').run(now(),userId);
  const p=getProfile(userId); if(p){socket.nombre=p.nombre;socket.avatar=p.avatar;socket.edad=p.edad;}
  socket.emit('dating_profiles',discoverFor(userId)); socket.emit('dating_matches',matchesFor(userId)); socket.emit('plus_state',getPlusState(userId)); socket.emit('notification_state',notificationState(userId));
  setTimeout(()=>broadcastDiscovery(),20);
  setTimeout(()=>resumeRoomForSocket(socket),40);
  socket.on('vr_resume_request',(data={},ack)=>{const done=typeof ack==='function'?ack:()=>{};const roomId=resumeRoomForSocket(socket);done({ok:true,resumed:Boolean(roomId),roomId:roomId||''});});

  socket.on('dating_join',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{};
    const age=Number(data.edad); const name=cleanName(data.nombre);
    if(name.length<2||!Number.isInteger(age)||age<18||age>99)return done({ok:false,error:'Completa un perfil válido +18.'});
    try{
      const current=getProfile(userId);
      const firstProfileSave=!current;
      const photos=savePhotos(userId,Array.isArray(data.fotos)?data.fotos:(current?.fotos||[]));
      const photosChanged=Boolean(current?.profileVerified && JSON.stringify(photos)!==JSON.stringify(Array.isArray(current?.fotos)?current.fotos:[]));
      const hasAvatarField=Object.prototype.hasOwnProperty.call(data,'avatar');
      const safeCurrentAvatar=cleanAvatar(userId,current?.avatar||'');
      const avatarInput=hasAvatarField?data.avatar:(photos[0]||safeCurrentAvatar||'');
      const avatar=cleanAvatar(userId,avatarInput)||(hasAvatarField?'':(photos[0]||safeCurrentAvatar||''));
      const pref=data.preferences||{};
      const ageMin=Math.max(18,Math.min(99,Number(pref.ageMin)||18)); const ageMax=Math.max(ageMin,Math.min(99,Number(pref.ageMax)||99));
      const radiusKm=cleanRadius(pref.radiusKm,current?.preferences?.radiusKm||50);
      db.prepare(`INSERT INTO profiles(user_id,name,age,gender,city,bio,interests_json,avatar,photos_json,age_min,age_max,looking_for,city_pref,interest_pref,radius_km,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,age=excluded.age,gender=excluded.gender,city=excluded.city,bio=excluded.bio,interests_json=excluded.interests_json,avatar=excluded.avatar,photos_json=excluded.photos_json,age_min=excluded.age_min,age_max=excluded.age_max,looking_for=excluded.looking_for,city_pref=excluded.city_pref,interest_pref=excluded.interest_pref,radius_km=excluded.radius_km,updated_at=excluded.updated_at`)
      .run(userId,name,age,cleanGender(data.gender),cleanShortText(data.ciudad,40),cleanShortText(data.bio,180),JSON.stringify(cleanInterests(data.intereses)),avatar,JSON.stringify(photos),ageMin,ageMax,cleanLooking(pref.lookingFor),cleanShortText(pref.city,40),cleanShortText(pref.interest,30),radiusKm,now());
      if(photosChanged){db.prepare('UPDATE profiles SET profile_verified=0,profile_verified_at=NULL,updated_at=? WHERE user_id=?').run(now(),userId);logSecurityEvent(userId,'verification_revoked_photo_change',1);}
      const np=getProfile(userId); if(firstProfileSave)recordFirstUserGrowthEvent(userId,'profile_completed',{city:np?.ciudad||''}); maybeRecordProfileReady(userId,np); socket.nombre=np.nombre;socket.avatar=np.avatar;socket.edad=np.edad; done({ok:true,profile:np,verificationRevoked:photosChanged,activation:activationState(userId)}); broadcastDiscovery();
    }catch(e){console.error(e);done({ok:false,error:'No se pudo guardar el perfil.'});}
  });

  socket.on('dating_pass',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{}; if(!allowAction(`pass:${userId}`,120,60000))return done({ok:false,error:'Vas demasiado rápido. Espera un momento.'}); const target=String(data.oponenteID||'');
    if(!target||target===userId)return done({ok:false,error:'Perfil no válido.'});
    db.prepare('INSERT OR REPLACE INTO passes(from_user,to_user,created_at) VALUES(?,?,?)').run(userId,target,now()); done({ok:true}); socket.emit('dating_profiles',discoverFor(userId));
  });

  socket.on('dating_rewind',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{};
    if(!plusIsActive(userId))return done({ok:false,error:'Rewind requiere V/R+.',plusRequired:true});
    if(!allowAction(`rewind:${userId}`,12,60000))return done({ok:false,error:'Espera un momento antes de volver a usar Rewind.'});
    const row=db.prepare('SELECT to_user,created_at FROM passes WHERE from_user=? ORDER BY created_at DESC LIMIT 1').get(userId);
    if(!row)return done({ok:false,error:'No hay un perfil reciente que puedas recuperar.'});
    const target=String(row.to_user||'');
    db.prepare('DELETE FROM passes WHERE from_user=? AND to_user=?').run(userId,target);
    const list=discoverFor(userId);
    const profile=list.find(p=>p.id===target);
    if(!profile){
      db.prepare('INSERT OR REPLACE INTO passes(from_user,to_user,created_at) VALUES(?,?,?)').run(userId,target,Number(row.created_at)||now());
      return done({ok:false,error:'Ese perfil ya no está disponible para Rewind.'});
    }
    socket.emit('dating_profiles',list);
    done({ok:true,profile});
  });

  socket.on('dating_like',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{}; if(!allowAction(`like:${userId}`,90,60000)){logSecurityEvent(userId,'like_burst',2);return done({ok:false,error:'Vas demasiado rápido. Espera un momento.'});} const target=String(data.oponenteID||'');
    if(!target||target===userId||!getProfile(target))return done({ok:false,error:'Ese perfil ya no está disponible.'});
    const verifiedProfile=Boolean(db.prepare('SELECT profile_verified FROM profiles WHERE user_id=?').get(userId)?.profile_verified);
    const dailyLikeLimit=verifiedProfile?400:250;
    const likes24h=Number(db.prepare('SELECT COUNT(*) n FROM likes WHERE from_user=? AND created_at>?').get(userId,now()-24*60*60*1000)?.n||0);
    if(likes24h>=dailyLikeLimit){logSecurityEvent(userId,'like_daily_limit',2,{limit:dailyLikeLimit});return done({ok:false,error:'Has alcanzado el límite de seguridad de likes de hoy. Vuelve a intentarlo más tarde.'});}
    if(blockedEitherWay(userId,target))return done({ok:false,error:'Ese perfil no está disponible.'});
    const likeInsert=db.prepare('INSERT OR IGNORE INTO likes(from_user,to_user,created_at) VALUES(?,?,?)').run(userId,target,now());
    if(likeInsert.changes){recordFirstUserGrowthEvent(userId,'first_like');refreshReferrerRewardsForInvitee(userId);}
    const reciprocal=Boolean(db.prepare('SELECT 1 FROM likes WHERE from_user=? AND to_user=?').get(target,userId));
    let match=null;
    if(reciprocal){
      const existingActiveMatch=getActiveMatch(userId,target);
      const [u1,u2]=pair(userId,target); const id=matchIdFor(userId,target); const ts=now();
      db.prepare('INSERT INTO matches(id,user1,user2,created_at,active) VALUES(?,?,?,?,1) ON CONFLICT(user1,user2) DO UPDATE SET active=1').run(id,u1,u2,ts);
      match=getActiveMatch(userId,target); const me=publicProfile(getProfile(userId)),other=publicProfile(getProfile(target));
      if(!existingActiveMatch){recordFirstUserGrowthEvent(userId,'first_match');recordFirstUserGrowthEvent(target,'first_match');}
      emitToUser(userId,'dating_match',{...other,matchId:match.id}); emitToUser(target,'dating_match',{...me,matchId:match.id}); emitMatches(userId);emitMatches(target);
      const myNotification=createNotification(userId,'match','¡Nuevo match!',`Tú y ${other?.nombre||'alguien'} os gustáis.`,{partnerId:target,matchId:match.id},target);
      const targetNotification=createNotification(target,'match','¡Nuevo match!',`Tú y ${me?.nombre||'alguien'} os gustáis.`,{partnerId:userId,matchId:match.id},userId);
      // La persona que completa el match ya está dentro de la app. El correo se envía
      // a la otra persona, que fue quien había mostrado interés previamente.
      if(!existingActiveMatch && targetNotification){
        setImmediate(()=>sendNewMatchEmail(target,me,targetNotification.id).catch(e=>console.warn('Email nuevo match:',e.message)));
      }
    }
    done({ok:true,match:Boolean(match)}); socket.emit('dating_profiles',discoverFor(userId)); broadcastDiscovery();
  });

  socket.on('dating_chat_history',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{}; const target=String(data.oponenteID||''); const match=getActiveMatch(userId,target);
    if(!match)return done({ok:false,error:'Ese match ya no está disponible.',messages:[],items:[]});
    const items=chatTimelineFor(match.id,userId);const messages=items.filter(x=>x.kind==='message');
    done({ok:true,messages,items});
  });

  socket.on('dating_chat_send',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{}; if(!allowAction(`chat:${userId}`,25,10000))return done({ok:false,error:'Estás enviando mensajes demasiado rápido.'}); const target=String(data.oponenteID||''); const match=getActiveMatch(userId,target);
    if(!match||blockedEitherWay(userId,target))return done({ok:false,error:'Ese match ya no está disponible.'});
    const text=cleanShortText(data.texto,500); if(!text)return done({ok:false,error:'Escribe un mensaje antes de enviarlo.'});
    const duplicate=db.prepare('SELECT 1 FROM messages WHERE match_id=? AND from_user=? AND text=? AND created_at>? LIMIT 1').get(match.id,userId,text,now()-15000); if(duplicate)return done({ok:false,error:'Ese mensaje ya se envió hace un momento.'});
    const repeatedAcrossMatches=Number(db.prepare('SELECT COUNT(DISTINCT match_id) n FROM messages WHERE from_user=? AND LOWER(text)=LOWER(?) AND created_at>?').get(userId,text,now()-30*60*1000)?.n||0);
    if(repeatedAcrossMatches>=6){logSecurityEvent(userId,'repeated_message_across_matches',3,{matches:repeatedAcrossMatches});return done({ok:false,error:'Ese mismo mensaje se ha enviado demasiadas veces. Personalízalo antes de continuar.'});}
    const account=db.prepare('SELECT created_at FROM users WHERE id=?').get(userId);
    if(account && now()-Number(account.created_at||0)<24*60*60*1000 && /(https?:\/\/|www\.|\b\d{9,}\b|@[a-z0-9_.-]{2,})/i.test(text)) logSecurityEvent(userId,'early_external_contact',1);
    const message={id:safeId('msg'),from:userId,to:target,text,ts:now()};
    db.prepare('INSERT INTO messages(id,match_id,from_user,text,created_at) VALUES(?,?,?,?,?)').run(message.id,match.id,userId,text,message.ts);
    recordFirstUserGrowthEvent(userId,'first_message');
    emitToUser(userId,'dating_chat_message',message);emitToUser(target,'dating_chat_message',message);emitMatches(userId);emitMatches(target);
    const senderProfile=publicProfile(getProfile(userId));
    const senderName=senderProfile?.nombre||'Tu match';
    const messageNotification=createNotification(target,'message','Nuevo mensaje',`${senderName} te ha escrito.`,{partnerId:userId,matchId:match.id,messageId:message.id},userId);
    if(!socketForUser(target) && messageNotification){
      setImmediate(()=>sendNewMessageEmail(target,senderProfile,messageNotification.id,match.id).catch(e=>console.warn('Email nuevo mensaje:',e.message)));
    }
    done({ok:true,id:message.id});
  });

  socket.on('dating_quick_challenge',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{};const target=String(data.oponenteID||'');const match=getActiveMatch(userId,target);
    if(!match||blockedEitherWay(userId,target))return done({ok:false,error:'Ese match ya no está disponible.'});
    if(!allowAction(`quick:${userId}`,12,60*60*1000))return done({ok:false,error:'Has lanzado bastantes retos rápidos. Espera un poco.'});
    const preset=CHAT_QUICK_CHALLENGES[Math.floor(Math.random()*CHAT_QUICK_CHALLENGES.length)];const id=safeId('quick'),ts=now();
    db.prepare('INSERT INTO quick_challenges(id,match_id,created_by,prompt,option_a,option_b,status,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(id,match.id,userId,preset.prompt,preset.a,preset.b,'active',ts);
    chatEventInsert(match.id,userId,'quick_challenge',id,{prompt:preset.prompt,a:preset.a,b:preset.b});
    recordFirstUserGrowthEvent(userId,'first_interaction');
    const actor=publicProfile(getProfile(userId));
    const notification=createNotification(target,'message','⚡ Reto rápido',`${actor?.nombre||'Tu match'} te ha lanzado un A o B.`,{partnerId:userId,matchId:match.id,quickChallengeId:id},userId);
    for(const uid of [match.user1,match.user2]){const item=chatEventByRelated(match.id,'quick_challenge',id,uid);if(item)emitToUser(uid,'dating_chat_event',item);}
    done({ok:true,challenge:quickChallengePublic(id,userId),notificationId:notification?.id||''});
  });

  socket.on('dating_quick_answer',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{};const challengeId=String(data.challengeId||'');const choice=['a','b'].includes(String(data.choice||''))?String(data.choice):'';
    if(!challengeId||!choice)return done({ok:false,error:'Respuesta no válida.'});
    const q=db.prepare('SELECT * FROM quick_challenges WHERE id=?').get(challengeId);if(!q)return done({ok:false,error:'Ese reto ya no está disponible.'});
    const match=db.prepare('SELECT * FROM matches WHERE id=? AND active=1').get(q.match_id);if(!match||![match.user1,match.user2].includes(userId)||blockedEitherWay(match.user1,match.user2))return done({ok:false,error:'Ese reto ya no está disponible.'});
    const inserted=db.prepare('INSERT OR IGNORE INTO quick_challenge_answers(challenge_id,user_id,choice,answered_at) VALUES(?,?,?,?)').run(challengeId,userId,choice,now());
    if(!inserted.changes)return done({ok:false,error:'Tu respuesta ya estaba bloqueada.'});
    const count=Number(db.prepare('SELECT COUNT(*) n FROM quick_challenge_answers WHERE challenge_id=?').get(challengeId)?.n||0);if(count>=2)db.prepare("UPDATE quick_challenges SET status='completed',closed_at=? WHERE id=?").run(now(),challengeId);
    recordFirstUserGrowthEvent(userId,'first_interaction');emitChatRelatedUpdate(match,'quick_challenge',challengeId);
    done({ok:true,challenge:quickChallengePublic(challengeId,userId)});
  });

  socket.on('dating_game_status',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{};const target=String(data.oponenteID||'');if(!getActiveMatch(userId,target))return done({ok:false,error:'Ese match ya no está disponible.'});
    const active=activeRoomForPair(userId,target);let resume=null;
    if(active){let sid=[...active.room.players].find(x=>roomUserId(active.room,x)===userId)||'';if(sid&&sid===socket.id)resume=gameResumePayload(active.room,sid);}
    const pending=db.prepare("SELECT id FROM game_invitations WHERE match_id=? AND status='pending' AND expires_at>? ORDER BY created_at DESC LIMIT 1").get(getActiveMatch(userId,target).id,now());
    done({ok:true,active:Boolean(active),resume,pendingInvite:pending?gameInvitationPublic(pending.id,userId):null});
  });

  socket.on('dating_game_resume',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{};const target=String(data.oponenteID||'');const active=activeRoomForPair(userId,target);
    if(!active)return done({ok:false,error:'No hay una partida activa con este match.'});
    let sid=[...active.room.players].find(x=>roomUserId(active.room,x)===userId)||'';
    if(!sid)return done({ok:false,error:'No se pudo recuperar tu sitio en la partida.'});
    if(sid!==socket.id){const pending=active.room.reconnects?.[userId];if(pending){resumeRoomForSocket(socket);sid=socket.id;}}
    const payload=gameResumePayload(active.room,sid);socket.emit('vr_game_resumed',payload);done({ok:true,roomId:active.roomId});
  });

  socket.on('dating_game_invite',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{}; const target=String(data.oponenteID||''); const opponent=socketForUser(target);const match=getActiveMatch(userId,target);
    if(!match||blockedEitherWay(userId,target))return done({ok:false,error:'Solo puedes jugar con un match activo.'});
    if(!allowAction(`gameinvite:${userId}`,20,60*60*1000))return done({ok:false,error:'Has enviado bastantes invitaciones. Espera un poco.'});
    const targetProfile=getProfile(target); if(targetProfile?.privacy?.allowGameInvites===false)return done({ok:false,error:'Este match ha desactivado las invitaciones a jugar.'});
    if(activeRoomForPair(userId,target))return done({ok:false,active:true,error:'Ya tenéis una partida en curso. Continúala desde el chat.'});
    if(socket.room||opponent?.room)return done({ok:false,error:'Uno de los dos ya está en otra partida. Terminadla antes de empezar una nueva.'});
    const me=publicProfile(getProfile(userId)); const mazo=validDeck(data.mazo),ts=now(),expiresAt=ts+GAME_INVITE_TTL_MS,id=safeId('ginv');
    const superseded=db.prepare("SELECT id FROM game_invitations WHERE match_id=? AND status='pending'").all(match.id);
    db.prepare("UPDATE game_invitations SET status='superseded',responded_at=? WHERE match_id=? AND status='pending'").run(ts,match.id);
    for(const oldInvite of superseded)emitChatRelatedUpdate(match,'game_invite',oldInvite.id);
    db.prepare('INSERT INTO game_invitations(id,match_id,from_user,to_user,deck,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').run(id,match.id,userId,target,mazo,'pending',ts,expiresAt);
    chatEventInsert(match.id,userId,'game_invite',id,{deck:mazo,deckLabel:deckPublicLabel(mazo),expiresAt});recordFirstUserGrowthEvent(userId,'first_interaction');
    if(opponent){pendingGameInvites.set(gameInviteKey(userId,target),{id,from:userId,to:target,mazo,expiresAt});emitToUser(target,'dating_game_invite',{...me,mazo,inviteId:id,expiresAt});}
    for(const uid of [match.user1,match.user2]){const item=chatEventByRelated(match.id,'game_invite',id,uid);if(item)emitToUser(uid,'dating_chat_event',item);}
    const inviteNotification=createNotification(target,'game_invite','Invitación a jugar',`${me?.nombre||'Tu match'} quiere jugar a ${deckPublicLabel(mazo)} contigo.`,{partnerId:userId,matchId:match.id,mazo,inviteId:id,expiresAt,offline:!opponent},userId);
    if(!opponent && inviteNotification)setImmediate(()=>sendGameInviteEmail(target,me,inviteNotification.id,mazo).catch(e=>console.warn('Email invitación a jugar:',e.message)));
    done({ok:true,offline:!opponent,inviteId:id,expiresAt});
  });

  socket.on('dating_game_accept',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{}; const target=String(data.oponenteID||''); const opponent=socketForUser(target);const match=getActiveMatch(userId,target);
    if(!match||blockedEitherWay(userId,target))return done({ok:false,error:'Ese match ya no está disponible.'});
    const inviteId=String(data.inviteId||'');
    const invite=inviteId?db.prepare("SELECT * FROM game_invitations WHERE id=? AND match_id=? AND to_user=?").get(inviteId,match.id,userId):db.prepare("SELECT * FROM game_invitations WHERE match_id=? AND from_user=? AND to_user=? AND status='pending' AND expires_at>? ORDER BY created_at DESC LIMIT 1").get(match.id,target,userId,now());
    if(!invite||invite.status!=='pending'||invite.expires_at<=now())return done({ok:false,error:'La invitación ha caducado o ya no está disponible.'});
    const currentRoom=activeRoomForPair(userId,target);if(currentRoom){socket.emit('vr_game_resumed',gameResumePayload(currentRoom.room,socket.id));return done({ok:true,resume:true,roomId:currentRoom.roomId});}
    if(!opponent){const me=publicProfile(getProfile(userId));createNotification(target,'game_invite','Tu match quiere jugar',`${me?.nombre||'Tu match'} ha abierto tu invitación y quiere jugar.`,{partnerId:userId,matchId:match.id,inviteId:invite.id},userId);return done({ok:false,offline:true,error:'Tu match no está conectado ahora. Le hemos avisado para que vuelva.'});}
    if(socket.room||opponent.room)return done({ok:false,error:'Uno de los dos está en otra partida ahora mismo.'});
    db.prepare("UPDATE game_invitations SET status='accepted',responded_at=? WHERE id=?").run(now(),invite.id);pendingGameInvites.delete(gameInviteKey(target,userId));emitChatRelatedUpdate(match,'game_invite',invite.id);
    recordFirstUserGrowthEvent(userId,'first_interaction');recordFirstUserGrowthEvent(target,'first_interaction');
    const salaID=createDatingRoom(opponent,socket,invite.deck);done({ok:true,salaID});
  });

  socket.on('dating_game_reject',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{};const target=String(data.oponenteID||'');const match=getActiveMatch(userId,target);if(!match)return done({ok:false,error:'Ese match ya no está disponible.'});
    const inviteId=String(data.inviteId||'');const invite=inviteId?db.prepare("SELECT * FROM game_invitations WHERE id=? AND match_id=? AND to_user=?").get(inviteId,match.id,userId):db.prepare("SELECT * FROM game_invitations WHERE match_id=? AND from_user=? AND to_user=? AND status='pending' ORDER BY created_at DESC LIMIT 1").get(match.id,target,userId);
    if(!invite||invite.status!=='pending')return done({ok:false,error:'La invitación ya no está pendiente.'});
    db.prepare("UPDATE game_invitations SET status='declined',responded_at=? WHERE id=?").run(now(),invite.id);pendingGameInvites.delete(gameInviteKey(target,userId));emitChatRelatedUpdate(match,'game_invite',invite.id);done({ok:true});
  });

  // Compatibilidad con el modo de juego/lobby original.
  socket.on('entrar_lobby',(data={})=>{leaveRoom(socket);socket.nombre=cleanName(data.nombre)||socket.nombre;socket.mazo=validDeck(data.mazo);waitingPlayers.set(socket.id,{id:socket.id,nombre:socket.nombre,mazo:socket.mazo,avatar:socket.avatar});broadcastLobby();});
  socket.on('salir_lobby',()=>removeFromLobby(socket.id));
  socket.on('retar_jugador',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{};const opponentId=String(data.oponenteID||'');const mazo=validDeck(data.mazo);const opponent=io.sockets.sockets.get(opponentId);const waiting=waitingPlayers.get(opponentId);
    if(!opponent||!waiting)return done({ok:false,error:'Ese jugador ya no está disponible.'});if(opponentId===socket.id)return done({ok:false,error:'No puedes retarte a ti mismo.'});if(waiting.mazo!==mazo)return done({ok:false,error:'El mazo ya no coincide.'});
    const salaID=safeRoomId();removeFromLobby(socket.id);removeFromLobby(opponentId);socket.join(salaID);opponent.join(salaID);socket.room=salaID;opponent.room=salaID;socket.mazo=opponent.mazo=mazo;rooms.set(salaID,buildRoomState([socket.id,opponent.id],socket.id,mazo,false));done({ok:true,salaID});
    socket.emit('partida_iniciada',{salaID,creadorID:socket.id,mazo,oponenteID:opponent.userId||'',oponenteNombre:opponent.nombre||'Tu oponente',oponenteAvatar:opponent.avatar||''});opponent.emit('partida_iniciada',{salaID,creadorID:socket.id,mazo,oponenteID:socket.userId||'',oponenteNombre:socket.nombre||'Tu oponente',oponenteAvatar:socket.avatar||''});emitGameProgress(rooms.get(salaID));
  });
  socket.on('unirse_sala',(payload,ack)=>{
    const done=typeof ack==='function'?ack:()=>{};const data=(payload&&typeof payload==='object')?payload:{salaID:payload};const roomId=String(data.salaID||'').slice(0,64);if(!roomId)return done({ok:false,error:'Sala no válida.'});
    if(data.nombre)socket.nombre=cleanName(data.nombre);if(data.mazo)socket.mazo=validDeck(data.mazo);removeFromLobby(socket.id);const room=rooms.get(roomId);if(room&&room.players.size>=2&&!room.players.has(socket.id))return done({ok:false,error:'La sala ya está completa.'});
    socket.join(roomId);socket.room=roomId;if(room){room.players.add(socket.id);room.userIds=room.userIds||{};room.userIds[socket.id]=socket.userId;ensureRoomPlayerState(room,socket.id);socket.mazo=room.mazo;done({ok:true,roomId,full:true});const opponent=[...room.players].filter(id=>id!==socket.id).map(id=>io.sockets.sockets.get(id)).find(Boolean);if(opponent){socket.emit('oponente_unido',{nombre:opponent.nombre||'Tu amigo',avatar:opponent.avatar||'',tuTurno:room.turnSocketId===socket.id});opponent.emit('oponente_unido',{nombre:socket.nombre||'Tu amigo',avatar:socket.avatar||'',tuTurno:room.turnSocketId===opponent.id});emitGameProgress(room);}}else{rooms.set(roomId,buildRoomState([socket.id],socket.id,socket.mazo||'rompehielos',false));done({ok:true,roomId,full:false});}
  });
  socket.on('accion_juego',(d={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{};const room=roomForSocket(socket,d.sala);
    if(!room)return done({ok:false,error:'La sala ya no está activa.'});
    if(room.game?.completed)return done({ok:false,error:'La partida está esperando vuestra decisión final.'});
    if(room.syncRound)return done({ok:false,error:'Hay una carta sincronizada en curso.'});
    if(room.turnSocketId!==socket.id)return done({ok:false,error:'Ahora mismo no es tu turno.'});
    if(room.activeCard)return done({ok:false,error:'Ya hay una carta en curso.'});
    const tipo=d.tipo==='reto'?'reto':'verdad';
    const textoCarta=String(d.textoCarta||'').slice(0,1000);
    if(!textoCarta)return done({ok:false,error:'La carta no es válida.'});
    room.activeCard={ownerSocketId:socket.id,tipo,textoCarta,startedAt:now()};
    socket.to(socket.room).emit('actualizar_mesa',{tipo,textoCarta,sala:socket.room});
    done({ok:true});
  });
  socket.on('enviar_respuesta',(d={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{};const room=roomForSocket(socket,d.sala);
    if(!room||room.game?.completed||room.syncRound)return done({ok:false,error:'La sala ya no está activa.'});
    if(room.turnSocketId!==socket.id||room.activeCard?.ownerSocketId!==socket.id||room.activeCard?.tipo!=='verdad')return done({ok:false,error:'Esta pregunta ya no está activa.'});
    const respuesta=cleanShortText(d.respuesta,500);if(!respuesta)return done({ok:false,error:'Escribe una respuesta antes de enviarla.'});
    const pregunta=String(room.activeCard.textoCarta||d.pregunta||'').slice(0,1000);
    socket.to(socket.room).emit('recibir_respuesta',{respuesta,pregunta});
    const result=completeRoomTurn(room,socket,{syncCompleted:false});
    if(!result.completed&&result.next)notifyOpponentTurn(socket,'respuesta');
    done({ok:true});
  });
  socket.on('enviar_media',(d={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{};const room=roomForSocket(socket,d.sala);
    if(!room||room.game?.completed||room.syncRound)return done({ok:false,error:'La sala ya no está activa.'});
    if(room.turnSocketId!==socket.id||room.activeCard?.ownerSocketId!==socket.id||room.activeCard?.tipo!=='reto')return done({ok:false,error:'Este reto ya no está activo.'});
    const tipo=d.tipo==='video'?'video':'imagen',dataUrl=String(d.dataUrl||''),mime=String(d.mime||'').slice(0,80);
    const img=tipo==='imagen'&&/^data:image\/(?:jpeg|png|webp)(?:;[^;]+)*;base64,/i.test(dataUrl),vid=tipo==='video'&&/^data:video\/(?:webm|mp4)(?:;[^;]+)*;base64,/i.test(dataUrl);
    if(!img&&!vid)return done({ok:false,error:'El formato de la prueba no es válido.'});
    if(dataUrl.length>9e6)return done({ok:false,error:'El vídeo pesa demasiado. Grábalo un poco más corto.'});
    socket.to(socket.room).emit('recibir_media',{tipo,dataUrl,mime});
    const result=completeRoomTurn(room,socket,{syncCompleted:false});
    if(!result.completed&&result.next)notifyOpponentTurn(socket,'prueba');
    done({ok:true});
  });
  socket.on('vr_sync_start',(d={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{};const room=roomForSocket(socket,d.sala);
    if(!room)return done({ok:false,error:'La sala ya no está activa.'});
    if(room.game?.completed)return done({ok:false,error:'La partida está esperando vuestra decisión final.'});
    if(room.turnSocketId!==socket.id)return done({ok:false,error:'Ahora mismo no es tu turno.'});
    if(room.activeCard||room.syncRound)return done({ok:false,error:'Ya hay una carta en curso.'});
    const mode=VALID_SYNC_MODES.has(String(d.mode||''))?String(d.mode):'choice';
    const card=pickSyncCard(room,mode);if(!card)return done({ok:false,error:'No se pudo preparar la carta sincronizada.'});
    const syncId=safeId('sync');
    const round={id:syncId,mode,prompt:cleanShortText(card.prompt,320),options:mode==='secret'?null:{a:cleanShortText(card.a,100),b:cleanShortText(card.b,100)},personalized:Boolean(card.personalized),sharedInterest:cleanShortText(card.sharedInterest,24),initiatorSocketId:socket.id,submissions:{},createdAt:now(),timer:null};
    room.syncRound=round;room.activeCard=null;
    round.timer=setTimeout(()=>expireSyncRound(socket.room,syncId),SYNC_ROUND_TTL_MS);
    for(const sid of room.players){const sock=roomSocket(room,sid);if(sock)sock.emit('vr_sync_round_started',{id:syncId,mode,prompt:round.prompt,options:round.options,personalized:round.personalized,sharedInterest:round.sharedInterest,initiatorSocketId:socket.id,initiatorName:socket.nombre||'Tu oponente',timeoutSeconds:Math.floor(SYNC_ROUND_TTL_MS/1000)});}
    done({ok:true,id:syncId});
  });
  socket.on('vr_sync_submit',(d={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{};const room=roomForSocket(socket,d.sala),round=room?.syncRound;
    if(!room||!round||String(d.id||'')!==round.id)return done({ok:false,error:'Esta carta ya no está activa.'});
    if(round.submissions[socket.id])return done({ok:false,error:'Tu respuesta ya quedó bloqueada.'});
    let submission={};
    if(round.mode==='secret'){
      const answer=cleanShortText(d.answer,280);if(!answer)return done({ok:false,error:'Escribe una respuesta antes de bloquearla.'});submission={answer};
    }else{
      const choice=['a','b'].includes(d.choice)?d.choice:'';if(!choice)return done({ok:false,error:'Elige una opción.'});submission={choice};
      if(round.mode==='guess'){const prediction=['a','b'].includes(d.prediction)?d.prediction:'';if(!prediction)return done({ok:false,error:'Elige también qué crees que responderá tu Match.'});submission.prediction=prediction;}
    }
    round.submissions[socket.id]=submission;
    const submitted=Object.keys(round.submissions).length,total=room.players.size;
    for(const sid of room.players){const sock=roomSocket(room,sid);if(sock)sock.emit('vr_sync_status',{id:round.id,submitted,total,youSubmitted:Boolean(round.submissions[sid])});}
    done({ok:true,waiting:submitted<total});
    if(submitted<total)return;
    clearRoomSyncTimer(room);
    const initiator=roomSocket(room,round.initiatorSocketId);if(!initiator){room.syncRound=null;return;}
    const next=roomOpponentById(room,initiator.id);
    const players=[...room.players].map(sid=>{const sock=roomSocket(room,sid);return {sid,name:sock?.nombre||'Jugador',...(round.submissions[sid]||{})};});
    const matched=round.mode==='choice'&&players.length===2&&Boolean(players[0].choice&&players[0].choice===players[1].choice);
    const guessHits=round.mode==='guess'&&players.length===2?Number(players[0].prediction===players[1].choice)+Number(players[1].prediction===players[0].choice):0;
    if(matched)room.game.coincidences=Number(room.game.coincidences||0)+1;
    if(guessHits)room.game.guessHits=Number(room.game.guessHits||0)+guessHits;
    if(round.personalized)room.game.personalizedSync=Number(room.game.personalizedSync||0)+1;
    gameHistoryPersist(room);
    for(const sid of room.players){
      const sock=roomSocket(room,sid);if(!sock)continue;
      const you=players.find(x=>x.sid===sid)||{};const other=players.find(x=>x.sid!==sid)||{};
      const optionText=key=>round.options?.[key]||'';
      sock.emit('vr_sync_reveal',{
        id:round.id,mode:round.mode,prompt:round.prompt,options:round.options,personalized:round.personalized,sharedInterest:round.sharedInterest,initiatorSocketId:initiator.id,nextTurn:next?.id===sid,
        you:{name:you.name,choice:you.choice||'',choiceText:optionText(you.choice),prediction:you.prediction||'',predictionText:optionText(you.prediction),answer:you.answer||'',guessCorrect:round.mode==='guess'?you.prediction===other.choice:null},
        opponent:{name:other.name,choice:other.choice||'',choiceText:optionText(other.choice),prediction:other.prediction||'',predictionText:optionText(other.prediction),answer:other.answer||'',guessCorrect:round.mode==='guess'?other.prediction===you.choice:null},
        matched:round.mode==='choice'?Boolean(you.choice&&you.choice===other.choice):null,roundGuessHits:guessHits
      });
    }
    room.syncRound=null;
    const result=completeRoomTurn(room,initiator,{syncCompleted:true});
    if(!result.completed&&result.next)notifyOpponentTurn(initiator,'carta sincronizada');
  });
  socket.on('vr_game_decision',(d={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{};const room=roomForSocket(socket,d.sala);
    if(!room?.game?.completed)return done({ok:false,error:'La partida todavía no está en el cierre.'});
    const decision=d.decision==='finish'?'finish':'continue';room.game.decisions[socket.id]=decision;
    if(decision==='finish'){
      done({ok:true,finished:true});closeRoomForAll(socket.room,'vr_game_finished',{reason:'finish'});return;
    }
    const ids=[...room.players];const allContinue=ids.length===2&&ids.every(id=>room.game.decisions[id]==='continue');
    if(!allContinue){done({ok:true,waiting:true});socket.emit('vr_game_decision_wait',{decision:'continue'});return;}
    room.game.completed=false;room.game.extended=true;room.game.decisions={};room.turnSocketId=room.game.resumeTurnSocketId||room.creatorId||ids[0]||null;
    gameHistoryPersist(room);
    for(const sid of ids){const sock=roomSocket(room,sid);if(sock)sock.emit('vr_game_continued',{yourTurn:room.turnSocketId===sid});}
    emitGameProgress(room);done({ok:true,continued:true});
  });
  socket.on('escribiendo',sala=>{if(socket.room&&socket.room===sala)socket.to(sala).emit('mostrar_escribiendo');});
  socket.on('parar_escribir',sala=>{if(socket.room&&socket.room===sala)socket.to(sala).emit('ocultar_escribiendo');});
  socket.on('enviar_reaccion',(d={})=>{
    const room=roomForSocket(socket,d.sala);if(!room)return;
    const allowed=new Set(['🔥','😱','😂','❤️']);const emoji=allowed.has(d.emoji)?d.emoji:'👍';
    room.game.reactions=Number(room.game.reactions||0)+1;gameHistoryPersist(room);socket.to(d.sala).emit('recibir_reaccion',emoji);emitGameProgress(room);
  });
  socket.on('tiempo_agotado',(d={})=>{
    const room=roomForSocket(socket,d.sala);if(!room||room.game?.completed||room.syncRound||room.turnSocketId!==socket.id)return;
    socket.to(d.sala).emit('tiempo_agotado_remoto');const result=completeRoomTurn(room,socket,{syncCompleted:false,timeout:true});if(!result.completed&&result.next)notifyOpponentTurn(socket,'tiempo_agotado');
  });
  socket.on('abandonar_partida',salaID=>{if(socket.room&&socket.room===salaID)leaveRoom(socket,true,'user_left');});

  socket.on('disconnect',()=>{
    removeFromLobby(socket.id);
    const preserved=scheduleRoomReconnect(socket);
    if(!preserved)leaveRoom(socket,true,'disconnect');
    const set=onlineUsers.get(userId);if(set){set.delete(socket.id);if(!set.size){onlineUsers.delete(userId);clearGameInvitesFor(userId);}}
    db.prepare('UPDATE users SET last_seen_at=? WHERE id=?').run(now(),userId);setTimeout(()=>broadcastDiscovery(),20);
  });
});

app.use((err,req,res,next)=>{
  recordServerError('express.middleware',err,{method:req.method,path:req.path,requestId:req.requestId,userId:req.user?.id||null});
  if(res.headersSent)return next(err);
  res.status(500).json({ok:false,error:'Se ha producido un error interno.',requestId:req.requestId||''});
});

function startServer(port=PORT,host='0.0.0.0'){
  return server.listen(port,host,()=>{const ready=productionReadiness();console.log(`V/R Match v${APP_VERSION} escuchando en puerto ${server.address()?.port||port}`);console.log(`Base de datos: ${DB_PATH}`);console.log(`Email SMTP: ${SMTP_CONFIGURED?'configurado':'no configurado'} | email de match: ${MATCH_EMAIL_ENABLED?'activo':'inactivo'} | verificación obligatoria: ${REQUIRE_EMAIL_VERIFICATION}`);console.log(`Admins configurados: ${ADMIN_EMAILS.size} | lanzamiento por ciudades: ${CITY_LAUNCH_ENABLED?'activo':'inactivo'}`);
    console.log(`Resiliencia: reconexión de partidas ${Math.round(GAME_RECONNECT_GRACE_MS/1000)}s + mantenimiento + backup verificable`);
    console.log(`Activación de ciudades: tokens hash-only · ${LAUNCH_ACTIVATION_DAYS} días · reenvío protegido`);console.log(`Socket origin: ${(allowedOrigins.length||appBaseOrigin)?'restringido':'ABIERTO (solo desarrollo)'}`);console.log('V/R+: funciones actuales disponibles para todos · monetización pública desactivada');console.log(`Web Push: ${PUSH_CONFIGURED?'configurado':'opcional / no configurado'} | inteligente ${SMART_PUSH_ENABLED?'activo':'inactivo'} | cap ${PUSH_DAILY_CAP}/día`);console.log(`Preproducción: ${ready.productionReady?'lista':'pendiente'} | legal ${LEGAL_VERSION}`);console.log('Observabilidad: métricas + request-id + errores cliente/servidor + diagnóstico técnico');console.log('Privacidad: sesiones + bloqueados + exportación + selfie de verificación privada');});
}
if(require.main===module)startServer();
module.exports={app,server,io,db,startServer,APP_VERSION,productionReadiness,quickCheckDatabase,systemMaintenanceStatus,systemDiagnostics,runBackupSelfTest,runSmtpVerify,recordServerError,activationState,userInQuietHours,processSmartPushes,processDeferredPushes,processCityInviteEmailQueue,reactivateExpiredSuspensions};
