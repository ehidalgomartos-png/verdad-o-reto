
// waitlist-router.example.js
// Adaptar el import de DB a la conexión SQLite que ya use V/R Match.
//
// Uso sugerido en Express:
//   import waitlistRouter from './waitlist-router.js';
//   app.use('/api', waitlistRouter);

import express from 'express';
import crypto from 'node:crypto';

// Sustituir por vuestra instancia real.
// Este ejemplo espera una API estilo better-sqlite3:
// db.prepare(sql).get/run/all(...)
import db from './db.js';

const router = express.Router();

function slugifyCity(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-');
}

function makeReferralCode(alias = 'VR', citySlug = 'city') {
  const cleanAlias = alias
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5) || 'VR';

  const city = citySlug.replace(/[^a-z0-9]/g, '').slice(0, 3).toUpperCase() || 'VR';
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `VR-${cleanAlias}-${city}${random}`;
}

function cityStats(citySlug) {
  return db.prepare(`
    SELECT
      c.city_slug AS slug,
      c.city_name AS name,
      c.target_users AS goal,
      c.is_unlocked AS isUnlocked,
      COUNT(w.id) AS current
    FROM city_launches c
    LEFT JOIN waitlist_users w ON w.city_slug = c.city_slug
    WHERE c.city_slug = ?
    GROUP BY c.id
  `).get(citySlug);
}

router.get('/cities', (req, res) => {
  const rows = db.prepare(`
    SELECT
      c.city_slug AS slug,
      c.city_name AS name,
      c.target_users AS goal,
      c.is_unlocked AS isUnlocked,
      COUNT(w.id) AS current
    FROM city_launches c
    LEFT JOIN waitlist_users w ON w.city_slug = c.city_slug
    GROUP BY c.id
    ORDER BY current DESC, c.city_name ASC
  `).all();

  res.json(rows.map(r => ({
    ...r,
    percent: Math.min(100, Math.round((r.current / r.goal) * 100))
  })));
});

router.get('/cities/:slug/people', (req, res) => {
  const slug = slugifyCity(req.params.slug);
  const limit = Math.min(Number(req.query.limit) || 12, 24);

  // IMPORTANTE:
  // Esta lista solo devuelve usuarios que hayan dado consentimiento público.
  // No expone email, referido, ubicación exacta ni otros datos privados.
  const people = db.prepare(`
    SELECT
      id,
      alias,
      age,
      city_slug AS city
    FROM waitlist_users
    WHERE city_slug = ?
      AND public_profile = 1
    ORDER BY created_at DESC
    LIMIT ?
  `).all(slug, limit);

  res.json({ people });
});

router.post('/waitlist', express.json(), (req, res) => {
  const {
    alias,
    age,
    email,
    city,
    publicProfile = false,
    referredBy = null
  } = req.body || {};

  const citySlug = slugifyCity(city);
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanAlias = String(alias || '').trim().slice(0, 30);
  const numericAge = Number(age);

  if (!cleanAlias || !cleanEmail || !citySlug || !Number.isInteger(numericAge) || numericAge < 18 || numericAge > 99) {
    return res.status(400).json({ error: 'Datos no válidos.' });
  }

  const cityRow = db.prepare(`SELECT city_slug FROM city_launches WHERE city_slug = ?`).get(citySlug);
  if (!cityRow) {
    return res.status(400).json({ error: 'Ciudad no disponible.' });
  }

  const existing = db.prepare(`SELECT id, referral_code FROM waitlist_users WHERE email = ?`).get(cleanEmail);
  if (existing) {
    return res.status(200).json({
      ok: true,
      alreadyRegistered: true,
      referralCode: existing.referral_code,
      stats: cityStats(citySlug)
    });
  }

  let referralCode;
  do {
    referralCode = makeReferralCode(cleanAlias, citySlug);
  } while (db.prepare(`SELECT 1 FROM waitlist_users WHERE referral_code = ?`).get(referralCode));

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO waitlist_users
        (alias, age, email, city_slug, public_profile, referral_code, referred_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      cleanAlias,
      numericAge,
      cleanEmail,
      citySlug,
      publicProfile ? 1 : 0,
      referralCode,
      referredBy || null
    );

    if (referredBy) {
      db.prepare(`
        INSERT INTO referral_events(referral_code, event_type)
        VALUES (?, 'signup')
      `).run(referredBy);
    }

    const stats = cityStats(citySlug);
    if (stats && stats.current >= stats.goal && !stats.isUnlocked) {
      db.prepare(`
        UPDATE city_launches
        SET is_unlocked = 1,
            unlocked_at = CURRENT_TIMESTAMP
        WHERE city_slug = ?
      `).run(citySlug);
    }
  });

  try {
    transaction();
    res.status(201).json({
      ok: true,
      referralCode,
      stats: cityStats(citySlug)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo completar el registro.' });
  }
});

router.post('/referrals/visit', express.json(), (req, res) => {
  const code = String(req.body?.code || '').trim();

  if (!code) return res.status(400).json({ error: 'Código requerido.' });

  const exists = db.prepare(`
    SELECT 1 FROM waitlist_users WHERE referral_code = ?
  `).get(code);

  if (!exists) return res.status(404).json({ error: 'Código no encontrado.' });

  db.prepare(`
    INSERT INTO referral_events(referral_code, event_type)
    VALUES (?, 'visit')
  `).run(code);

  res.json({ ok: true });
});

router.get('/referrals/:code', (req, res) => {
  const code = String(req.params.code || '').trim();

  const owner = db.prepare(`
    SELECT alias, city_slug AS city
    FROM waitlist_users
    WHERE referral_code = ?
  `).get(code);

  if (!owner) return res.status(404).json({ error: 'Código no encontrado.' });

  const visits = db.prepare(`
    SELECT COUNT(*) AS count
    FROM referral_events
    WHERE referral_code = ? AND event_type = 'visit'
  `).get(code).count;

  const signups = db.prepare(`
    SELECT COUNT(*) AS count
    FROM waitlist_users
    WHERE referred_by = ?
  `).get(code).count;

  res.json({ ...owner, code, visits, signups });
});

export default router;
