# V/R Match — Fase 9 · Notificaciones

Versión: **9.0.0**

Esta versión continúa directamente sobre la Fase 8. Mantiene cuentas, perfiles, descubrimiento por proximidad, matches, chat, juego integrado, email/recuperación, moderación avanzada y V/R+.

## Qué añade Fase 9

### Centro de notificaciones dentro de V/R Match
- Campana de notificaciones en la cabecera.
- Contador de avisos no leídos.
- Historial persistente en SQLite.
- Marcar una notificación como leída.
- Marcar todas como leídas.

### Eventos que generan notificaciones
- Nuevo match.
- Nuevo mensaje.
- Invitación a jugar.
- Turno de juego.

### Preferencias por usuario
Cada usuario puede activar o desactivar de forma independiente:
- nuevos matches,
- nuevos mensajes,
- invitaciones a jugar,
- turnos de juego.

### Avisos del navegador
- Con permiso del usuario, V/R Match puede mostrar avisos del navegador mientras la app está abierta.
- Se incluye `sw.js` y la arquitectura de Web Push para recibir avisos en segundo plano.
- El Web Push de fondo es **opcional durante la beta** y solo se activa si se configuran claves VAPID en Render.

### Web Push / VAPID
Variables opcionales:

```text
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
```

Generar un par de claves localmente:

```bash
npm install
npm run vapid
```

No guardar la clave privada en GitHub. Configurar las claves únicamente en `Render → Environment`.

Durante la beta se puede dejar VAPID sin configurar. En ese caso las notificaciones internas siguen funcionando y el navegador puede avisar mientras la app está abierta.

## Deploy

1. Descomprimir el ZIP.
2. Sustituir los archivos del repositorio GitHub.
3. Commit y push a `main`.
4. Render desplegará automáticamente.
5. Revisar logs.
6. Comprobar `/healthz`.

Respuesta esperada:

```json
{"ok":true,"db":true,"version":"9.0.0"}
```

En logs debe aparecer:

```text
V/R Match v9.0 escuchando en puerto 10000
Web Push: opcional / no configurado
```

Si VAPID se configura correctamente:

```text
Web Push: configurado
```

## Beta / producción

Se mantiene durante la beta:
- `VR_REQUIRE_EMAIL_VERIFICATION=false`.
- Render Free y filesystem temporal.
- V/R+ sin cobro real.
- dominio propio pendiente.

Para producción siguen pendientes el dominio, remitente propio de email, almacenamiento persistente/upgrade de Render, checkout real y activación definitiva de Web Push.
