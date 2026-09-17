// server-integration.example.mjs
// EJEMPLO de integración. Ajusta imports/rutas a tu servidor real.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLaunchSystem } from './launch-module.mjs';

// Estos dos imports SON deliberadamente placeholders:
// usa la instancia DB y el middleware admin que YA tiene V/R Match.
import db from './TU-RUTA-REAL/db.mjs';
import { requireAdmin } from './TU-RUTA-REAL/admin-auth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function installLaunchSystem(app) {
  // Ejecutar una sola vez al desplegar o en tu sistema de migraciones:
  // db.exec(fs.readFileSync('./migration.sql','utf8'));

  const launch = createLaunchSystem({
    db,
    adminGuard: requireAdmin,
    baseUrl: process.env.APP_BASE_URL,              // ej. https://vrmatch.app
    completeProfileUrl: '/complete-profile',
    resendApiKey: process.env.RESEND_API_KEY,
    mailFrom: process.env.MAIL_FROM
  });

  // APIs
  app.use('/api/launch', launch.publicRouter);
  app.use('/api/admin/launch', launch.adminRouter);

  // Páginas
  app.get('/espera', (req,res) =>
    res.sendFile(path.join(__dirname,'public','waitlist.html'))
  );
  app.get('/activar', (req,res) =>
    res.sendFile(path.join(__dirname,'public','activate.html'))
  );

  // IMPORTANTE: protege también el HTML del panel.
  app.get('/admin/launch', requireAdmin, (req,res) =>
    res.sendFile(path.join(__dirname,'public','admin-launch.html'))
  );

  return launch;
}

/*
INTEGRACIÓN FINAL CON TU REGISTRO/PERFIL EXISTENTE
--------------------------------------------------
En la ruta donde V/R Match termina de crear el usuario/perfil:

const rawToken = req.cookies?.vr_launch_token;
if (rawToken) {
  launch.finalizeActivation(rawToken, req.user.id);
  res.clearCookie('vr_launch_token', { path:'/' });
}

Así el usuario pasa:
WAITLIST -> CITY_READY -> ACTIVATED

No cambies el auth existente por este módulo. Este módulo se engancha al final.
*/
