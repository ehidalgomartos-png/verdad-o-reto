# V/R Match · Fase 4 — seguridad, recuperación y moderación

Esta versión parte del MVP que ya funciona en GitHub + Render y mantiene el flujo **Descubrir → Match → Chat → Juego**, añadiendo una capa de seguridad y administración sin borrar la base de datos de Fase 3.

## Qué incorpora la Fase 4

- Registro e inicio de sesión +18 con contraseñas derivadas mediante `scrypt` y salt aleatorio.
- Sesiones de 30 días con tokens aleatorios guardados de forma hasheada en SQLite.
- Migraciones compatibles con la base existente: no hace falta borrar `vrmatch.db`.
- Recuperación de contraseña mediante enlace temporal de 45 minutos.
- Verificación de correo preparada mediante enlace temporal de 24 horas.
- Verificación de correo **no obligatoria por defecto** para no bloquear usuarios existentes.
- Cambio de contraseña desde **Cuenta y seguridad**; cierra el resto de sesiones.
- Privacidad: pausar aparición en Descubrir, ocultar estado online y desactivar invitaciones de juego.
- Eliminación permanente de cuenta, datos asociados y fotos subidas.
- Rate limiting en registro, login, recuperación, likes, passes, chat y denuncias.
- Protección frente a mensajes duplicados enviados en pocos segundos.
- Bloqueo y denuncia de usuarios.
- Panel de administración para revisar denuncias, resolverlas, descartarlas o suspender una cuenta.
- Estadísticas básicas para administrador: usuarios activos, matches, denuncias abiertas y mensajes.
- CORS configurable y restringido en Render al dominio de la app.
- Cabeceras básicas de seguridad, HTTPS/HSTS en producción y `/healthz`.
- SQLite y uploads preparados para Persistent Disk de Render mediante `VR_STORAGE_DIR=/var/data`.

## Archivos principales

```text
index.html
styles.css
server.js
package.json
render.yaml
.env.example
uploads/.gitkeep
```

No subas `.env`, `node_modules`, bases `.db` locales ni fotos reales de usuarios al repositorio.

## Ejecutar en local

Requiere Node.js 22.

```bash
npm install
npm start
```

Abre `http://localhost:3000`.

## Actualizar tu servicio actual de GitHub + Render

Tu servicio ya está publicado en:

```text
https://verdad-o-reto-zz0k.onrender.com
```

Para actualizarlo:

1. Sustituye en tu repositorio los archivos de la versión anterior por los de esta carpeta.
2. Conserva cualquier configuración que tengas en Render.
3. Haz commit y push a la rama conectada a Render.
4. Render hará Auto-Deploy.
5. En los logs deberías ver `V/R Match v5.0 escuchando en puerto ...`.
6. Abre `/healthz`; debe responder con `ok: true`, `db: true` y `version: 5.0.0`.

La migración añade columnas/tablas nuevas con `CREATE TABLE IF NOT EXISTS` y `ALTER TABLE` solo cuando faltan. No borres la base anterior.

## Variables de Render

### Mínimas

```text
VR_APP_BASE_URL=https://verdad-o-reto-zz0k.onrender.com
VR_ALLOWED_ORIGINS=https://verdad-o-reto-zz0k.onrender.com
VR_REQUIRE_EMAIL_VERIFICATION=false
```

### Persistencia

Si tienes Persistent Disk:

```text
VR_STORAGE_DIR=/var/data
```

Monta el disco exactamente en:

```text
/var/data
```

La base quedará en `/var/data/data/vrmatch.db` y las fotos en `/var/data/uploads/`.

Sin Persistent Disk, la app puede probarse, pero SQLite y las fotos pueden desaparecer en un reinicio/redeploy del servicio.

## Administrador de denuncias

En Render → Environment añade:

```text
VR_ADMIN_EMAILS=tu-correo-real@dominio.com
```

Puedes poner varios correos separados por comas. Al iniciar sesión con una de esas cuentas aparecerá el acceso de administración en **Cuenta y seguridad**.

No hay contraseña de administrador separada: el permiso se concede únicamente a las cuentas cuyo correo figure en `VR_ADMIN_EMAILS`.

## Recuperación de contraseña y verificación de correo

El código ya está integrado, pero para que lleguen emails reales necesitas SMTP.

En Render → Environment configura:

```text
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=V/R Match <no-reply@tu-dominio.com>
SMTP_SECURE=false
```

Para puerto 465 normalmente usa `SMTP_SECURE=true`.

Mientras SMTP no esté configurado, la aplicación sigue funcionando y el servidor indicará `Email SMTP: no configurado`. En ese estado no conviene activar la verificación obligatoria porque el usuario no tendría cómo recibir el enlace.

Cuando SMTP esté probado, puedes activar:

```text
VR_REQUIRE_EMAIL_VERIFICATION=true
```

Las cuentas antiguas procedentes de Fase 3 se migran como verificadas para evitar bloquearlas. Las cuentas nuevas quedan pendientes hasta verificar su correo.

## Prueba recomendada tras el deploy

Usa dos navegadores/perfiles distintos:

1. Entra con dos cuentas existentes y confirma que siguen funcionando.
2. Comprueba Descubrir, like mutuo, match, chat y juego.
3. Cambia una preferencia de privacidad y recarga.
4. Prueba cambiar contraseña.
5. Configura `VR_ADMIN_EMAILS` y comprueba que aparece Moderación.
6. Desde otra cuenta crea una denuncia y revísala desde el panel admin.
7. Cuando configures SMTP, prueba “He olvidado mi contraseña”.
8. Solo después de comprobar el correo, activa verificación obligatoria.

## Seguridad pendiente antes de una apertura grande

Esta fase mejora mucho el MVP, pero para una plataforma de citas pública con volumen todavía conviene añadir: moderación automática/manual de imágenes, política de privacidad y términos legales definitivos, exportación de datos, almacenamiento de objetos externo, backups de base de datos, observabilidad, auditoría más extensa y mecanismos reforzados contra abuso automatizado.
