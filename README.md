# V/R Match · Fase 7 — moderación avanzada

Esta versión continúa el MVP de V/R Match ya desplegado en GitHub + Render y conserva el flujo principal:

**Descubrir → Like → Match → Chat → Juego → volver al Chat**

La Fase 7 amplía el panel administrativo para que las denuncias y acciones de moderación puedan gestionarse con trazabilidad real.

## Novedades de la Fase 7

- Centro de moderación con tres áreas:
  - **Denuncias**
  - **Usuarios**
  - **Historial**
- Estadísticas de:
  - usuarios activos;
  - usuarios suspendidos;
  - matches activos;
  - denuncias abiertas;
  - mensajes;
  - acciones administrativas de las últimas 24 h.
- Filtros de denuncias por estado, motivo y búsqueda.
- Las nuevas denuncias guardan como evidencia un contexto limitado de los últimos mensajes de ese match.
- El administrador puede:
  - resolver o descartar denuncias;
  - suspender y reactivar cuentas;
  - ocultar o volver a mostrar un perfil;
  - eliminar fotos de perfil;
  - limpiar una biografía;
  - eliminar mensajes concretos desde la evidencia de una denuncia.
- Cuando un mensaje es eliminado por moderación desaparece también del chat conectado mediante Socket.IO.
- Buscador de usuarios por nombre, correo o ciudad.
- Ficha de moderación por usuario con actividad, denuncias, matches, mensajes y acciones previas.
- Historial de acciones administrativas con administrador, usuario afectado, fecha y nota interna.
- Los usuarios suspendidos dejan de aparecer en Descubrir y en la lista de matches mientras dure la suspensión.
- Migraciones automáticas: no hace falta borrar la base SQLite existente.
- `/healthz` pasa a versión **7.0.0**.

## Privacidad del panel

El panel administrativo no muestra coordenadas exactas de geolocalización. Solo indica si el usuario tiene ubicación configurada.

La evidencia de chat se limita al contexto asociado a una denuncia y se almacena para revisión de seguridad. No se convierte el panel en un explorador general de conversaciones.

## Activar un administrador

Los administradores se controlan exclusivamente mediante una variable de entorno de Render:

```text
VR_ADMIN_EMAILS=correo-admin@ejemplo.com
```

Para varios administradores:

```text
VR_ADMIN_EMAILS=admin1@ejemplo.com,admin2@ejemplo.com
```

No escribas esta configuración dentro de `server.js`.

Después de cambiar `VR_ADMIN_EMAILS`, guarda los cambios en Render y deja que el servicio se redespliegue.

La cuenta indicada debe existir en V/R Match. Al iniciar sesión, en **Cuenta y seguridad** aparecerá:

```text
⚑ Abrir panel de moderación
```

## Fases anteriores conservadas

- Plataforma +18.
- Registro, login y sesiones.
- Perfiles, preferencias, likes, passes y matches.
- Chat persistente.
- Verdad o Reto integrado dentro del chat.
- Regreso al chat al finalizar una partida.
- Bloqueo, denuncia y deshacer match.
- Recuperación de contraseña.
- Verificación de correo.
- Resend mediante SMTP.
- Privacidad de cuenta.
- Geolocalización opcional y descubrimiento por distancia.
- Consentimiento para contenido +18.
- Rate limiting y controles anti-spam.

## Archivos principales

```text
index.html
styles.css
server.js
package.json
render.yaml
.env.example
VR-MATCH-CONTEXTO-PROYECTO.md
PRUEBA-FASE7.md
```

No subas `.env`, `node_modules`, bases `.db`, fotos reales de usuarios ni claves API al repositorio.

## Desplegar

1. Descomprime este paquete.
2. Sustituye en GitHub los archivos de la versión anterior.
3. Commit recomendado:

```text
Fase 7 - moderación avanzada y panel admin
```

4. Push a `main`.
5. Render hará el Auto-Deploy.

En Logs debe aparecer:

```text
V/R Match v7.0 escuchando en puerto 10000
Email SMTP: configurado | verificación obligatoria: false
```

Comprueba:

```text
https://verdad-o-reto-zz0k.onrender.com/healthz
```

Resultado esperado:

```json
{"ok":true,"db":true,"version":"7.0.0"}
```

## Render Free durante desarrollo

Seguimos manteniendo Render Free durante el desarrollo.

No añadas `VR_STORAGE_DIR=/var/data` sin Persistent Disk. SQLite y las fotos locales deben seguir considerándose datos temporales de prueba.

El dominio propio, el upgrade de Render, la persistencia definitiva y `VR_REQUIRE_EMAIL_VERIFICATION=true` siguen aplazados para el cierre de desarrollo.

## Email

La configuración validada continúa siendo compatible con Render Free:

```text
SMTP_HOST=smtp.resend.com
SMTP_PORT=2465
SMTP_USER=resend
SMTP_PASS=<API KEY SOLO EN RENDER>
SMTP_SECURE=true
VR_REQUIRE_EMAIL_VERIFICATION=false
```

## Seguridad de moderación

- Solo un usuario cuyo correo esté incluido en `VR_ADMIN_EMAILS` puede acceder a rutas `/api/admin/*`.
- Las acciones administrativas quedan registradas.
- Suspender una cuenta cierra sus sesiones inmediatamente.
- Reactivar no requiere reconstruir la cuenta.
- Las acciones destructivas del frontend requieren confirmación.
- La ubicación precisa no se expone en el panel.
- La eliminación de mensajes se sincroniza a los usuarios conectados.

## Pendiente para producción

Antes de abrir V/R Match a usuarios reales:

- dominio propio;
- correo profesional verificado en Resend;
- `VR_REQUIRE_EMAIL_VERIFICATION=true`;
- Render de pago + persistencia o migración a base de datos gestionada;
- almacenamiento persistente de imágenes;
- backups;
- términos, privacidad y normativa;
- moderación de imágenes más avanzada;
- observabilidad y alertas.
