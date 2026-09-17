// launch-module.mjs
// V/R Match · sistema de lista de espera / ciudades / activación.
//
// Requisitos del módulo:
// - Node 22
// - Express
// - Un objeto `db` con API síncrona estilo better-sqlite3:
//     db.prepare(sql).get(...)
//     db.prepare(sql).all(...)
//     db.prepare(sql).run(...)
//     db.exec(sql)
//     db.transaction(fn)
//
// El módulo NO conoce la tabla de usuarios ni la sesión actual de V/R Match.
// Para no inventar el auth existente, la activación deja un cookie HTTP-only
// y redirige a `completeProfileUrl`. El código real de registro/perfil debe
// consumir ese token y vincular `launch_waitlist_users.app_user_id`.

import express from 'express';
import crypto from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeCity(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function makeReferralCode(alias, citySlug) {
  const a = String(alias || 'VR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) || 'VR';
  const c = String(citySlug || 'CITY').replace(/[^a-z0-9]/gi,'').slice(0,3).toUpperCase() || 'VR';
  return `VR-${a}-${c}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}
function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}
function isoPlusDays(days) {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}
function safeInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function cityStats(db, slug) {
  return db.prepare(`
    SELECT
      c.slug,
      c.name,
      c.target_users AS goal,
      c.status,
      c.unlock_at AS unlockAt,
      c.activated_at AS activatedAt,
      COUNT(u.id) AS current
    FROM launch_cities c
    LEFT JOIN launch_waitlist_users u
      ON u.city_slug = c.slug AND u.status != 'BLOCKED'
    WHERE c.slug = ?
    GROUP BY c.id
  `).get(slug);
}

function allCityStats(db) {
  return db.prepare(`
    SELECT
      c.slug,
      c.name,
      c.target_users AS goal,
      c.status,
      c.unlock_at AS unlockAt,
      c.activated_at AS activatedAt,
      COUNT(u.id) AS current
    FROM launch_cities c
    LEFT JOIN launch_waitlist_users u
      ON u.city_slug = c.slug AND u.status != 'BLOCKED'
    GROUP BY c.id
    ORDER BY current DESC, c.name ASC
  `).all();
}

function refreshCityReadyState(db, slug) {
  const stats = cityStats(db, slug);
  if (!stats) return null;
  if (stats.status === 'WAITING' && Number(stats.current) >= Number(stats.goal)) {
    db.prepare(`
      UPDATE launch_cities
      SET status='READY', updated_at=CURRENT_TIMESTAMP
      WHERE slug=?
    `).run(slug);
  }
  return cityStats(db, slug);
}

function queueEmail(db, {waitlistUserId=null, email, subject, template, payload}) {
  db.prepare(`
    INSERT INTO launch_mail_queue
      (waitlist_user_id,email,subject,template,payload_json)
    VALUES (?,?,?,?,?)
  `).run(waitlistUserId, email, subject, template, JSON.stringify(payload || {}));
}

function renderEmail(template, payload, baseUrl) {
  const wrap = body => `<!doctype html>
<html><body style="margin:0;background:#0b0b10;color:#f8f8fb;font-family:Arial,sans-serif">
<div style="max-width:620px;margin:auto;padding:44px 24px">
<div style="font-size:22px;font-weight:900;margin-bottom:28px">V/R <span style="color:#ff3d6e">MATCH</span></div>
${body}
<p style="color:#777985;font-size:12px;margin-top:34px">V/R Match · ${new Date().getFullYear()}</p>
</div></body></html>`;

  if (template === 'WAITLIST_WELCOME') {
    return wrap(`
      <h1 style="font-size:34px;line-height:1.05;margin:0 0 16px">Ya estás en la lista 🔥</h1>
      <p style="color:#b9b9c3;font-size:17px;line-height:1.6">
        ${payload.alias}, estás esperando V/R Match en <strong style="color:white">${payload.city}</strong>.
      </p>
      <p style="color:#b9b9c3;font-size:17px;line-height:1.6">
        Comparte tu enlace para acercar tu ciudad al desbloqueo.
      </p>
      <p style="margin:28px 0">
        <a href="${payload.referralUrl}" style="background:#ff3d6e;color:white;text-decoration:none;font-weight:800;padding:14px 20px;border-radius:12px;display:inline-block">
          Compartir mi invitación
        </a>
      </p>
      <p style="color:#777985;font-size:13px;word-break:break-all">${payload.referralUrl}</p>
    `);
  }

  if (template === 'CITY_UNLOCKED') {
    return wrap(`
      <div style="font-size:12px;letter-spacing:.16em;color:#ff7195;font-weight:800;margin-bottom:10px">CIUDAD DESBLOQUEADA</div>
      <h1 style="font-size:38px;line-height:1.04;margin:0 0 16px">${payload.city} está abierta 🔓</h1>
      <p style="color:#b9b9c3;font-size:18px;line-height:1.65">
        ${payload.alias}, ha llegado el momento. Ya puedes activar tu acceso a V/R Match.
      </p>
      <p style="margin:30px 0">
        <a href="${payload.activationUrl}" style="background:#ff3d6e;color:white;text-decoration:none;font-weight:900;padding:15px 22px;border-radius:12px;display:inline-block">
          Entrar en V/R Match
        </a>
      </p>
      <p style="color:#777985;font-size:13px">Este enlace caduca el ${payload.expiresLabel}.</p>
    `);
  }

  return wrap(`<p>${String(payload.message || '')}</p>`);
}

async function trySendQueuedMail(db, {resendApiKey, mailFrom, baseUrl, limit=50}) {
  if (!resendApiKey || !mailFrom) {
    return {sent:0, errors:0, skipped:true, reason:'Faltan RESEND_API_KEY o MAIL_FROM'};
  }

  const rows = db.prepare(`
    SELECT * FROM launch_mail_queue
    WHERE status IN ('PENDING','ERROR') AND attempts < 5
    ORDER BY id ASC LIMIT ?
  `).all(limit);

  let sent = 0, errors = 0;

  for (const row of rows) {
    const payload = JSON.parse(row.payload_json || '{}');
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method:'POST',
        headers:{
          'Authorization':`Bearer ${resendApiKey}`,
          'Content-Type':'application/json'
        },
        body:JSON.stringify({
          from:mailFrom,
          to:[row.email],
          subject:row.subject,
          html:renderEmail(row.template, payload, baseUrl)
        })
      });

      if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);

      db.prepare(`
        UPDATE launch_mail_queue
        SET status='SENT', attempts=attempts+1, sent_at=CURRENT_TIMESTAMP, last_error=NULL
        WHERE id=?
      `).run(row.id);
      sent++;
    } catch (err) {
      db.prepare(`
        UPDATE launch_mail_queue
        SET status='ERROR', attempts=attempts+1, last_error=?
        WHERE id=?
      `).run(String(err?.message || err).slice(0,1000), row.id);
      errors++;
    }
  }
  return {sent, errors, skipped:false};
}

function publicPeople(db, slug, limit=12) {
  return db.prepare(`
    SELECT id, alias, age, city_slug AS city
    FROM launch_waitlist_users
    WHERE city_slug=? AND public_profile=1 AND status != 'BLOCKED'
    ORDER BY created_at DESC
    LIMIT ?
  `).all(slug, limit);
}

export function createLaunchSystem({
  db,
  adminGuard,
  baseUrl,
  completeProfileUrl='/complete-profile',
  resendApiKey=process.env.RESEND_API_KEY,
  mailFrom=process.env.MAIL_FROM,
  cookieSecure=process.env.NODE_ENV === 'production'
}) {
  if (!db) throw new Error('createLaunchSystem: falta db');
  if (typeof adminGuard !== 'function') {
    throw new Error('createLaunchSystem: falta adminGuard. No se publica un panel admin sin protección.');
  }

  const publicRouter = express.Router();
  const adminRouter = express.Router();

  publicRouter.use(express.json({limit:'100kb'}));

  // -------- PUBLIC API --------

  publicRouter.get('/cities', (req,res) => {
    const rows = allCityStats(db).map(r => ({
      ...r,
      current:Number(r.current),
      goal:Number(r.goal),
      percent:Math.min(100, Math.round((Number(r.current)/Number(r.goal))*100))
    }));
    res.json({cities:rows});
  });

  publicRouter.get('/cities/:slug/people', (req,res) => {
    const slug = normalizeCity(req.params.slug);
    const limit = Math.min(24, Math.max(1, safeInt(req.query.limit, 12)));
    res.json({people:publicPeople(db, slug, limit)});
  });

  publicRouter.post('/referrals/visit', (req,res) => {
    const code = String(req.body?.code || '').trim();
    if (!code) return res.status(400).json({error:'Código requerido'});
    const owner = db.prepare(`SELECT id FROM launch_waitlist_users WHERE referral_code=?`).get(code);
    if (!owner) return res.status(404).json({error:'Código no encontrado'});
    db.prepare(`INSERT INTO launch_referral_events(referral_code,event_type) VALUES (?,'VISIT')`).run(code);
    res.json({ok:true});
  });

  publicRouter.post('/waitlist', (req,res) => {
    const body = req.body || {};
    const alias = String(body.alias || '').trim().slice(0,30);
    const age = safeInt(body.age, 0);
    const email = String(body.email || '').trim().toLowerCase().slice(0,320);
    const citySlug = normalizeCity(body.city);
    const publicProfile = body.publicProfile === true ? 1 : 0;
    const marketingConsent = body.marketingConsent === true ? 1 : 0;
    const referredBy = String(body.referredBy || '').trim().slice(0,80) || null;

    if (!alias || age < 18 || age > 99 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !citySlug) {
      return res.status(400).json({error:'Revisa nombre, edad, email y ciudad.'});
    }
    if (!marketingConsent) {
      return res.status(400).json({error:'Es necesario aceptar las comunicaciones relacionadas con la lista y el lanzamiento.'});
    }

    const city = db.prepare(`SELECT * FROM launch_cities WHERE slug=?`).get(citySlug);
    if (!city) return res.status(400).json({error:'Ciudad no disponible.'});

    const existing = db.prepare(`
      SELECT id, alias, referral_code AS referralCode, city_slug AS city
      FROM launch_waitlist_users WHERE email=?
    `).get(email);

    if (existing) {
      const stats = cityStats(db, existing.city);
      return res.json({
        ok:true,
        alreadyRegistered:true,
        referralCode:existing.referralCode,
        referralUrl:`${baseUrl}/espera?ref=${encodeURIComponent(existing.referralCode)}`,
        city:stats
      });
    }

    let referralCode;
    do { referralCode = makeReferralCode(alias, citySlug); }
    while (db.prepare(`SELECT 1 FROM launch_waitlist_users WHERE referral_code=?`).get(referralCode));

    const insert = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO launch_waitlist_users
        (alias,age,email,city_slug,public_profile,marketing_consent,referral_code,referred_by)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(alias,age,email,citySlug,publicProfile,marketingConsent,referralCode,referredBy);

      if (referredBy) {
        const refExists = db.prepare(`SELECT 1 FROM launch_waitlist_users WHERE referral_code=?`).get(referredBy);
        if (refExists) {
          db.prepare(`
            INSERT INTO launch_referral_events(referral_code,event_type)
            VALUES (?,'SIGNUP')
          `).run(referredBy);
        }
      }

      const referralUrl = `${baseUrl}/espera?ref=${encodeURIComponent(referralCode)}`;
      queueEmail(db, {
        waitlistUserId:Number(result.lastInsertRowid),
        email,
        subject:`Ya estás esperando V/R Match en ${city.name} 🔥`,
        template:'WAITLIST_WELCOME',
        payload:{alias,city:city.name,referralUrl}
      });

      refreshCityReadyState(db, citySlug);
      return Number(result.lastInsertRowid);
    });

    try {
      const id = insert();
      res.status(201).json({
        ok:true,
        id,
        referralCode,
        referralUrl:`${baseUrl}/espera?ref=${encodeURIComponent(referralCode)}`,
        city:cityStats(db, citySlug)
      });
    } catch(err) {
      console.error('[launch waitlist]', err);
      res.status(500).json({error:'No se pudo completar el registro.'});
    }
  });

  publicRouter.get('/activation/:token', (req,res) => {
    const hash = sha256(String(req.params.token || ''));
    const row = db.prepare(`
      SELECT
        t.id AS tokenId, t.expires_at AS expiresAt, t.used_at AS usedAt,
        u.id AS waitlistUserId, u.alias, u.email, u.city_slug AS citySlug, u.status,
        c.name AS cityName, c.status AS cityStatus
      FROM launch_activation_tokens t
      JOIN launch_waitlist_users u ON u.id=t.waitlist_user_id
      JOIN launch_cities c ON c.slug=u.city_slug
      WHERE t.token_hash=?
    `).get(hash);

    if (!row) return res.status(404).json({error:'Enlace no válido.'});
    if (row.usedAt) return res.status(410).json({error:'Este enlace ya fue utilizado.'});
    if (new Date(row.expiresAt).getTime() < Date.now()) return res.status(410).json({error:'Este enlace ha caducado.'});
    if (row.cityStatus !== 'ACTIVE') return res.status(403).json({error:'La ciudad todavía no está activa.'});

    res.json({
      ok:true,
      alias:row.alias,
      city:row.cityName,
      expiresAt:row.expiresAt
    });
  });

  publicRouter.post('/activation/:token/claim', (req,res) => {
    const raw = String(req.params.token || '');
    const hash = sha256(raw);
    const row = db.prepare(`
      SELECT t.id AS tokenId, t.expires_at AS expiresAt, t.used_at AS usedAt,
             u.id AS waitlistUserId, u.city_slug AS citySlug,
             c.status AS cityStatus
      FROM launch_activation_tokens t
      JOIN launch_waitlist_users u ON u.id=t.waitlist_user_id
      JOIN launch_cities c ON c.slug=u.city_slug
      WHERE t.token_hash=?
    `).get(hash);

    if (!row) return res.status(404).json({error:'Enlace no válido.'});
    if (row.usedAt) return res.status(410).json({error:'Este enlace ya fue utilizado.'});
    if (new Date(row.expiresAt).getTime() < Date.now()) return res.status(410).json({error:'Este enlace ha caducado.'});
    if (row.cityStatus !== 'ACTIVE') return res.status(403).json({error:'La ciudad todavía no está activa.'});

    // El token NO se marca usado aquí: todavía falta crear/vincular la cuenta real.
    // La ruta existente de completar perfil debe finalizarlo mediante finalizeActivation().
    res.cookie('vr_launch_token', raw, {
      httpOnly:true,
      secure:cookieSecure,
      sameSite:'lax',
      maxAge:7*DAY_MS,
      path:'/'
    });
    res.json({ok:true,nextUrl:completeProfileUrl});
  });

  // -------- ADMIN API --------
  adminRouter.use(adminGuard);
  adminRouter.use(express.json({limit:'100kb'}));

  adminRouter.get('/summary', (req,res) => {
    const totals = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status='ACTIVATED' THEN 1 ELSE 0 END) AS activated,
        SUM(CASE WHEN date(created_at)=date('now') THEN 1 ELSE 0 END) AS today,
        SUM(CASE WHEN referred_by IS NOT NULL THEN 1 ELSE 0 END) AS referred
      FROM launch_waitlist_users
      WHERE status != 'BLOCKED'
    `).get();

    const mail = db.prepare(`
      SELECT
        SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status='ERROR' THEN 1 ELSE 0 END) AS errors
      FROM launch_mail_queue
    `).get();

    res.json({
      total:Number(totals.total||0),
      activated:Number(totals.activated||0),
      today:Number(totals.today||0),
      referred:Number(totals.referred||0),
      pendingMail:Number(mail.pending||0),
      mailErrors:Number(mail.errors||0)
    });
  });

  adminRouter.get('/cities', (req,res) => {
    const cities = allCityStats(db).map(r => ({
      ...r,
      current:Number(r.current),
      goal:Number(r.goal),
      percent:Math.min(100,Math.round(Number(r.current)/Number(r.goal)*100))
    }));
    res.json({cities});
  });

  adminRouter.get('/cities/:slug/users', (req,res) => {
    const slug=normalizeCity(req.params.slug);
    const limit=Math.min(500,Math.max(1,safeInt(req.query.limit,100)));
    const offset=Math.max(0,safeInt(req.query.offset,0));
    const q=String(req.query.q||'').trim();
    const like=`%${q}%`;

    const users=db.prepare(`
      SELECT
        u.id,u.alias,u.age,u.email,u.city_slug AS city,u.public_profile AS publicProfile,
        u.referral_code AS referralCode,u.referred_by AS referredBy,u.status,u.app_user_id AS appUserId,
        u.activation_sent_at AS activationSentAt,u.activated_at AS activatedAt,u.created_at AS createdAt,
        (SELECT COUNT(*) FROM launch_waitlist_users x WHERE x.referred_by=u.referral_code) AS successfulInvites,
        (SELECT COUNT(*) FROM launch_referral_events e WHERE e.referral_code=u.referral_code AND e.event_type='VISIT') AS referralVisits
      FROM launch_waitlist_users u
      WHERE u.city_slug=?
        AND (?='' OR u.alias LIKE ? OR u.email LIKE ? OR u.referral_code LIKE ?)
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `).all(slug,q,like,like,like,limit,offset);

    const count=db.prepare(`
      SELECT COUNT(*) AS count
      FROM launch_waitlist_users u
      WHERE u.city_slug=? AND (?='' OR u.alias LIKE ? OR u.email LIKE ? OR u.referral_code LIKE ?)
    `).get(slug,q,like,like,like);

    res.json({users,total:Number(count.count)});
  });

  adminRouter.patch('/cities/:slug/goal', (req,res) => {
    const slug=normalizeCity(req.params.slug);
    const goal=safeInt(req.body?.goal,0);
    if (goal<1 || goal>1000000) return res.status(400).json({error:'Objetivo no válido'});
    const result=db.prepare(`
      UPDATE launch_cities SET target_users=?,updated_at=CURRENT_TIMESTAMP WHERE slug=?
    `).run(goal,slug);
    if (!result.changes) return res.status(404).json({error:'Ciudad no encontrada'});
    res.json({ok:true,city:refreshCityReadyState(db,slug)});
  });

  adminRouter.post('/cities/:slug/unlock', async (req,res) => {
    const slug=normalizeCity(req.params.slug);
    const city=cityStats(db,slug);
    if (!city) return res.status(404).json({error:'Ciudad no encontrada'});
    if (city.status==='ACTIVE') return res.json({ok:true,alreadyActive:true,city});

    const now=new Date().toISOString();
    const expiresAt=isoPlusDays(7);

    const activate=db.transaction(() => {
      db.prepare(`
        UPDATE launch_cities
        SET status='ACTIVE', activated_at=?, updated_at=CURRENT_TIMESTAMP
        WHERE slug=?
      `).run(now,slug);

      const users=db.prepare(`
        SELECT id,alias,email
        FROM launch_waitlist_users
        WHERE city_slug=? AND status='WAITLIST'
      `).all(slug);

      let queued=0;
      for (const u of users) {
        const raw=randomToken();
        const hash=sha256(raw);
        db.prepare(`
          INSERT INTO launch_activation_tokens(waitlist_user_id,token_hash,expires_at)
          VALUES (?,?,?)
        `).run(u.id,hash,expiresAt);

        const activationUrl=`${baseUrl}/activar?token=${encodeURIComponent(raw)}`;
        queueEmail(db,{
          waitlistUserId:u.id,
          email:u.email,
          subject:`${city.name} está abierta 🔓 Entra en V/R Match`,
          template:'CITY_UNLOCKED',
          payload:{
            alias:u.alias,
            city:city.name,
            activationUrl,
            expiresLabel:new Date(expiresAt).toLocaleDateString('es-ES')
          }
        });

        db.prepare(`
          UPDATE launch_waitlist_users
          SET status='CITY_READY',activation_sent_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(u.id);
        queued++;
      }
      return queued;
    });

    try {
      const queued=activate();
      const mailResult=await trySendQueuedMail(db,{resendApiKey,mailFrom,baseUrl,limit:500});
      res.json({
        ok:true,
        city:cityStats(db,slug),
        activationEmailsQueued:queued,
        mail:mailResult
      });
    } catch(err) {
      console.error('[launch unlock]',err);
      res.status(500).json({error:'No se pudo desbloquear la ciudad.'});
    }
  });

  adminRouter.post('/mail/send', async (req,res) => {
    try {
      const result=await trySendQueuedMail(db,{
        resendApiKey,mailFrom,baseUrl,
        limit:Math.min(500,Math.max(1,safeInt(req.body?.limit,100)))
      });
      res.json({ok:true,...result});
    } catch(err) {
      res.status(500).json({error:String(err?.message||err)});
    }
  });

  adminRouter.get('/cities/:slug/export.csv', (req,res) => {
    const slug=normalizeCity(req.params.slug);
    const rows=db.prepare(`
      SELECT id,alias,age,email,city_slug,public_profile,referral_code,referred_by,status,
             app_user_id,activation_sent_at,activated_at,created_at
      FROM launch_waitlist_users WHERE city_slug=? ORDER BY created_at ASC
    `).all(slug);

    const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;
    const headers=['id','alias','age','email','city_slug','public_profile','referral_code','referred_by','status','app_user_id','activation_sent_at','activated_at','created_at'];
    const csv=[
      headers.join(','),
      ...rows.map(r=>headers.map(h=>esc(r[h])).join(','))
    ].join('\n');

    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename="vr-match-${slug}-waitlist.csv"`);
    res.send('\ufeff'+csv);
  });

  // Función para que el auth/perfil existente finalice la activación
  // después de crear o identificar el usuario real de V/R Match.
  function finalizeActivation(rawToken, appUserId) {
    const hash=sha256(String(rawToken||''));
    const token=db.prepare(`
      SELECT t.id AS tokenId,t.waitlist_user_id AS waitlistUserId,t.used_at AS usedAt,t.expires_at AS expiresAt
      FROM launch_activation_tokens t
      WHERE t.token_hash=?
    `).get(hash);

    if (!token) throw new Error('TOKEN_INVALID');
    if (token.usedAt) throw new Error('TOKEN_USED');
    if (new Date(token.expiresAt).getTime()<Date.now()) throw new Error('TOKEN_EXPIRED');

    db.transaction(()=>{
      db.prepare(`UPDATE launch_activation_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=?`).run(token.tokenId);
      db.prepare(`
        UPDATE launch_waitlist_users
        SET status='ACTIVATED',app_user_id=?,activated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(appUserId,token.waitlistUserId);
    })();

    return db.prepare(`SELECT * FROM launch_waitlist_users WHERE id=?`).get(token.waitlistUserId);
  }

  return {publicRouter,adminRouter,finalizeActivation,sendQueuedMail:()=>trySendQueuedMail(db,{resendApiKey,mailFrom,baseUrl})};
}
