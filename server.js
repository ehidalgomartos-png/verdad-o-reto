const express = require('express');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
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

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
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
// Migraciones compatibles con las bases creadas en Fase 3.
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
`);

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req,res,next) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy','camera=(self), microphone=(self), geolocation=(self)');
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) res.setHeader('Strict-Transport-Security','max-age=15552000; includeSubDomains');
  next();
});
app.use(express.json({ limit: '9mb' }));

const waitingPlayers = new Map();
const rooms = new Map();
const pendingGameInvites = new Map(); // `from:to` -> { from, to, mazo, expiresAt }
const GAME_INVITE_TTL_MS = 5 * 60 * 1000;
const onlineUsers = new Map(); // userId -> Set(socket.id)

function now() { return Date.now(); }
function safeId(prefix) { return `${prefix}_${crypto.randomBytes(12).toString('hex')}`; }
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
  const row = db.prepare("SELECT status,expires_at FROM plus_memberships WHERE user_id=?").get(userId);
  if (!row || row.status !== 'active') return false;
  if (row.expires_at && Number(row.expires_at) <= now()) {
    db.prepare("UPDATE plus_memberships SET status='expired',updated_at=? WHERE user_id=?").run(now(),userId);
    return false;
  }
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
  return {
    active,
    plan: active ? (row?.plan || 'plus') : 'free',
    status: active ? 'active' : (row?.status || 'inactive'),
    source: row?.source || null,
    startedAt: row?.started_at || null,
    expiresAt: active ? (row?.expires_at || null) : null,
    settings: getPlusSettings(userId),
    boost: plusBoostState(userId),
    billingEnabled: false
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
  const ts = now();
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(hashToken(token), userId, ts, ts + SESSION_DAYS*86400000);
  return token;
}
function userFromToken(token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.id,u.email,u.status,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).get(hashToken(token));
  if (!row || row.status !== 'active' || row.expires_at <= now()) return null;
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
    if (!validEmail(email)) return res.status(400).json({ ok:false, error:'Introduce un correo válido.' });
    if (Buffer.byteLength(password,'utf8') < 8 || Buffer.byteLength(password,'utf8') > 72) return res.status(400).json({ ok:false, error:'La contraseña debe tener entre 8 y 72 caracteres aprox.' });
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(409).json({ ok:false, error:'Ya existe una cuenta con ese correo.' });
    const id = safeId('usr');
    const passwordHash = hashPassword(password);
    const ts = now();
    db.prepare('INSERT INTO users(id,email,password_hash,created_at,last_seen_at,email_verified) VALUES(?,?,?,?,?,0)').run(id,email,passwordHash,ts,ts);
    const user = {id,email};
    let emailSent = false;
    try { emailSent = (await sendVerificationEmail(req,user)).sent; } catch (e) { console.error('Error enviando verificación:',e.message); }
    if (REQUIRE_EMAIL_VERIFICATION) return res.json({ok:true,verificationRequired:true,emailSent,user:{...user,emailVerified:false}});
    const token = createSession(id);
    res.json({ ok:true, token, user:{ ...user, emailVerified:false, admin:isAdmin(user) }, profile:null, plus:getPlusState(id), emailVerificationPending:true, emailSent });
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
    res.json({ ok:true, token, user:{id:row.id,email:row.email,emailVerified:Boolean(row.email_verified),admin:isAdmin(row)}, profile:getProfile(row.id), plus:getPlusState(row.id) });
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
    res.json({ok:true,token:session,user:{id:user.id,email:user.email,emailVerified:Boolean(user.email_verified),admin:isAdmin(user)},profile:getProfile(user.id),plus:getPlusState(user.id)});
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
  const full=db.prepare('SELECT email_verified FROM users WHERE id=?').get(req.user.id);
  res.json({ ok:true, user:{id:req.user.id,email:req.user.email,emailVerified:Boolean(full?.email_verified),admin:isAdmin(req.user)}, profile:getProfile(req.user.id), matches:matchesFor(req.user.id), plus:getPlusState(req.user.id), notificationState:notificationState(req.user.id) });
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

app.post('/api/account/delete', requireAuth, rateLimit({limit:3,windowMs:24*60*60*1000,key:req=>req.user.id}), (req,res) => {
  const password=String(req.body?.password||''); const row=db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
  if(!row||!verifyPassword(password,row.password_hash))return res.status(400).json({ok:false,error:'Contraseña incorrecta.'});
  disconnectUserSockets(req.user.id,'account_deleted',{}); deleteUserUploads(req.user.id); db.prepare('DELETE FROM users WHERE id=?').run(req.user.id); onlineUsers.delete(req.user.id); broadcastDiscovery();
  res.json({ok:true});
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

app.get('/healthz', (req,res) => { try { db.prepare('SELECT 1').get(); res.status(200).json({ok:true,db:true,version:'9.0.0'}); } catch { res.status(503).json({ok:false,db:false}); } });
app.use('/uploads', express.static(UPLOAD_DIR, { fallthrough:false, maxAge:'7d', dotfiles:'deny' }));
app.get(['/', '/index.html'], (req,res) => res.sendFile(path.join(ROOT,'index.html')));
app.get('/styles.css', (req,res) => res.sendFile(path.join(ROOT,'styles.css')));
app.get('/sw.js', (req,res) => { res.setHeader('Cache-Control','no-cache'); res.sendFile(path.join(ROOT,'sw.js')); });
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
function leaveRoom(socket, notifyOpponent=false) {
  const roomId=socket.room; if(!roomId)return;
  const room=rooms.get(roomId); socket.leave(roomId); socket.room=null; if(!room)return;
  room.players.delete(socket.id); if(notifyOpponent)socket.to(roomId).emit('oponente_abandono');
  if(room.players.size===0)rooms.delete(roomId); else if(room.creatorId===socket.id)room.creatorId=[...room.players][0];
}
function socketForUser(userId) {
  const set=onlineUsers.get(userId); if(!set||!set.size)return null;
  for(const sid of set){const s=io.sockets.sockets.get(sid);if(s)return s;} return null;
}
function createDatingRoom(socket, opponent, mazo) {
  const deck=validDeck(mazo); leaveRoom(socket);leaveRoom(opponent);removeFromLobby(socket.id);removeFromLobby(opponent.id);
  const salaID=safeRoomId(); socket.join(salaID);opponent.join(salaID);socket.room=salaID;opponent.room=salaID;socket.mazo=opponent.mazo=deck;
  rooms.set(salaID,{players:new Set([socket.id,opponent.id]),creatorId:socket.id,mazo:deck,dating:true});
  socket.emit('partida_iniciada',{salaID,creadorID:socket.id,mazo:deck,origen:'dating',oponenteNombre:opponent.nombre||'Tu match',oponenteAvatar:opponent.avatar||''});
  opponent.emit('partida_iniciada',{salaID,creadorID:socket.id,mazo:deck,origen:'dating',oponenteNombre:socket.nombre||'Tu match',oponenteAvatar:socket.avatar||''});
  return salaID;
}
function roomOpponentSocket(socket) {
  if(!socket.room)return null;
  const room=rooms.get(socket.room); if(!room)return null;
  for(const sid of room.players){ if(sid!==socket.id){ const other=io.sockets.sockets.get(sid); if(other)return other; } }
  return null;
}
function notifyOpponentTurn(socket, reason='Tu turno') {
  const other=roomOpponentSocket(socket);
  if(!other?.userId)return;
  const senderName=socket.nombre||getProfile(socket.userId)?.nombre||'Tu oponente';
  createNotification(other.userId,'game_turn','Te toca jugar',`${senderName} terminó su jugada. Es tu turno.`,{roomId:socket.room,reason},socket.userId);
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
    const salaID=safeRoomId();removeFromLobby(socket.id);removeFromLobby(opponentId);socket.join(salaID);opponent.join(salaID);socket.room=salaID;opponent.room=salaID;socket.mazo=opponent.mazo=mazo;rooms.set(salaID,{players:new Set([socket.id,opponent.id]),creatorId:socket.id,mazo,dating:false});done({ok:true,salaID});
    socket.emit('partida_iniciada',{salaID,creadorID:socket.id,mazo,oponenteNombre:opponent.nombre||'Tu oponente',oponenteAvatar:opponent.avatar||''});opponent.emit('partida_iniciada',{salaID,creadorID:socket.id,mazo,oponenteNombre:socket.nombre||'Tu oponente',oponenteAvatar:socket.avatar||''});
  });
  socket.on('unirse_sala',(payload,ack)=>{
    const done=typeof ack==='function'?ack:()=>{};const data=(payload&&typeof payload==='object')?payload:{salaID:payload};const roomId=String(data.salaID||'').slice(0,64);if(!roomId)return done({ok:false,error:'Sala no válida.'});
    if(data.nombre)socket.nombre=cleanName(data.nombre);if(data.mazo)socket.mazo=validDeck(data.mazo);removeFromLobby(socket.id);const room=rooms.get(roomId);if(room&&room.players.size>=2&&!room.players.has(socket.id))return done({ok:false,error:'La sala ya está completa.'});
    socket.join(roomId);socket.room=roomId;if(room){room.players.add(socket.id);socket.mazo=room.mazo;done({ok:true,roomId,full:true});const opponent=[...room.players].filter(id=>id!==socket.id).map(id=>io.sockets.sockets.get(id)).find(Boolean);if(opponent){socket.emit('oponente_unido',{nombre:opponent.nombre||'Tu amigo',avatar:opponent.avatar||'',tuTurno:false});opponent.emit('oponente_unido',{nombre:socket.nombre||'Tu amigo',avatar:socket.avatar||'',tuTurno:true});}}else{rooms.set(roomId,{players:new Set([socket.id]),creatorId:socket.id,mazo:socket.mazo||'rompehielos',dating:false});done({ok:true,roomId,full:false});}
  });
  socket.on('accion_juego',(d={})=>{if(!socket.room||socket.room!==d.sala)return;socket.to(socket.room).emit('actualizar_mesa',{tipo:d.tipo==='reto'?'reto':'verdad',textoCarta:String(d.textoCarta||'').slice(0,1000),sala:socket.room});});
  socket.on('enviar_respuesta',(d={})=>{if(socket.room&&socket.room===d.sala){socket.to(socket.room).emit('recibir_respuesta',{respuesta:String(d.respuesta||'').slice(0,500),pregunta:String(d.pregunta||'').slice(0,1000)});notifyOpponentTurn(socket,'respuesta');}});
  socket.on('enviar_media',(d={},ack)=>{const done=typeof ack==='function'?ack:()=>{};if(!socket.room||socket.room!==d.sala)return done({ok:false,error:'La sala ya no está activa.'});const tipo=d.tipo==='video'?'video':'imagen',dataUrl=String(d.dataUrl||''),mime=String(d.mime||'').slice(0,80);const img=tipo==='imagen'&&/^data:image\/(?:jpeg|png|webp)(?:;[^;]+)*;base64,/i.test(dataUrl),vid=tipo==='video'&&/^data:video\/(?:webm|mp4)(?:;[^;]+)*;base64,/i.test(dataUrl);if(!img&&!vid)return done({ok:false,error:'El formato de la prueba no es válido.'});if(dataUrl.length>9e6)return done({ok:false,error:'El vídeo pesa demasiado. Grábalo un poco más corto.'});socket.to(socket.room).emit('recibir_media',{tipo,dataUrl,mime});notifyOpponentTurn(socket,'prueba');done({ok:true});});
  socket.on('escribiendo',sala=>{if(socket.room&&socket.room===sala)socket.to(sala).emit('mostrar_escribiendo');});socket.on('parar_escribir',sala=>{if(socket.room&&socket.room===sala)socket.to(sala).emit('ocultar_escribiendo');});
  socket.on('enviar_reaccion',(d={})=>{if(socket.room&&socket.room===d.sala){const allowed=new Set(['🔥','😱','😂','❤️']);socket.to(d.sala).emit('recibir_reaccion',allowed.has(d.emoji)?d.emoji:'👍');}});
  socket.on('tiempo_agotado',(d={})=>{if(socket.room&&socket.room===d.sala){socket.to(d.sala).emit('tiempo_agotado_remoto');notifyOpponentTurn(socket,'tiempo_agotado');}});
  socket.on('abandonar_partida',salaID=>{if(socket.room&&socket.room===salaID)leaveRoom(socket,true);});

  socket.on('disconnect',()=>{
    removeFromLobby(socket.id);leaveRoom(socket,true);const set=onlineUsers.get(userId);if(set){set.delete(socket.id);if(!set.size){onlineUsers.delete(userId);clearGameInvitesFor(userId);}}db.prepare('UPDATE users SET last_seen_at=? WHERE id=?').run(now(),userId);setTimeout(()=>broadcastDiscovery(),20);
  });
});

server.listen(PORT, '0.0.0.0', ()=>{console.log(`V/R Match v9.0 escuchando en puerto ${PORT}`);console.log(`Base de datos: ${DB_PATH}`);console.log(`Email SMTP: ${SMTP_CONFIGURED?'configurado':'no configurado'} | verificación obligatoria: ${REQUIRE_EMAIL_VERIFICATION}`);console.log(`Admins configurados: ${ADMIN_EMAILS.size}`);console.log(`Web Push: ${PUSH_CONFIGURED?'configurado':'opcional / no configurado'}`);});
