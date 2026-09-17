# V/R Match — sistema real de lanzamiento / lista de espera

Este paquete convierte el concepto de la landing en un módulo de backend para el stack documentado de V/R Match:

- Node.js 22
- Express
- SQLite
- frontend HTML/CSS/JS vanilla

## Qué queda implementado

### Público

`GET /api/launch/cities`
- contador real por ciudad;
- meta;
- porcentaje;
- estado WAITING / READY / ACTIVE.

`POST /api/launch/waitlist`
- registra alias, edad, email y ciudad;
- guarda consentimiento;
- genera código personal;
- atribuye referido;
- pone email de bienvenida en cola;
- cambia automáticamente la ciudad a `READY` cuando llega a la meta.

`GET /api/launch/cities/:slug/people`
- solo devuelve perfiles que hayan consentido aparecer públicamente;
- no expone email ni datos privados.

`POST /api/launch/referrals/visit`
- registra visitas de enlaces de invitación.

### Administración

Ruta visual propuesta:

`/admin/launch`

API:

- `GET /api/admin/launch/summary`
- `GET /api/admin/launch/cities`
- `GET /api/admin/launch/cities/:slug/users`
- `PATCH /api/admin/launch/cities/:slug/goal`
- `POST /api/admin/launch/cities/:slug/unlock`
- `GET /api/admin/launch/cities/:slug/export.csv`
- `POST /api/admin/launch/mail/send`

El panel permite:
- ver total y altas de hoy;
- comparar ciudades;
- ver porcentaje de cada ciudad;
- buscar usuarios;
- revisar códigos / invitados / visitas;
- cambiar meta;
- exportar;
- desbloquear;
- procesar emails pendientes.

### Desbloqueo

Cuando el administrador desbloquea una ciudad:

1. `launch_cities.status` pasa a `ACTIVE`.
2. Cada usuario `WAITLIST` de esa ciudad pasa a `CITY_READY`.
3. Se genera un token aleatorio de 256 bits.
4. En SQLite se guarda únicamente el SHA-256 del token.
5. El token expira en 7 días.
6. Se crea un email individual de activación.
7. El botón del email lleva a `/activar?token=...`.
8. `/activar` valida el token y la ciudad.
9. El usuario pulsa "Entrar en V/R Match".
10. El servidor guarda temporalmente el token en cookie HTTP-only.
11. Se redirige a `/complete-profile`.

## La única unión que falta con el código fuente real

El documento de estado no incluye las tablas de usuario, login ni el middleware admin. Por seguridad, este paquete NO inventa esos nombres.

Hay que conectar dos cosas reales del repositorio:

1. `adminGuard`
   - middleware con el que V/R Match protege hoy su Admin.

2. Al finalizar el alta/perfil real:
   ```js
   const rawToken = req.cookies?.vr_launch_token;
   if (rawToken) {
     launch.finalizeActivation(rawToken, req.user.id);
     res.clearCookie('vr_launch_token', { path:'/' });
   }
   ```

Eso vincula la persona de la lista con su usuario auténtico.

## Base de datos

Ejecuta `migration.sql` en la SQLite existente.

El módulo espera un objeto DB con API síncrona compatible con `better-sqlite3`.

Si el proyecto usa otra librería SQLite, no cambies las tablas: solo hay que adaptar las llamadas `prepare/get/all/run/transaction`.

## Emails

Se incluye envío con la API HTTP de Resend usando `fetch` nativo de Node 22.

Variables:

```env
APP_BASE_URL=https://tu-dominio
RESEND_API_KEY=re_...
MAIL_FROM=V/R Match <acceso@tu-dominio>
```

Si todavía no se configura el proveedor, los emails NO se pierden:
se quedan en `launch_mail_queue` como `PENDING`.

## Archivos

- `migration.sql`: nuevas tablas.
- `launch-module.mjs`: API y lógica principal.
- `server-integration.example.mjs`: puntos de montaje.
- `public/waitlist.html`: landing conectada al backend.
- `public/admin-launch.html`: panel administrador.
- `public/activate.html`: entrada del usuario cuando se desbloquea.
- `.env.example`: configuración.

## Importante antes de producción

- sustituir `/complete-profile` por la ruta real si se llama de otra forma;
- conectar `requireAdmin` real;
- hacer backup de SQLite antes de migrar;
- probar primero con una ciudad de prueba y 2–3 emails internos;
- usar perfiles públicos únicamente cuando `public_profile=1`;
- no mostrar ubicación exacta, teléfono, apellido ni email en V/R People.
