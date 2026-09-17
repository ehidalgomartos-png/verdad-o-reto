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
const allowedOrigins = String(process.env.VR_ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
const io = new Server(server, {
  maxHttpBufferSize: 12e6,
  cors: {
    origin(origin, cb) {
      if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error('ORIGIN_NOT_ALLOWED'));
    },
    credentials: true
  }
});

const APP_VERSION = '18.6.0';
const LEGAL_VERSION = '2026-09-17';
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
// En local guarda dentro del proyecto. En Render, define VR_STORAGE_DIR=/var/data
// y monta un Persistent Disk en /var/data para conservar SQLite y las fotos.
const STORAGE_DIR = process.env.VR_STORAGE_DIR || ROOT;
const DATA_DIR = path.join(STORAGE_DIR, 'data');
const UPLOAD_DIR = path.join(STORAGE_DIR, 'uploads');
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
const APP_BASE_URL = String(process.env.VR_APP_BASE_URL || '').replace(/\/$/, '');
const LAUNCH_MODE = String(process.env.VR_LAUNCH_MODE || 'development').toLowerCase() === 'production' ? 'production' : 'development';
const CITY_LAUNCH_ENABLED = String(process.env.VR_CITY_LAUNCH_ENABLED || 'false').toLowerCase() === 'true';
const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || '').trim();
const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
const STRIPE_PRICE_PLUS_MONTHLY = String(process.env.STRIPE_PRICE_PLUS_MONTHLY || '').trim();
const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const STRIPE_PREPARED = Boolean(STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET && STRIPE_PRICE_PLUS_MONTHLY);
const STRIPE_MODE = STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'live' : (STRIPE_SECRET_KEY.startsWith('sk_test_') ? 'test' : (STRIPE_SECRET_KEY ? 'configured' : 'off'));
// Los secretos de pago viven en Environment. El panel admin solo cambia el modo comercial persistido en SQLite.
// Las funciones V/R+ actuales forman parte de la experiencia disponible para todos.
const SMTP_CONFIGURED = Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM);
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
ensureColumn('profiles', 'discoverable', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('profiles', 'show_online', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('profiles', 'allow_game_invites', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('profiles', 'radius_km', 'INTEGER NOT NULL DEFAULT 50');
ensureColumn('profiles', 'location_lat', 'REAL');
ensureColumn('profiles', 'location_lng', 'REAL');
ensureColumn('profiles', 'location_updated_at', 'INTEGER');
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
  push_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
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

db.exec(`
CREATE TABLE IF NOT EXISTS launch_cities (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target_users INTEGER NOT NULL DEFAULT 500,
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
for (const [slug,name,target] of launchSeedCities) {
  db.prepare(`INSERT OR IGNORE INTO launch_cities(slug,name,target_users,status,created_at,updated_at)
    VALUES(?,?,?,'WAITING',?,?)`).run(slug,name,target,now(),now());
}

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
const GAME_INVITE_TTL_MS = 5 * 60 * 1000;
const onlineUsers = new Map(); // userId -> Set(socket.id)

const GAME_TARGET_TURNS = 8;
const SYNC_ROUND_TTL_MS = 95 * 1000;
const VALID_SYNC_MODES = new Set(['choice','guess','secret']);
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
    oldReadNotifications:db.prepare('SELECT COUNT(*) n FROM notifications WHERE read_at IS NOT NULL AND created_at<?').get(ts-90*86400000).n,
    backupIncludes:['SQLite','uploads','manifest'],
    storagePersistent:path.resolve(STORAGE_DIR)!==path.resolve(ROOT)
  };
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
function launchHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function makeLaunchReferralCode(alias, citySlug) {
  const a = String(alias || 'VR').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5) || 'VR';
  const c = String(citySlug || 'CITY').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3) || 'VR';
  return `VR-${a}-${c}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}
function launchCityStats(slug) {
  const row = db.prepare(`
    SELECT c.slug,c.name,c.target_users goal,c.status,c.activated_at activatedAt,
      COUNT(w.id) current
    FROM launch_cities c
    LEFT JOIN launch_waitlist_users w ON w.city_slug=c.slug AND w.status!='BLOCKED'
    WHERE c.slug=?
    GROUP BY c.slug
  `).get(slug);
  if (!row) return null;
  const current = Number(row.current || 0), goal = Number(row.goal || 0);
  return {...row,current,goal,percent:goal?Math.min(100,Math.round(current*100/goal)):0};
}
function launchCitiesStats() {
  return db.prepare(`
    SELECT c.slug,c.name,c.target_users goal,c.status,c.activated_at activatedAt,
      COUNT(w.id) current
    FROM launch_cities c
    LEFT JOIN launch_waitlist_users w ON w.city_slug=c.slug AND w.status!='BLOCKED'
    GROUP BY c.slug
    ORDER BY current DESC,c.name ASC
  `).all().map(row => {
    const current=Number(row.current||0),goal=Number(row.goal||0);
    return {...row,current,goal,percent:goal?Math.min(100,Math.round(current*100/goal)):0};
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
function issueLaunchActivation(waitlistUserId, days = 7) {
  const raw = crypto.randomBytes(32).toString('base64url');
  const ts = now(), expiresAt = ts + Math.max(1,Math.min(30,Number(days)||7))*86400000;
  db.prepare('DELETE FROM launch_activation_tokens WHERE waitlist_user_id=? AND used_at IS NULL').run(waitlistUserId);
  db.prepare('INSERT INTO launch_activation_tokens(token_hash,waitlist_user_id,created_at,expires_at,used_at) VALUES(?,?,?,?,NULL)')
    .run(hashToken(raw),waitlistUserId,ts,expiresAt);
  return {raw,expiresAt};
}
function queueLaunchEmail(waitlistUserId,email,subject,template,payload={}) {
  db.prepare(`INSERT INTO launch_mail_queue(id,waitlist_user_id,email,subject,template,payload_json,status,attempts,last_error,created_at)
    VALUES(?,?,?,?,?,?,'PENDING',0,'',?)`)
    .run(safeId('lmail'),waitlistUserId||null,cleanEmail(email),cleanShortText(subject,180),String(template||''),JSON.stringify(payload||{}),now());
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
      <p style="color:#74717e;font-size:12px">El enlace caduca en 7 días.</p>`);
  }
  return wrap(`<p>${launchHtml(payload.message || '')}</p>`);
}
let launchMailWorkerRunning = false;
async function processLaunchMailQueue(limit = 20) {
  if (launchMailWorkerRunning) return {sent:0,errors:0,busy:true};
  if (!SMTP_CONFIGURED) return {sent:0,errors:0,skipped:true,reason:'SMTP no configurado'};
  launchMailWorkerRunning = true;
  let sent=0,errors=0;
  try {
    const rows = db.prepare(`SELECT * FROM launch_mail_queue
      WHERE status IN ('PENDING','ERROR') AND attempts<5
      ORDER BY created_at ASC LIMIT ?`).all(Math.max(1,Math.min(100,Number(limit)||20)));
    for (const row of rows) {
      try {
        const payload=safeJsonObject(row.payload_json);
        const text = row.template==='CITY_UNLOCKED'
          ? `${payload.city} está abierta. Activa tu acceso: ${payload.activationUrl}`
          : `Ya estás en la lista de V/R Match. Comparte tu invitación: ${payload.referralUrl || ''}`;
        const result=await sendEmail({to:row.email,subject:row.subject,text,html:renderLaunchEmail(row.template,payload)});
        if (!result.sent) break;
        db.prepare("UPDATE launch_mail_queue SET status='SENT',attempts=attempts+1,last_error='',sent_at=? WHERE id=?").run(now(),row.id);
        sent++;
      } catch (e) {
        db.prepare("UPDATE launch_mail_queue SET status='ERROR',attempts=attempts+1,last_error=? WHERE id=?")
          .run(cleanShortText(e.message,500),row.id);
        errors++;
      }
    }
  } finally { launchMailWorkerRunning=false; }
  return {sent,errors};
}
setTimeout(()=>processLaunchMailQueue(20).catch(e=>console.warn('Launch mail:',e.message)),5000).unref();
setInterval(()=>processLaunchMailQueue(20).catch(e=>console.warn('Launch mail:',e.message)),30000).unref();

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

const NOTIFICATION_TYPES = new Set(['match','message','game_invite','game_turn']);
function notificationPreferences(userId) {
  const row = db.prepare('SELECT * FROM notification_preferences WHERE user_id=?').get(userId);
  return {
    newMatch: row ? row.new_match !== 0 : true,
    newMessage: row ? row.new_message !== 0 : true,
    gameInvite: row ? row.game_invite !== 0 : true,
    gameTurn: row ? row.game_turn !== 0 : true,
    pushEnabled: row ? row.push_enabled !== 0 : false
  };
}
function notificationAllowed(userId, type) {
  const p = notificationPreferences(userId);
  if (type === 'match') return p.newMatch;
  if (type === 'message') return p.newMessage;
  if (type === 'game_invite') return p.gameInvite;
  if (type === 'game_turn') return p.gameTurn;
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
async function sendPushForUser(userId, notification) {
  if (!PUSH_CONFIGURED || !notificationPreferences(userId).pushEnabled) return;
  const subscriptions = db.prepare('SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=?').all(userId);
  if (!subscriptions.length) return;
  const data = notification?.data || {};
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    tag: `vr-${notification.type}-${notification.id}`,
    notificationId: notification.id,
    url: `/?notification=${encodeURIComponent(notification.id)}`,
    data
  });
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification({ endpoint:sub.endpoint, keys:{ p256dh:sub.p256dh, auth:sub.auth } }, payload, { TTL: 180 });
    } catch (e) {
      const code = Number(e?.statusCode || 0);
      if (code === 404 || code === 410) db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(sub.id);
      else console.warn('Web Push falló:', e.message);
    }
  }
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
      allowGameInvites: row.allow_game_invites !== 0
    },
    online: row.show_online !== 0 ? isOnline(row.user_id) : false
  };
}
function getProfile(userId) {
  return profileFromRow(db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId));
}
function publicProfile(profile) {
  if (!profile) return null;
  // Minimiza datos compartidos entre usuarios: preferencias, privacidad y
  // metadatos internos de ubicación permanecen solo en el servidor/cuenta propia.
  const { preferences, privacy, location, ...safe } = profile;
  return safe;
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
      const profile = publicProfile(fullProfile);
      profile.verified = Boolean(row.email_verified);
      profile.sharedInterests = shared;
      profile.boosted = boosted;
      if (distance !== null) profile.distanceKm = publicDistance(distance);
      return { row, fullProfile, profile, distance, shared, boosted };
    })
    .filter(item => !excluded.has(item.profile.id) && profileAccepts(me,item.fullProfile) && profileAccepts(item.fullProfile,me))
    .filter(item => !useDistance || (item.distance !== null && item.distance <= radiusKm))
    .filter(item => !plusSettings.verifiedOnly || item.profile.verified)
    .filter(item => item.shared >= plusSettings.minSharedInterests)
    .sort((a,b) => {
      if (a.boosted !== b.boosted) return a.boosted ? -1 : 1;
      if (plusActive && plusSettings.sortMode === 'interests' && a.shared !== b.shared) return b.shared - a.shared;
      if (plusActive && plusSettings.sortMode === 'recent') return Number(b.row.last_seen_at || b.row.updated_at || 0) - Number(a.row.last_seen_at || a.row.updated_at || 0);
      if (plusActive && plusSettings.sortMode === 'distance') {
        const ad = a.distance ?? Number.POSITIVE_INFINITY, bd = b.distance ?? Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
      }
      if (plusActive && plusSettings.sortMode === 'smart' && a.shared !== b.shared) return b.shared - a.shared;
      if (useDistance) {
        const ad = a.distance ?? Number.POSITIVE_INFINITY, bd = b.distance ?? Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
      }
      return Number(b.row.updated_at || 0) - Number(a.row.updated_at || 0);
    })
    .map(item => item.profile);
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
function suspendUser(userId) {
  db.prepare("UPDATE users SET status='suspended' WHERE id=?").run(userId);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
  disconnectUserSockets(userId,'account_suspended',{});
}
function reactivateUser(userId) {
  db.prepare("UPDATE users SET status='active' WHERE id=?").run(userId);
}
function clearProfilePhotos(userId) {
  deleteUserUploads(userId);
  db.prepare("UPDATE profiles SET avatar='',photos_json='[]',updated_at=? WHERE user_id=?").run(now(),userId);
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
    if (!confirmAdult) return res.status(400).json({ok:false,error:'Debes confirmar que tienes 18 años o más.'});
    if (!acceptTerms) return res.status(400).json({ok:false,error:'Debes aceptar las condiciones de uso y la política de privacidad.'});
    if (CITY_LAUNCH_ENABLED) return res.status(403).json({ok:false,error:'V/R Match se está abriendo por ciudades. Únete a la lista de espera para recibir acceso cuando tu ciudad se active.',waitlist:true,waitlistUrl:'/espera'});
    if (!validEmail(email)) return res.status(400).json({ ok:false, error:'Introduce un correo válido.' });
    if (Buffer.byteLength(password,'utf8') < 8 || Buffer.byteLength(password,'utf8') > 72) return res.status(400).json({ ok:false, error:'La contraseña debe tener entre 8 y 72 caracteres aprox.' });
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(409).json({ ok:false, error:'Ya existe una cuenta con ese correo.' });
    const id = safeId('usr');
    const passwordHash = hashPassword(password);
    const ts = now();
    db.prepare('INSERT INTO users(id,email,password_hash,created_at,last_seen_at,email_verified,onboarding_completed) VALUES(?,?,?,?,?,0,0)').run(id,email,passwordHash,ts,ts);
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
    const row = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!row || row.status !== 'active' || !verifyPassword(password,row.password_hash)) return res.status(401).json({ ok:false, error:'Correo o contraseña incorrectos.' });
    if (REQUIRE_EMAIL_VERIFICATION && !row.email_verified) return res.status(403).json({ok:false,error:'Primero verifica tu correo.',verificationRequired:true});
    db.prepare('UPDATE users SET last_seen_at=? WHERE id=?').run(now(),row.id);
    const token = createSession(row.id);
    res.json({ ok:true, token, user:{id:row.id,email:row.email,emailVerified:Boolean(row.email_verified),admin:isAdmin(row)}, profile:getProfile(row.id), plus:getPlusState(row.id), onboardingCompleted:Boolean(row.onboarding_completed) });
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
    res.json({ok:true,token:session,user:{id:user.id,email:user.email,emailVerified:Boolean(user.email_verified),admin:isAdmin(user)},profile:getProfile(user.id),plus:getPlusState(user.id),onboardingCompleted:Boolean(onboarding?.onboarding_completed)});
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
  res.json({ ok:true, user:{id:req.user.id,email:req.user.email,emailVerified:Boolean(full?.email_verified),admin:isAdmin(req.user)}, profile:getProfile(req.user.id), matches:matchesFor(req.user.id), plus:getPlusState(req.user.id), notificationState:notificationState(req.user.id), onboardingCompleted:Boolean(full?.onboarding_completed) });
});

app.post('/api/account/onboarding-complete', requireAuth, (req,res) => {
  db.prepare('UPDATE users SET onboarding_completed=1 WHERE id=?').run(req.user.id);
  res.json({ok:true,onboardingCompleted:true});
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
    pushEnabled:bool01(req.body?.pushEnabled,current.pushEnabled)
  };
  db.prepare(`INSERT INTO notification_preferences(user_id,new_match,new_message,game_invite,game_turn,push_enabled,updated_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET new_match=excluded.new_match,new_message=excluded.new_message,
    game_invite=excluded.game_invite,game_turn=excluded.game_turn,push_enabled=excluded.push_enabled,updated_at=excluded.updated_at`)
    .run(req.user.id,next.newMatch,next.newMessage,next.gameInvite,next.gameTurn,next.pushEnabled,ts);
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
  db.prepare(`INSERT INTO notification_preferences(user_id,new_match,new_message,game_invite,game_turn,push_enabled,updated_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET push_enabled=1,updated_at=excluded.updated_at`)
    .run(req.user.id,p.newMatch?1:0,p.newMessage?1:0,p.gameInvite?1:0,p.gameTurn?1:0,1,ts);
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

app.put('/api/profile', requireAuth, (req,res) => {
  try {
    const userId = req.user.id;
    const name = cleanName(req.body?.nombre);
    const age = Number(req.body?.edad);
    if (name.length < 2) return res.status(400).json({ok:false,error:'Escribe un nombre válido.'});
    if (!Number.isInteger(age) || age < 18 || age > 99) return res.status(400).json({ok:false,error:'V/R Match es solo para mayores de 18 años.'});
    const existing = getProfile(userId);
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
    const values = {
      name, age, gender:cleanGender(req.body?.gender), city:cleanShortText(req.body?.ciudad,40), bio:cleanShortText(req.body?.bio,180),
      interests:cleanInterests(req.body?.intereses), avatar, photos,
      ageMin, ageMax, lookingFor:cleanLooking(req.body?.preferences?.lookingFor), cityPref:cleanShortText(req.body?.preferences?.city,40), interestPref:cleanShortText(req.body?.preferences?.interest,30), radiusKm,
      locationLat, locationLng, locationUpdatedAt,
      discoverable:bool01(req.body?.privacy?.discoverable, existing?.privacy?.discoverable ?? true), showOnline:bool01(req.body?.privacy?.showOnline, existing?.privacy?.showOnline ?? true), allowGameInvites:bool01(req.body?.privacy?.allowGameInvites, existing?.privacy?.allowGameInvites ?? true)
    };
    db.prepare(`INSERT INTO profiles(user_id,name,age,gender,city,bio,interests_json,avatar,photos_json,age_min,age_max,looking_for,city_pref,interest_pref,radius_km,location_lat,location_lng,location_updated_at,discoverable,show_online,allow_game_invites,updated_at)
      VALUES(@userId,@name,@age,@gender,@city,@bio,@interests,@avatar,@photos,@ageMin,@ageMax,@lookingFor,@cityPref,@interestPref,@radiusKm,@locationLat,@locationLng,@locationUpdatedAt,@discoverable,@showOnline,@allowGameInvites,@updatedAt)
      ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,age=excluded.age,gender=excluded.gender,city=excluded.city,bio=excluded.bio,interests_json=excluded.interests_json,avatar=excluded.avatar,photos_json=excluded.photos_json,age_min=excluded.age_min,age_max=excluded.age_max,looking_for=excluded.looking_for,city_pref=excluded.city_pref,interest_pref=excluded.interest_pref,radius_km=excluded.radius_km,location_lat=excluded.location_lat,location_lng=excluded.location_lng,location_updated_at=excluded.location_updated_at,discoverable=excluded.discoverable,show_online=excluded.show_online,allow_game_invites=excluded.allow_game_invites,updated_at=excluded.updated_at`)
      .run({userId,...values,interests:JSON.stringify(values.interests),photos:JSON.stringify(values.photos),updatedAt:now()});
    cleanupUnusedUploads(userId,[...photos,avatar].filter(x=>String(x).startsWith('/uploads/')));
    const profile = getProfile(userId);
    broadcastDiscovery();
    res.json({ok:true,profile});
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
  db.prepare('UPDATE profiles SET discoverable=?,show_online=?,allow_game_invites=?,updated_at=? WHERE user_id=?').run(bool01(req.body?.discoverable,p.privacy.discoverable),bool01(req.body?.showOnline,p.privacy.showOnline),bool01(req.body?.allowGameInvites,p.privacy.allowGameInvites),now(),req.user.id);
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
    const notifications=db.prepare('SELECT id,source_user,type,title,body,data_json,created_at,read_at FROM notifications WHERE user_id=? ORDER BY created_at ASC').all(userId).map(n=>({...n,data:safeJsonObject(n.data_json),data_json:undefined}));
    const gameSessions=db.prepare(`SELECT id,match_id,user1,user2,deck,started_at,core_completed_at,ended_at,status,finish_reason,total_turns,sync_rounds,coincidences,guess_hits,reactions,personalized_sync,extended,duration_seconds
      FROM game_sessions WHERE user1=? OR user2=? ORDER BY started_at ASC`).all(userId,userId).map(g=>({...g,partner_id:g.user1===userId?g.user2:g.user1,user1:undefined,user2:undefined}));
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
      likesSent:likes,passesSent:passes,blockedUsers:blocks,reportsMade:reports,feedback,notifications,gameSessions,matches
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
  disconnectUserSockets(req.user.id,'account_deleted',{}); deleteUserUploads(req.user.id); db.prepare('DELETE FROM users WHERE id=?').run(req.user.id); onlineUsers.delete(req.user.id); broadcastDiscovery();
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
  if (!db.prepare('SELECT 1 FROM launch_waitlist_users WHERE referral_code=?').get(code)) return res.status(404).json({ok:false,error:'Código no encontrado.'});
  db.prepare('INSERT INTO launch_referral_events(id,referral_code,event_type,created_at) VALUES(?,?,?,?)')
    .run(safeId('lref'),code,'VISIT',now());
  res.json({ok:true});
});

app.post('/api/launch/waitlist', rateLimit({limit:12,windowMs:60*60*1000,key:req=>req.ip}), async (req,res) => {
  try {
    const alias=cleanName(req.body?.alias);
    const age=Number(req.body?.age);
    const email=cleanEmail(req.body?.email);
    const citySlug=normalizeLaunchCity(req.body?.city);
    const publicProfile=req.body?.publicProfile===true?1:0;
    const launchConsent=req.body?.launchConsent===true;
    const referredBy=cleanShortText(req.body?.referredBy,80)||null;
    if (alias.length<2) return res.status(400).json({ok:false,error:'Escribe un nombre o alias válido.'});
    if (!Number.isInteger(age)||age<18||age>99) return res.status(400).json({ok:false,error:'V/R Match es solo para mayores de 18 años.'});
    if (!validEmail(email)) return res.status(400).json({ok:false,error:'Introduce un correo válido.'});
    if (!launchConsent) return res.status(400).json({ok:false,error:'Debes aceptar recibir los mensajes necesarios de la lista de espera y el lanzamiento.'});
    const city=db.prepare('SELECT * FROM launch_cities WHERE slug=?').get(citySlug);
    if (!city) return res.status(400).json({ok:false,error:'Ciudad no disponible.'});

    const existingWait=db.prepare('SELECT * FROM launch_waitlist_users WHERE email=?').get(email);
    if (existingWait) {
      const stats=launchCityStats(existingWait.city_slug);
      return res.json({ok:true,alreadyRegistered:true,referralCode:existingWait.referral_code,
        referralUrl:`${baseUrl(req)}/espera?ref=${encodeURIComponent(existingWait.referral_code)}`,city:stats,status:existingWait.status});
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

    if (referredBy && db.prepare('SELECT 1 FROM launch_waitlist_users WHERE referral_code=?').get(referredBy)) {
      db.prepare('INSERT INTO launch_referral_events(id,referral_code,event_type,created_at) VALUES(?,?,?,?)')
        .run(safeId('lref'),referredBy,'SIGNUP',ts);
    }

    const referralUrl=`${baseUrl(req)}/espera?ref=${encodeURIComponent(referralCode)}`;
    let immediateActivation=false;
    if (city.status==='ACTIVE') {
      const activation=issueLaunchActivation(id,7);
      const activationUrl=`${baseUrl(req)}/activar?token=${encodeURIComponent(activation.raw)}`;
      db.prepare("UPDATE launch_waitlist_users SET status='CITY_READY',activation_sent_at=?,updated_at=? WHERE id=?").run(ts,ts,id);
      queueLaunchEmail(id,email,`${city.name} está abierta 🔓 Entra en V/R Match`,'CITY_UNLOCKED',{alias,city:city.name,activationUrl});
      immediateActivation=true;
    } else {
      queueLaunchEmail(id,email,`Ya estás esperando V/R Match en ${city.name} 🔥`,'WAITLIST_WELCOME',{alias,city:city.name,referralUrl});
      refreshLaunchCityStatus(citySlug);
    }
    processLaunchMailQueue(5).catch(e=>console.warn('Launch mail:',e.message));
    res.status(201).json({ok:true,referralCode,referralUrl,city:launchCityStats(citySlug),immediateActivation});
  } catch(e) {
    console.error('Waitlist:',e);
    res.status(500).json({ok:false,error:'No se pudo completar el registro en la lista.'});
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
  if (Number(row.expiresAt)<=now()) return res.status(410).json({ok:false,error:'Este enlace ha caducado. Solicita uno nuevo.'});
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
    res.json({ok:true,token,created,user:{id:fresh.id,email:fresh.email,emailVerified:Boolean(fresh.email_verified),admin:isAdmin(fresh)},
      profile:getProfile(fresh.id),plus:getPlusState(fresh.id),onboardingCompleted:Boolean(fresh.onboarding_completed),nextUrl:'/?launch=activated'});
  } catch(e) {
    console.error('Launch activation:',e);
    res.status(500).json({ok:false,error:'No se pudo activar el acceso.'});
  }
});


// ---- ADMIN · LANZAMIENTO POR CIUDADES ----
app.get('/api/admin/launch/summary', requireAuth, requireAdmin, (req,res) => {
  const s=db.prepare(`SELECT COUNT(*) total,
    SUM(CASE WHEN date(created_at/1000,'unixepoch')=date('now') THEN 1 ELSE 0 END) today,
    SUM(CASE WHEN referred_by IS NOT NULL AND referred_by!='' THEN 1 ELSE 0 END) referred,
    SUM(CASE WHEN status='ACTIVATED' THEN 1 ELSE 0 END) activated
    FROM launch_waitlist_users WHERE status!='BLOCKED'`).get();
  const m=db.prepare(`SELECT
    SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) pending,
    SUM(CASE WHEN status='ERROR' THEN 1 ELSE 0 END) errors
    FROM launch_mail_queue`).get();
  res.json({ok:true,total:Number(s.total||0),today:Number(s.today||0),referred:Number(s.referred||0),activated:Number(s.activated||0),
    pendingMail:Number(m.pending||0),mailErrors:Number(m.errors||0),cityLaunchEnabled:CITY_LAUNCH_ENABLED});
});

app.get('/api/admin/launch/cities', requireAuth, requireAdmin, (req,res) => res.json({ok:true,cities:launchCitiesStats()}));

app.get('/api/admin/launch/cities/:slug/users', requireAuth, requireAdmin, (req,res) => {
  const slug=normalizeLaunchCity(req.params.slug),q=cleanShortText(req.query.q,80),limit=Math.max(1,Math.min(500,Number(req.query.limit)||200));
  const like=`%${q}%`;
  const rows=db.prepare(`
    SELECT w.id,w.alias,w.age,w.email,w.city_slug city,w.public_profile publicProfile,w.referral_code referralCode,w.referred_by referredBy,
      w.status,w.app_user_id appUserId,w.activation_sent_at activationSentAt,w.activated_at activatedAt,w.created_at createdAt,
      (SELECT COUNT(*) FROM launch_waitlist_users x WHERE x.referred_by=w.referral_code) successfulInvites,
      (SELECT COUNT(*) FROM launch_referral_events e WHERE e.referral_code=w.referral_code AND e.event_type='VISIT') referralVisits
    FROM launch_waitlist_users w
    WHERE w.city_slug=? AND (?='' OR w.alias LIKE ? OR w.email LIKE ? OR w.referral_code LIKE ?)
    ORDER BY w.created_at DESC LIMIT ?
  `).all(slug,q,like,like,like,limit);
  res.json({ok:true,users:rows});
});

app.patch('/api/admin/launch/cities/:slug/goal', requireAuth, requireAdmin, (req,res) => {
  const slug=normalizeLaunchCity(req.params.slug),goal=Number(req.body?.goal);
  if (!Number.isInteger(goal)||goal<1||goal>1000000) return res.status(400).json({ok:false,error:'Objetivo no válido.'});
  const result=db.prepare('UPDATE launch_cities SET target_users=?,updated_at=? WHERE slug=?').run(goal,now(),slug);
  if (!result.changes) return res.status(404).json({ok:false,error:'Ciudad no encontrada.'});
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
        const activation=issueLaunchActivation(w.id,7);
        const activationUrl=`${baseUrl(req)}/activar?token=${encodeURIComponent(activation.raw)}`;
        queueLaunchEmail(w.id,w.email,`${city.name} está abierta 🔓 Entra en V/R Match`,'CITY_UNLOCKED',
          {alias:w.alias,city:city.name,activationUrl});
        db.prepare("UPDATE launch_waitlist_users SET status='CITY_READY',activation_sent_at=?,updated_at=? WHERE id=?").run(ts,ts,w.id);
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

app.post('/api/admin/launch/mail/send', requireAuth, requireAdmin, rateLimit({limit:20,windowMs:60*60*1000,key:req=>req.user.id}), async (req,res) => {
  try { res.json({ok:true,...await processLaunchMailQueue(Math.max(1,Math.min(100,Number(req.body?.limit)||50)))}); }
  catch(e){res.status(500).json({ok:false,error:'No se pudieron procesar los correos.'});}
});

app.get('/api/admin/launch/cities/:slug/export.csv', requireAuth, requireAdmin, (req,res) => {
  const slug=normalizeLaunchCity(req.params.slug);
  const rows=db.prepare(`SELECT id,alias,age,email,city_slug,public_profile,referral_code,referred_by,status,app_user_id,activation_sent_at,activated_at,created_at
    FROM launch_waitlist_users WHERE city_slug=? ORDER BY created_at ASC`).all(slug);
  const headers=['id','alias','age','email','city_slug','public_profile','referral_code','referred_by','status','app_user_id','activation_sent_at','activated_at','created_at'];
  const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;
  const csv=[headers.join(','),...rows.map(r=>headers.map(h=>esc(r[h])).join(','))].join('\n');
  res.type('text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',`attachment; filename="vr-match-${slug}-waitlist.csv"`);
  res.send('\ufeff'+csv);
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
  const days = [1,7,30].includes(Number(req.query.days)) ? Number(req.query.days) : 7;
  const until = now();
  const since = until - days*24*60*60*1000;
  const metric = {
    registered: db.prepare('SELECT COUNT(*) n FROM users WHERE created_at>=?').get(since).n,
    activeUsers: db.prepare("SELECT COUNT(*) n FROM users WHERE status='active' AND last_seen_at>=?").get(since).n,
    likes: db.prepare('SELECT COUNT(*) n FROM likes WHERE created_at>=?').get(since).n,
    matches: db.prepare('SELECT COUNT(*) n FROM matches WHERE created_at>=?').get(since).n,
    messages: db.prepare('SELECT COUNT(*) n FROM messages WHERE created_at>=?').get(since).n,
    gamesStarted: db.prepare('SELECT COUNT(*) n FROM game_sessions WHERE started_at>=?').get(since).n,
    gamesCompleted: db.prepare("SELECT COUNT(*) n FROM game_sessions WHERE status='completed' AND ended_at>=?").get(since).n,
    reports: db.prepare('SELECT COUNT(*) n FROM reports WHERE created_at>=?').get(since).n,
    feedback: db.prepare('SELECT COUNT(*) n FROM feedback WHERE created_at>=?').get(since).n,
    clientErrors: db.prepare('SELECT COUNT(*) n FROM client_errors WHERE created_at>=?').get(since).n,
    verifiedTotal: db.prepare('SELECT COUNT(*) n FROM users WHERE email_verified=1').get().n,
    activePlus: db.prepare("SELECT COUNT(*) n FROM plus_memberships WHERE status='active' AND (expires_at IS NULL OR expires_at>?)").get(until).n
  };
  const funnel = {
    registered: metric.registered,
    profile: db.prepare('SELECT COUNT(*) n FROM users u WHERE u.created_at>=? AND EXISTS(SELECT 1 FROM profiles p WHERE p.user_id=u.id)').get(since).n,
    matched: db.prepare('SELECT COUNT(*) n FROM users u WHERE u.created_at>=? AND EXISTS(SELECT 1 FROM matches m WHERE m.user1=u.id OR m.user2=u.id)').get(since).n,
    messaged: db.prepare('SELECT COUNT(*) n FROM users u WHERE u.created_at>=? AND EXISTS(SELECT 1 FROM messages m WHERE m.from_user=u.id)').get(since).n,
    played: db.prepare('SELECT COUNT(*) n FROM users u WHERE u.created_at>=? AND EXISTS(SELECT 1 FROM game_sessions g WHERE g.user1=u.id OR g.user2=u.id)').get(since).n
  };
  function grouped(table,col){
    const rows=db.prepare(`SELECT date(${col}/1000,'unixepoch') day,COUNT(*) n FROM ${table} WHERE ${col}>=? GROUP BY day`).all(since);
    return new Map(rows.map(r=>[r.day,Number(r.n)||0]));
  }
  const registrations=grouped('users','created_at'), matches=grouped('matches','created_at'), messages=grouped('messages','created_at'), games=grouped('game_sessions','started_at');
  const daily=[];
  const first = new Date(since); first.setUTCHours(0,0,0,0);
  const last = new Date(until); last.setUTCHours(0,0,0,0);
  for(let t=first.getTime();t<=last.getTime();t+=24*60*60*1000){
    const day=new Date(t).toISOString().slice(0,10);
    daily.push({day,registered:registrations.get(day)||0,matches:matches.get(day)||0,messages:messages.get(day)||0,games:games.get(day)||0});
  }
  const uploads=folderStatsSafe(UPLOAD_DIR), mem=process.memoryUsage();
  const system={
    uptimeSeconds:Math.round(process.uptime()),
    rssMb:Math.round(mem.rss/1024/1024),
    heapUsedMb:Math.round(mem.heapUsed/1024/1024),
    onlineUsers:onlineUsers.size,
    sockets:Number(io.engine?.clientsCount||0),
    dbBytes:fileSizeSafe(DB_PATH),
    uploadFiles:uploads.files,
    uploadBytes:uploads.bytes
  };
  const recentErrors=db.prepare(`SELECT ce.id,ce.message,ce.source,ce.line,ce.column_no,ce.page,ce.app_version,ce.created_at,u.email,p.name
    FROM client_errors ce LEFT JOIN users u ON u.id=ce.user_id LEFT JOIN profiles p ON p.user_id=ce.user_id
    ORDER BY ce.created_at DESC LIMIT 20`).all();
  res.json({ok:true,days,metric,funnel,daily,system,recentErrors});
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
    ru.email reporter_email, tu.email reported_email, tu.status reported_status,
    rp.name reporter_name, tp.name reported_name
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

app.get('/api/admin/users', requireAuth, requireAdmin, (req,res) => {
  const q = cleanShortText(req.query.q,80).toLowerCase();
  const status = ['active','suspended','all'].includes(String(req.query.status||'all')) ? String(req.query.status||'all') : 'all';
  const where = [], params = [];
  if (status !== 'all') { where.push('u.status=?'); params.push(status); }
  if (q) {
    where.push("(LOWER(u.email) LIKE ? OR LOWER(COALESCE(p.name,'')) LIKE ? OR LOWER(COALESCE(p.city,'')) LIKE ?)");
    const like = `%${q}%`; params.push(like,like,like);
  }
  const sql = `SELECT u.id,u.email,u.status,u.created_at,u.last_seen_at,u.email_verified,
    p.name,p.age,p.city,p.avatar,p.discoverable,
    (SELECT COUNT(*) FROM reports r WHERE r.reported=u.id) reports_received,
    (SELECT COUNT(*) FROM reports r WHERE r.reporter=u.id) reports_sent,
    (SELECT COUNT(*) FROM messages m WHERE m.from_user=u.id) messages_sent,
    (SELECT COUNT(*) FROM matches mm WHERE mm.active=1 AND (mm.user1=u.id OR mm.user2=u.id)) active_matches,
    (SELECT CASE WHEN pm.status='active' AND (pm.expires_at IS NULL OR pm.expires_at>?) THEN 1 ELSE 0 END FROM plus_memberships pm WHERE pm.user_id=u.id) plus_active,
    (SELECT pm.expires_at FROM plus_memberships pm WHERE pm.user_id=u.id) plus_expires_at
    FROM users u LEFT JOIN profiles p ON p.user_id=u.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY u.last_seen_at DESC LIMIT 120`;
  res.json({ok:true,users:db.prepare(sql).all(now(),...params)});
});

app.get('/api/admin/users/:id', requireAuth, requireAdmin, (req,res) => {
  const id = String(req.params.id||'');
  const user = db.prepare(`SELECT u.id,u.email,u.status,u.created_at,u.last_seen_at,u.email_verified,
      p.name,p.age,p.gender,p.city,p.bio,p.interests_json,p.avatar,p.photos_json,p.discoverable,p.show_online,p.allow_game_invites,p.location_updated_at,
      pm.status plus_status,pm.expires_at plus_expires_at
      FROM users u LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN plus_memberships pm ON pm.user_id=u.id WHERE u.id=?`).get(id);
  if (!user) return res.status(404).json({ok:false,error:'Usuario no encontrado.'});
  const summary = {
    reportsReceived: db.prepare('SELECT COUNT(*) n FROM reports WHERE reported=?').get(id).n,
    reportsSent: db.prepare('SELECT COUNT(*) n FROM reports WHERE reporter=?').get(id).n,
    messagesSent: db.prepare('SELECT COUNT(*) n FROM messages WHERE from_user=?').get(id).n,
    activeMatches: db.prepare('SELECT COUNT(*) n FROM matches WHERE active=1 AND (user1=? OR user2=?)').get(id,id).n,
    blocksMade: db.prepare('SELECT COUNT(*) n FROM blocks WHERE blocker=?').get(id).n
  };
  const reports = db.prepare(`SELECT r.id,r.reason,r.details,r.status,r.created_at,r.updated_at,r.moderator_note,
      ru.email reporter_email,rp.name reporter_name
      FROM reports r JOIN users ru ON ru.id=r.reporter LEFT JOIN profiles rp ON rp.user_id=r.reporter
      WHERE r.reported=? ORDER BY r.created_at DESC LIMIT 20`).all(id);
  const actions = db.prepare(`SELECT ma.id,ma.action,ma.note,ma.created_at,au.email admin_email
      FROM moderation_actions ma LEFT JOIN users au ON au.id=ma.admin_user
      WHERE ma.target_user=? ORDER BY ma.created_at DESC LIMIT 30`).all(id);
  const resultUser = {
    ...user,
    interests:safeJsonArray(user.interests_json),
    photos:safeJsonArray(user.photos_json),
    locationEnabled:Boolean(user.location_updated_at)
  };
  delete resultUser.interests_json;
  delete resultUser.photos_json;
  delete resultUser.location_updated_at;
  res.json({ok:true,user:resultUser,summary,reports,actions});
});

app.post('/api/admin/users/:id/action', requireAuth, requireAdmin, (req,res) => {
  const target = String(req.params.id||'');
  const user = db.prepare('SELECT id,email,status FROM users WHERE id=?').get(target);
  if (!user) return res.status(404).json({ok:false,error:'Usuario no encontrado.'});
  const action = String(req.body?.action||'');
  const note = cleanShortText(req.body?.note,500);
  if (target === req.user.id && action === 'suspend') return res.status(400).json({ok:false,error:'No puedes suspender tu propia cuenta administradora.'});
  if (!['suspend','reactivate','hide_profile','show_profile','clear_photos','clear_bio','grant_plus_30d','revoke_plus'].includes(action)) return res.status(400).json({ok:false,error:'Acción no válida.'});
  if (action === 'suspend') suspendUser(target);
  if (action === 'reactivate') reactivateUser(target);
  if (action === 'hide_profile') db.prepare('UPDATE profiles SET discoverable=0,updated_at=? WHERE user_id=?').run(now(),target);
  if (action === 'show_profile') db.prepare('UPDATE profiles SET discoverable=1,updated_at=? WHERE user_id=?').run(now(),target);
  if (action === 'clear_photos') clearProfilePhotos(target);
  if (action === 'clear_bio') db.prepare("UPDATE profiles SET bio='',updated_at=? WHERE user_id=?").run(now(),target);
  if (action === 'grant_plus_30d') grantPlus(target,30,'admin');
  if (action === 'revoke_plus') revokePlus(target);
  logModerationAction(req.user.id,target,action,note,null);
  if (action === 'grant_plus_30d' || action === 'revoke_plus') {
    emitToUser(target,'plus_state',getPlusState(target));
    emitToUser(target,'dating_profiles',discoverFor(target));
  }
  broadcastDiscovery(); emitMatches(target);
  res.json({ok:true,userStatus:db.prepare('SELECT status FROM users WHERE id=?').get(target)?.status||null});
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
  const launchFree = freePremiumDuringLaunch();
  const billingEnabled = billingSwitchEnabled();
  const billingConfiguredNow = billingConfigured();
  const billingLive = Boolean(billingConfiguredNow && STRIPE_MODE === 'live');
  const coreReady = Boolean(customDomain && persistentStorage && SMTP_CONFIGURED && REQUIRE_EMAIL_VERIFICATION && ADMIN_EMAILS.size > 0);
  return {
    version: APP_VERSION,
    legalVersion: LEGAL_VERSION,
    launchMode:LAUNCH_MODE,
    productionMode,
    cityLaunchEnabled:CITY_LAUNCH_ENABLED,
    customDomain,
    persistentStorage,
    smtpConfigured: SMTP_CONFIGURED,
    emailVerificationRequired: REQUIRE_EMAIL_VERIFICATION,
    adminConfigured: ADMIN_EMAILS.size > 0,
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

app.post('/api/admin/system/maintenance', requireAuth, requireAdmin, rateLimit({limit:20,windowMs:60*60*1000,key:req=>req.user.id}), (req,res) => {
  try{
    const action=String(req.body?.action||''); const ts=now(); let result={};
    if(action==='cleanup_expired'){
      const sessions=db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(ts).changes;
      const tokens=db.prepare('DELETE FROM auth_tokens WHERE expires_at<=? OR used_at IS NOT NULL').run(ts).changes;
      result={sessions,tokens};
    } else if(action==='cleanup_telemetry'){
      const errors=db.prepare('DELETE FROM client_errors WHERE created_at<?').run(ts-30*86400000).changes;
      const notifications=db.prepare('DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at<?').run(ts-90*86400000).changes;
      result={clientErrors:errors,notifications};
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

app.get('/healthz', (req,res) => { try { db.prepare('SELECT 1').get(); res.status(200).json({ok:true,db:true,version:APP_VERSION}); } catch { res.status(503).json({ok:false,db:false}); } });
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
  return [...room.players].map(sid=>roomSocket(room,sid)?.userId).filter(Boolean);
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
  const recent=db.prepare(`SELECT id,deck,started_at,ended_at,duration_seconds,total_turns,sync_rounds,coincidences,guess_hits,reactions,personalized_sync,extended
    FROM game_sessions WHERE user1=? AND user2=? AND status='completed' ORDER BY ended_at DESC LIMIT 6`).all(user1,user2);
  return {
    started:Number(aggregate.started||0),completed:Number(aggregate.completed||0),lastPlayedAt:Number(aggregate.last_played_at||0)||null,
    totals:{turns:Number(aggregate.total_turns||0),syncRounds:Number(aggregate.sync_rounds||0),coincidences:Number(aggregate.coincidences||0),guessHits:Number(aggregate.guess_hits||0),reactions:Number(aggregate.reactions||0),personalizedSync:Number(aggregate.personalized_sync||0)},
    recent:recent.map(row=>({id:row.id,deck:validDeck(row.deck),startedAt:row.started_at,endedAt:row.ended_at,durationSeconds:Number(row.duration_seconds||0),turns:Number(row.total_turns||0),syncRounds:Number(row.sync_rounds||0),coincidences:Number(row.coincidences||0),guessHits:Number(row.guess_hits||0),reactions:Number(row.reactions||0),personalizedSync:Number(row.personalized_sync||0),extended:Boolean(row.extended)}))
  };
}

function buildRoomState(playerIds, creatorId, mazo, dating=false) {
  const ids=[...playerIds];
  return {
    players:new Set(ids), creatorId, mazo:validDeck(mazo), dating:Boolean(dating),
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
}
function clearRoomSyncTimer(room){if(room?.syncRound?.timer){clearTimeout(room.syncRound.timer);room.syncRound.timer=null;}}
function leaveRoom(socket, notifyOpponent=false, reason='left') {
  const roomId=socket.room; if(!roomId)return;
  const room=rooms.get(roomId);
  if(room)gameHistoryFinalize(room,reason);
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
  clearRoomSyncTimer(room);gameHistoryFinalize(room,cleanShortText(payload?.reason,40)||'finish');
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

  socket.on('dating_join',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{};
    const age=Number(data.edad); const name=cleanName(data.nombre);
    if(name.length<2||!Number.isInteger(age)||age<18||age>99)return done({ok:false,error:'Completa un perfil válido +18.'});
    try{
      const current=getProfile(userId);
      const photos=savePhotos(userId,Array.isArray(data.fotos)?data.fotos:(current?.fotos||[]));
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
      const np=getProfile(userId); socket.nombre=np.nombre;socket.avatar=np.avatar;socket.edad=np.edad; done({ok:true,profile:np}); broadcastDiscovery();
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
    const done=typeof ack==='function'?ack:()=>{}; if(!allowAction(`like:${userId}`,90,60000))return done({ok:false,error:'Vas demasiado rápido. Espera un momento.'}); const target=String(data.oponenteID||'');
    if(!target||target===userId||!getProfile(target))return done({ok:false,error:'Ese perfil ya no está disponible.'});
    if(blockedEitherWay(userId,target))return done({ok:false,error:'Ese perfil no está disponible.'});
    db.prepare('INSERT OR IGNORE INTO likes(from_user,to_user,created_at) VALUES(?,?,?)').run(userId,target,now());
    const reciprocal=Boolean(db.prepare('SELECT 1 FROM likes WHERE from_user=? AND to_user=?').get(target,userId));
    let match=null;
    if(reciprocal){
      const [u1,u2]=pair(userId,target); const id=matchIdFor(userId,target); const ts=now();
      db.prepare('INSERT INTO matches(id,user1,user2,created_at,active) VALUES(?,?,?,?,1) ON CONFLICT(user1,user2) DO UPDATE SET active=1').run(id,u1,u2,ts);
      match=getActiveMatch(userId,target); const me=publicProfile(getProfile(userId)),other=publicProfile(getProfile(target));
      emitToUser(userId,'dating_match',{...other,matchId:match.id}); emitToUser(target,'dating_match',{...me,matchId:match.id}); emitMatches(userId);emitMatches(target);
      createNotification(userId,'match','¡Nuevo match!',`Tú y ${other?.nombre||'alguien'} os gustáis.`,{partnerId:target,matchId:match.id},target);
      createNotification(target,'match','¡Nuevo match!',`Tú y ${me?.nombre||'alguien'} os gustáis.`,{partnerId:userId,matchId:match.id},userId);
    }
    done({ok:true,match:Boolean(match)}); socket.emit('dating_profiles',discoverFor(userId)); broadcastDiscovery();
  });

  socket.on('dating_chat_history',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{}; const target=String(data.oponenteID||''); const match=getActiveMatch(userId,target);
    if(!match)return done({ok:false,error:'Ese match ya no está disponible.',messages:[]});
    const messages=db.prepare('SELECT * FROM (SELECT id,from_user AS `from`,text,created_at AS ts FROM messages WHERE match_id=? ORDER BY created_at DESC LIMIT 150) ORDER BY ts ASC').all(match.id);
    done({ok:true,messages});
  });

  socket.on('dating_chat_send',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{}; if(!allowAction(`chat:${userId}`,25,10000))return done({ok:false,error:'Estás enviando mensajes demasiado rápido.'}); const target=String(data.oponenteID||''); const match=getActiveMatch(userId,target);
    if(!match||blockedEitherWay(userId,target))return done({ok:false,error:'Ese match ya no está disponible.'});
    const text=cleanShortText(data.texto,500); if(!text)return done({ok:false,error:'Escribe un mensaje antes de enviarlo.'});
    const duplicate=db.prepare('SELECT 1 FROM messages WHERE match_id=? AND from_user=? AND text=? AND created_at>? LIMIT 1').get(match.id,userId,text,now()-15000); if(duplicate)return done({ok:false,error:'Ese mensaje ya se envió hace un momento.'});
    const message={id:safeId('msg'),from:userId,to:target,text,ts:now()};
    db.prepare('INSERT INTO messages(id,match_id,from_user,text,created_at) VALUES(?,?,?,?,?)').run(message.id,match.id,userId,text,message.ts);
    emitToUser(userId,'dating_chat_message',message);emitToUser(target,'dating_chat_message',message);emitMatches(userId);emitMatches(target);
    const senderName=getProfile(userId)?.nombre||'Tu match';
    createNotification(target,'message','Nuevo mensaje',`${senderName} te ha escrito.`,{partnerId:userId,matchId:match.id,messageId:message.id},userId);
    done({ok:true,id:message.id});
  });

  socket.on('dating_game_invite',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{}; const target=String(data.oponenteID||''); const opponent=socketForUser(target);
    if(!getActiveMatch(userId,target)||blockedEitherWay(userId,target))return done({ok:false,error:'Solo puedes jugar con un match activo.'});
    const targetProfile=getProfile(target); if(targetProfile?.privacy?.allowGameInvites===false)return done({ok:false,error:'Este match ha desactivado las invitaciones a jugar.'});
    if(!opponent)return done({ok:false,error:'Tu match no está conectado ahora mismo.'});
    const me=publicProfile(getProfile(userId)); const mazo=validDeck(data.mazo);
    pendingGameInvites.set(gameInviteKey(userId,target),{from:userId,to:target,mazo,expiresAt:now()+GAME_INVITE_TTL_MS});
    emitToUser(target,'dating_game_invite',{...me,mazo});
    createNotification(target,'game_invite','Invitación a jugar',`${me?.nombre||'Tu match'} quiere romper el hielo contigo.`,{partnerId:userId,mazo,expiresAt:now()+GAME_INVITE_TTL_MS},userId);
    done({ok:true});
  });

  socket.on('dating_game_accept',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{}; const target=String(data.oponenteID||''); const opponent=socketForUser(target);
    if(!opponent||!getActiveMatch(userId,target)||blockedEitherWay(userId,target))return done({ok:false,error:'Ese match ya no está disponible.'});
    const invite=getPendingGameInvite(target,userId);
    if(!invite)return done({ok:false,error:'La invitación ha caducado o ya no está disponible.'});
    pendingGameInvites.delete(gameInviteKey(target,userId));
    const salaID=createDatingRoom(opponent,socket,invite.mazo);done({ok:true,salaID});
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
    socket.join(roomId);socket.room=roomId;if(room){room.players.add(socket.id);ensureRoomPlayerState(room,socket.id);socket.mazo=room.mazo;done({ok:true,roomId,full:true});const opponent=[...room.players].filter(id=>id!==socket.id).map(id=>io.sockets.sockets.get(id)).find(Boolean);if(opponent){socket.emit('oponente_unido',{nombre:opponent.nombre||'Tu amigo',avatar:opponent.avatar||'',tuTurno:room.turnSocketId===socket.id});opponent.emit('oponente_unido',{nombre:socket.nombre||'Tu amigo',avatar:socket.avatar||'',tuTurno:room.turnSocketId===opponent.id});emitGameProgress(room);}}else{rooms.set(roomId,buildRoomState([socket.id],socket.id,socket.mazo||'rompehielos',false));done({ok:true,roomId,full:false});}
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
    removeFromLobby(socket.id);leaveRoom(socket,true,'disconnect');const set=onlineUsers.get(userId);if(set){set.delete(socket.id);if(!set.size){onlineUsers.delete(userId);clearGameInvitesFor(userId);}}db.prepare('UPDATE users SET last_seen_at=? WHERE id=?').run(now(),userId);setTimeout(()=>broadcastDiscovery(),20);
  });
});

server.listen(PORT, '0.0.0.0', ()=>{const ready=productionReadiness();console.log(`V/R Match v18.6 escuchando en puerto ${PORT}`);console.log(`Base de datos: ${DB_PATH}`);console.log(`Email SMTP: ${SMTP_CONFIGURED?'configurado':'no configurado'} | verificación obligatoria: ${REQUIRE_EMAIL_VERIFICATION}`);console.log(`Admins configurados: ${ADMIN_EMAILS.size} | lanzamiento por ciudades: ${CITY_LAUNCH_ENABLED?'activo':'inactivo'}`);
  console.log('Resiliencia: mantenimiento + backup manual protegidos');console.log('V/R+: funciones actuales disponibles para todos · monetización pública desactivada');console.log(`Web Push: ${PUSH_CONFIGURED?'configurado':'opcional / no configurado'}`);console.log(`Preproducción: ${ready.productionReady?'lista':'pendiente'} | legal ${LEGAL_VERSION}`);console.log('Observabilidad: métricas internas + feedback + diagnóstico cliente');console.log('Privacidad: sesiones + bloqueados + exportación de datos');});
