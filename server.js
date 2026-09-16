const express = require('express');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 12e6,
  cors: { origin: true, credentials: true }
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
`);

app.disable('x-powered-by');
app.use(express.json({ limit: '9mb' }));

const waitingPlayers = new Map();
const rooms = new Map();
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

function mimeExt(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}
function saveDataImage(userId, value) {
  const str = String(value || '');
  if (/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(str)) return str;
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
  if (/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(avatar)) return avatar;
  return '';
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
      interest: row.interest_pref || ''
    },
    online: isOnline(row.user_id)
  };
}
function getProfile(userId) {
  return profileFromRow(db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId));
}
function profileAccepts(profile, candidate) {
  if (!profile || !candidate) return false;
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
  return db.prepare('SELECT * FROM matches WHERE user1=? AND user2=? AND active=1').get(u1,u2) || null;
}
function discoverFor(userId) {
  const me = getProfile(userId);
  if (!me) return [];
  const excluded = new Set([userId]);
  for (const r of db.prepare('SELECT to_user id FROM likes WHERE from_user=?').all(userId)) excluded.add(r.id);
  for (const r of db.prepare('SELECT to_user id FROM passes WHERE from_user=?').all(userId)) excluded.add(r.id);
  for (const r of db.prepare('SELECT blocked id FROM blocks WHERE blocker=? UNION SELECT blocker id FROM blocks WHERE blocked=?').all(userId,userId)) excluded.add(r.id);
  for (const r of db.prepare('SELECT CASE WHEN user1=? THEN user2 ELSE user1 END id FROM matches WHERE (user1=? OR user2=?) AND active=1').all(userId,userId,userId)) excluded.add(r.id);
  return db.prepare('SELECT * FROM profiles WHERE user_id != ? ORDER BY updated_at DESC').all(userId)
    .map(profileFromRow)
    .filter(p => !excluded.has(p.id) && profileAccepts(me,p) && profileAccepts(p,me));
}
function matchPartnerRow(match, userId) {
  const partnerId = match.user1 === userId ? match.user2 : match.user1;
  const partner = getProfile(partnerId);
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
function cleanupSessions() { db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now()); }
cleanupSessions();
setInterval(cleanupSessions, 60*60*1000).unref();

app.post('/api/auth/register', async (req,res) => {
  try {
    const email = cleanEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!validEmail(email)) return res.status(400).json({ ok:false, error:'Introduce un correo válido.' });
    if (Buffer.byteLength(password,'utf8') < 8 || Buffer.byteLength(password,'utf8') > 72) return res.status(400).json({ ok:false, error:'La contraseña debe tener entre 8 y 72 bytes.' });
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(409).json({ ok:false, error:'Ya existe una cuenta con ese correo.' });
    const id = safeId('usr');
    const passwordHash = hashPassword(password);
    const ts = now();
    db.prepare('INSERT INTO users(id,email,password_hash,created_at,last_seen_at) VALUES(?,?,?,?,?)').run(id,email,passwordHash,ts,ts);
    const token = createSession(id);
    res.json({ ok:true, token, user:{ id,email }, profile:null });
  } catch (e) {
    console.error(e); res.status(500).json({ ok:false, error:'No se pudo crear la cuenta.' });
  }
});

app.post('/api/auth/login', async (req,res) => {
  try {
    const email = cleanEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const row = db.prepare('SELECT * FROM users WHERE email=? AND status=\'active\'').get(email);
    if (!row || !verifyPassword(password,row.password_hash)) return res.status(401).json({ ok:false, error:'Correo o contraseña incorrectos.' });
    db.prepare('UPDATE users SET last_seen_at=? WHERE id=?').run(now(),row.id);
    const token = createSession(row.id);
    res.json({ ok:true, token, user:{id:row.id,email:row.email}, profile:getProfile(row.id) });
  } catch (e) {
    console.error(e); res.status(500).json({ ok:false, error:'No se pudo iniciar sesión.' });
  }
});

app.post('/api/auth/logout', requireAuth, (req,res) => {
  const token = bearer(req); db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
  res.json({ ok:true });
});

app.get('/api/me', requireAuth, (req,res) => {
  res.json({ ok:true, user:{id:req.user.id,email:req.user.email}, profile:getProfile(req.user.id), matches:matchesFor(req.user.id) });
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
    const avatarInput = req.body?.avatar || photos[0] || existing?.avatar || '';
    const avatar = cleanAvatar(userId, avatarInput) || photos[0] || '';
    const ageMin = Math.max(18, Math.min(99, Number(req.body?.preferences?.ageMin) || 18));
    const ageMax = Math.max(ageMin, Math.min(99, Number(req.body?.preferences?.ageMax) || 99));
    const values = {
      name, age, gender:cleanGender(req.body?.gender), city:cleanShortText(req.body?.ciudad,40), bio:cleanShortText(req.body?.bio,180),
      interests:cleanInterests(req.body?.intereses), avatar, photos,
      ageMin, ageMax, lookingFor:cleanLooking(req.body?.preferences?.lookingFor), cityPref:cleanShortText(req.body?.preferences?.city,40), interestPref:cleanShortText(req.body?.preferences?.interest,30)
    };
    db.prepare(`INSERT INTO profiles(user_id,name,age,gender,city,bio,interests_json,avatar,photos_json,age_min,age_max,looking_for,city_pref,interest_pref,updated_at)
      VALUES(@userId,@name,@age,@gender,@city,@bio,@interests,@avatar,@photos,@ageMin,@ageMax,@lookingFor,@cityPref,@interestPref,@updatedAt)
      ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,age=excluded.age,gender=excluded.gender,city=excluded.city,bio=excluded.bio,interests_json=excluded.interests_json,avatar=excluded.avatar,photos_json=excluded.photos_json,age_min=excluded.age_min,age_max=excluded.age_max,looking_for=excluded.looking_for,city_pref=excluded.city_pref,interest_pref=excluded.interest_pref,updated_at=excluded.updated_at`)
      .run({userId,...values,interests:JSON.stringify(values.interests),photos:JSON.stringify(values.photos),updatedAt:now()});
    const profile = getProfile(userId);
    broadcastDiscovery();
    res.json({ok:true,profile});
  } catch (e) {
    console.error(e); res.status(500).json({ok:false,error:'No se pudo guardar el perfil.'});
  }
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

app.post('/api/report', requireAuth, (req,res) => {
  const target = String(req.body?.userId || '');
  const reason = cleanShortText(req.body?.reason,60);
  const details = cleanShortText(req.body?.details,600);
  if (!target || target === req.user.id || !reason) return res.status(400).json({ok:false,error:'Selecciona un motivo válido.'});
  db.prepare('INSERT INTO reports(id,reporter,reported,reason,details,created_at) VALUES(?,?,?,?,?,?)').run(safeId('rep'),req.user.id,target,reason,details,now());
  res.json({ok:true});
});

app.get('/healthz', (req,res) => res.status(200).json({ ok:true }));
app.use('/uploads', express.static(UPLOAD_DIR, { fallthrough:false, maxAge:'7d', dotfiles:'deny' }));
app.get(['/', '/index.html'], (req,res) => res.sendFile(path.join(ROOT,'index.html')));
app.get('/styles.css', (req,res) => res.sendFile(path.join(ROOT,'styles.css')));
app.get('/preview.html', (req,res) => res.sendFile(path.join(ROOT,'preview.html')));

function socketSet(userId) {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId,new Set());
  return onlineUsers.get(userId);
}
function emitToUser(userId,event,payload) {
  const set=onlineUsers.get(userId); if (!set) return;
  for (const sid of set) io.sockets.sockets.get(sid)?.emit(event,payload);
}
function emitMatches(userId) { emitToUser(userId,'dating_matches',matchesFor(userId)); }
function broadcastDiscovery() {
  for (const userId of onlineUsers.keys()) emitToUser(userId,'dating_profiles',discoverFor(userId));
}

io.use((socket,next) => {
  const token = String(socket.handshake.auth?.token || '');
  const user = userFromToken(token);
  if (!user) return next(new Error('AUTH_REQUIRED'));
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
  rooms.set(salaID,{players:new Set([socket.id,opponent.id]),creatorId:socket.id,mazo:deck});
  socket.emit('partida_iniciada',{salaID,creadorID:socket.id,mazo:deck,origen:'dating',oponenteNombre:opponent.nombre||'Tu match',oponenteAvatar:opponent.avatar||''});
  opponent.emit('partida_iniciada',{salaID,creadorID:socket.id,mazo:deck,origen:'dating',oponenteNombre:socket.nombre||'Tu match',oponenteAvatar:socket.avatar||''});
  return salaID;
}

io.on('connection', socket => {
  const userId=socket.userId;
  socketSet(userId).add(socket.id);
  db.prepare('UPDATE users SET last_seen_at=? WHERE id=?').run(now(),userId);
  const p=getProfile(userId); if(p){socket.nombre=p.nombre;socket.avatar=p.avatar;socket.edad=p.edad;}
  socket.emit('dating_profiles',discoverFor(userId)); socket.emit('dating_matches',matchesFor(userId));
  setTimeout(()=>broadcastDiscovery(),20);

  socket.on('dating_join',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{};
    const age=Number(data.edad); const name=cleanName(data.nombre);
    if(name.length<2||!Number.isInteger(age)||age<18||age>99)return done({ok:false,error:'Completa un perfil válido +18.'});
    try{
      const current=getProfile(userId);
      const photos=savePhotos(userId,Array.isArray(data.fotos)?data.fotos:(current?.fotos||[]));
      const avatar=cleanAvatar(userId,data.avatar||photos[0]||current?.avatar||'')||photos[0]||'';
      const pref=data.preferences||{};
      const ageMin=Math.max(18,Math.min(99,Number(pref.ageMin)||18)); const ageMax=Math.max(ageMin,Math.min(99,Number(pref.ageMax)||99));
      db.prepare(`INSERT INTO profiles(user_id,name,age,gender,city,bio,interests_json,avatar,photos_json,age_min,age_max,looking_for,city_pref,interest_pref,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,age=excluded.age,gender=excluded.gender,city=excluded.city,bio=excluded.bio,interests_json=excluded.interests_json,avatar=excluded.avatar,photos_json=excluded.photos_json,age_min=excluded.age_min,age_max=excluded.age_max,looking_for=excluded.looking_for,city_pref=excluded.city_pref,interest_pref=excluded.interest_pref,updated_at=excluded.updated_at`)
      .run(userId,name,age,cleanGender(data.gender),cleanShortText(data.ciudad,40),cleanShortText(data.bio,180),JSON.stringify(cleanInterests(data.intereses)),avatar,JSON.stringify(photos),ageMin,ageMax,cleanLooking(pref.lookingFor),cleanShortText(pref.city,40),cleanShortText(pref.interest,30),now());
      const np=getProfile(userId); socket.nombre=np.nombre;socket.avatar=np.avatar;socket.edad=np.edad; done({ok:true,profile:np}); broadcastDiscovery();
    }catch(e){console.error(e);done({ok:false,error:'No se pudo guardar el perfil.'});}
  });

  socket.on('dating_pass',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{}; const target=String(data.oponenteID||'');
    if(!target||target===userId)return done({ok:false,error:'Perfil no válido.'});
    db.prepare('INSERT OR REPLACE INTO passes(from_user,to_user,created_at) VALUES(?,?,?)').run(userId,target,now()); done({ok:true}); socket.emit('dating_profiles',discoverFor(userId));
  });

  socket.on('dating_like',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{}; const target=String(data.oponenteID||'');
    if(!target||target===userId||!getProfile(target))return done({ok:false,error:'Ese perfil ya no está disponible.'});
    if(blockedEitherWay(userId,target))return done({ok:false,error:'Ese perfil no está disponible.'});
    db.prepare('INSERT OR IGNORE INTO likes(from_user,to_user,created_at) VALUES(?,?,?)').run(userId,target,now());
    const reciprocal=Boolean(db.prepare('SELECT 1 FROM likes WHERE from_user=? AND to_user=?').get(target,userId));
    let match=null;
    if(reciprocal){
      const [u1,u2]=pair(userId,target); const id=matchIdFor(userId,target); const ts=now();
      db.prepare('INSERT INTO matches(id,user1,user2,created_at,active) VALUES(?,?,?,?,1) ON CONFLICT(user1,user2) DO UPDATE SET active=1').run(id,u1,u2,ts);
      match=getActiveMatch(userId,target); const me=getProfile(userId),other=getProfile(target);
      emitToUser(userId,'dating_match',{...other,matchId:match.id}); emitToUser(target,'dating_match',{...me,matchId:match.id}); emitMatches(userId);emitMatches(target);
    }
    done({ok:true,match:Boolean(match)}); socket.emit('dating_profiles',discoverFor(userId)); broadcastDiscovery();
  });

  socket.on('dating_chat_history',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{}; const target=String(data.oponenteID||''); const match=getActiveMatch(userId,target);
    if(!match)return done({ok:false,error:'Ese match ya no está disponible.',messages:[]});
    const messages=db.prepare('SELECT id,from_user AS `from`, text, created_at AS ts FROM messages WHERE match_id=? ORDER BY created_at ASC LIMIT 150').all(match.id);
    done({ok:true,messages});
  });

  socket.on('dating_chat_send',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{}; const target=String(data.oponenteID||''); const match=getActiveMatch(userId,target);
    if(!match||blockedEitherWay(userId,target))return done({ok:false,error:'Ese match ya no está disponible.'});
    const text=cleanShortText(data.texto,500); if(!text)return done({ok:false,error:'Escribe un mensaje antes de enviarlo.'});
    const message={id:safeId('msg'),from:userId,to:target,text,ts:now()};
    db.prepare('INSERT INTO messages(id,match_id,from_user,text,created_at) VALUES(?,?,?,?,?)').run(message.id,match.id,userId,text,message.ts);
    emitToUser(userId,'dating_chat_message',message);emitToUser(target,'dating_chat_message',message);emitMatches(userId);emitMatches(target);done({ok:true,id:message.id});
  });

  socket.on('dating_game_invite',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{}; const target=String(data.oponenteID||''); const opponent=socketForUser(target);
    if(!getActiveMatch(userId,target)||blockedEitherWay(userId,target))return done({ok:false,error:'Solo puedes jugar con un match activo.'});
    if(!opponent)return done({ok:false,error:'Tu match no está conectado ahora mismo.'});
    const me=getProfile(userId); const mazo=validDeck(data.mazo); emitToUser(target,'dating_game_invite',{...me,mazo});done({ok:true});
  });

  socket.on('dating_game_accept',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{}; const target=String(data.oponenteID||''); const opponent=socketForUser(target);
    if(!opponent||!getActiveMatch(userId,target))return done({ok:false,error:'Ese match ya no está disponible.'});
    const salaID=createDatingRoom(opponent,socket,data.mazo);done({ok:true,salaID});
  });

  // Compatibilidad con el modo de juego/lobby original.
  socket.on('entrar_lobby',(data={})=>{leaveRoom(socket);socket.nombre=cleanName(data.nombre)||socket.nombre;socket.mazo=validDeck(data.mazo);waitingPlayers.set(socket.id,{id:socket.id,nombre:socket.nombre,mazo:socket.mazo,avatar:socket.avatar});broadcastLobby();});
  socket.on('salir_lobby',()=>removeFromLobby(socket.id));
  socket.on('retar_jugador',(data={},ack)=>{
    const done=typeof ack==='function'?ack:()=>{};const opponentId=String(data.oponenteID||'');const mazo=validDeck(data.mazo);const opponent=io.sockets.sockets.get(opponentId);const waiting=waitingPlayers.get(opponentId);
    if(!opponent||!waiting)return done({ok:false,error:'Ese jugador ya no está disponible.'});if(opponentId===socket.id)return done({ok:false,error:'No puedes retarte a ti mismo.'});if(waiting.mazo!==mazo)return done({ok:false,error:'El mazo ya no coincide.'});
    const salaID=safeRoomId();removeFromLobby(socket.id);removeFromLobby(opponentId);socket.join(salaID);opponent.join(salaID);socket.room=salaID;opponent.room=salaID;socket.mazo=opponent.mazo=mazo;rooms.set(salaID,{players:new Set([socket.id,opponent.id]),creatorId:socket.id,mazo});done({ok:true,salaID});
    socket.emit('partida_iniciada',{salaID,creadorID:socket.id,mazo,oponenteNombre:opponent.nombre||'Tu oponente',oponenteAvatar:opponent.avatar||''});opponent.emit('partida_iniciada',{salaID,creadorID:socket.id,mazo,oponenteNombre:socket.nombre||'Tu oponente',oponenteAvatar:socket.avatar||''});
  });
  socket.on('unirse_sala',(payload,ack)=>{
    const done=typeof ack==='function'?ack:()=>{};const data=(payload&&typeof payload==='object')?payload:{salaID:payload};const roomId=String(data.salaID||'').slice(0,64);if(!roomId)return done({ok:false,error:'Sala no válida.'});
    if(data.nombre)socket.nombre=cleanName(data.nombre);if(data.mazo)socket.mazo=validDeck(data.mazo);removeFromLobby(socket.id);const room=rooms.get(roomId);if(room&&room.players.size>=2&&!room.players.has(socket.id))return done({ok:false,error:'La sala ya está completa.'});
    socket.join(roomId);socket.room=roomId;if(room){room.players.add(socket.id);socket.mazo=room.mazo;done({ok:true,roomId,full:true});const opponent=[...room.players].filter(id=>id!==socket.id).map(id=>io.sockets.sockets.get(id)).find(Boolean);if(opponent){socket.emit('oponente_unido',{nombre:opponent.nombre||'Tu amigo',avatar:opponent.avatar||'',tuTurno:false});opponent.emit('oponente_unido',{nombre:socket.nombre||'Tu amigo',avatar:socket.avatar||'',tuTurno:true});}}else{rooms.set(roomId,{players:new Set([socket.id]),creatorId:socket.id,mazo:socket.mazo||'rompehielos'});done({ok:true,roomId,full:false});}
  });
  socket.on('accion_juego',(d={})=>{if(!socket.room||socket.room!==d.sala)return;socket.to(socket.room).emit('actualizar_mesa',{tipo:d.tipo==='reto'?'reto':'verdad',textoCarta:String(d.textoCarta||'').slice(0,1000),sala:socket.room});});
  socket.on('enviar_respuesta',(d={})=>{if(socket.room&&socket.room===d.sala)socket.to(socket.room).emit('recibir_respuesta',{respuesta:String(d.respuesta||'').slice(0,500),pregunta:String(d.pregunta||'').slice(0,1000)});});
  socket.on('enviar_media',(d={},ack)=>{const done=typeof ack==='function'?ack:()=>{};if(!socket.room||socket.room!==d.sala)return done({ok:false,error:'La sala ya no está activa.'});const tipo=d.tipo==='video'?'video':'imagen',dataUrl=String(d.dataUrl||''),mime=String(d.mime||'').slice(0,80);const img=tipo==='imagen'&&/^data:image\/(?:jpeg|png|webp)(?:;[^;]+)*;base64,/i.test(dataUrl),vid=tipo==='video'&&/^data:video\/(?:webm|mp4)(?:;[^;]+)*;base64,/i.test(dataUrl);if(!img&&!vid)return done({ok:false,error:'El formato de la prueba no es válido.'});if(dataUrl.length>9e6)return done({ok:false,error:'El vídeo pesa demasiado. Grábalo un poco más corto.'});socket.to(socket.room).emit('recibir_media',{tipo,dataUrl,mime});done({ok:true});});
  socket.on('escribiendo',sala=>{if(socket.room&&socket.room===sala)socket.to(sala).emit('mostrar_escribiendo');});socket.on('parar_escribir',sala=>{if(socket.room&&socket.room===sala)socket.to(sala).emit('ocultar_escribiendo');});
  socket.on('enviar_reaccion',(d={})=>{if(socket.room&&socket.room===d.sala){const allowed=new Set(['🔥','😱','😂','❤️']);socket.to(d.sala).emit('recibir_reaccion',allowed.has(d.emoji)?d.emoji:'👍');}});
  socket.on('tiempo_agotado',(d={})=>{if(socket.room&&socket.room===d.sala)socket.to(d.sala).emit('tiempo_agotado_remoto');});
  socket.on('abandonar_partida',salaID=>{if(socket.room&&socket.room===salaID)leaveRoom(socket,true);});

  socket.on('disconnect',()=>{
    removeFromLobby(socket.id);leaveRoom(socket,true);const set=onlineUsers.get(userId);if(set){set.delete(socket.id);if(!set.size)onlineUsers.delete(userId);}db.prepare('UPDATE users SET last_seen_at=? WHERE id=?').run(now(),userId);setTimeout(()=>broadcastDiscovery(),20);
  });
});

server.listen(PORT, '0.0.0.0', ()=>console.log(`V/R Match escuchando en puerto ${PORT}`));
