# Integración con el backend actual de V/R Match

Este módulo se diseñó para el stack documentado del proyecto: Node.js 22 + Express + SQLite.

## Orden de integración

1. Ejecutar `schema.sql` en la base de datos.
2. Adaptar `waitlist-router.example.js` al módulo de DB ya existente en V/R Match.
3. Montar el router en Express:
   `app.use('/api', waitlistRouter)`.
4. En `app.js` de la landing, sustituir los datos demo por:
   - `GET /api/cities`
   - `GET /api/cities/:slug/people`
   - `POST /api/waitlist`
5. Leer `?ref=CODIGO` al cargar la landing y enviarlo como `referredBy`.
6. Registrar la visita una sola vez por sesión con `POST /api/referrals/visit`.

## Regla de privacidad pública

La ruta `/api/cities/:slug/people` está planteada para devolver únicamente:
- alias;
- edad;
- ciudad;
- más adelante: intereses y foto aprobada.

No debe devolver:
- email;
- teléfono;
- apellido;
- IP;
- ubicación exacta;
- coordenadas;
- distancia exacta;
- historial de chat;
- respuestas de partidas.

## Datos demo

Los nombres, cifras y perfiles que aparecen en la landing son ficticios. Antes de publicar:
- sustituir cifras por datos reales;
- no simular actividad inexistente;
- mostrar perfiles únicamente con consentimiento explícito.
