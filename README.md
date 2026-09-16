# V/R Match · Fase 6 — proximidad y descubrimiento

Esta versión continúa el MVP ya desplegado en GitHub + Render y conserva el flujo principal:

**Descubrir → Like → Match → Chat → Juego → volver al Chat**

La Fase 6 añade proximidad opcional sin revelar coordenadas exactas entre usuarios.

## Novedades de la Fase 6

- Botón **Usar mi ubicación** dentro del perfil.
- La ubicación es **opcional** y puede eliminarse posteriormente.
- El navegador solicita permiso antes de obtenerla.
- El servidor redondea latitud/longitud a 3 decimales antes de guardarlas.
- Las coordenadas nunca se envían a otros perfiles.
- Tampoco se comparten con otros usuarios las preferencias privadas, el radio configurado ni la fecha de actualización de ubicación.
- En las tarjetas solo aparece una distancia aproximada, por ejemplo:
  - `a menos de 1 km`
  - `a 8 km`
  - `a 42 km`
- Radio permanente configurable: **5, 15, 30, 50, 100 o 200 km**.
- Cuando el usuario tiene ubicación activada, Descubrir filtra por ese radio y ordena por proximidad.
- Filtro rápido de distancia en Descubrir para reducir aún más los resultados.
- Si no se activa ubicación, la app continúa funcionando con ciudad y los filtros existentes.
- `Permissions-Policy` habilita geolocalización únicamente para el propio sitio.
- Migraciones automáticas: no es necesario borrar la base SQLite existente.

## Fases anteriores conservadas

- Cuentas +18, login y sesiones persistentes.
- Perfiles, preferencias, likes, passes y matches.
- Chat persistente.
- Juego integrado en el chat.
- Bloqueo, denuncia, deshacer match y privacidad.
- Moderación y administración.
- Recuperación de contraseña.
- Verificación de correo.
- Rate limiting y controles anti-spam.
- Validación de propiedad de fotos subidas.
- Invitaciones de juego con consentimiento y caducidad.

## Archivos principales

```text
index.html
styles.css
server.js
package.json
render.yaml
.env.example
```

No subas `.env`, `node_modules`, bases `.db`, fotos reales de usuarios ni claves API al repositorio.

## Ejecutar en local

Requiere Node.js 22.

```bash
npm install
npm start
```

Abre:

```text
http://localhost:3000
```

## Actualizar GitHub + Render

Servicio actual:

```text
https://verdad-o-reto-zz0k.onrender.com
```

1. Sustituye en GitHub los archivos anteriores por los de esta carpeta.
2. Haz commit y push a `main`.
3. Render realizará el Auto-Deploy.
4. En Logs debe aparecer aproximadamente:

```text
V/R Match v6.0 escuchando en puerto 10000
Email SMTP: configurado | verificación obligatoria: false
```

5. Comprueba:

```text
/healthz
```

Resultado esperado:

```json
{"ok":true,"db":true,"version":"6.0.0"}
```

## Render Free durante desarrollo

Esta copia de `render.yaml` **no solicita Persistent Disk** porque el proyecto sigue usando Render Free durante desarrollo.

En Free, SQLite y las fotos del filesystem deben considerarse temporales: pueden perderse con reinicios o redeploys. El upgrade de Render y la persistencia definitiva se han pospuesto para el cierre de la etapa de desarrollo.

Cuando se pase a un plan compatible con disco persistente podrá volver a configurarse:

```text
VR_STORAGE_DIR=/var/data
```

con un Persistent Disk montado en:

```text
/var/data
```

## Email actual

La Fase 5 ya fue validada con Resend.

En Render Free se usa el puerto alternativo:

```text
SMTP_HOST=smtp.resend.com
SMTP_PORT=2465
SMTP_USER=resend
SMTP_PASS=<API KEY EN RENDER, NUNCA EN GITHUB>
SMTP_SECURE=true
```

Por ahora se mantiene:

```text
VR_REQUIRE_EMAIL_VERIFICATION=false
```

El dominio propio, el remitente profesional y la verificación obligatoria se dejan para la etapa final junto con el upgrade de Render.

## Probar la geolocalización

Usa dos cuentas de prueba.

1. En Cuenta A entra a **Editar perfil**.
2. Pulsa **Usar mi ubicación** y acepta el permiso del navegador.
3. Elige un radio, por ejemplo `50 km`.
4. Guarda el perfil.
5. Repite el proceso en Cuenta B.
6. Abre Descubrir.
7. Comprueba que la tarjeta muestra ciudad + distancia aproximada.
8. Cambia el radio a uno menor y verifica que el filtrado responde.
9. Prueba **Quitar ubicación**, guarda y verifica que la app vuelve a funcionar mediante los filtros tradicionales.

### Privacidad de ubicación

- La ubicación nunca se activa automáticamente.
- El usuario debe pulsar el botón y aceptar el permiso del navegador.
- El servidor redondea las coordenadas antes de almacenarlas.
- Los clientes de otros usuarios no reciben latitud ni longitud ni metadatos de ubicación.
- Solo reciben `distanceKm`, ya redondeada, además de los datos públicos del perfil.
- El usuario puede eliminar la ubicación desde su perfil.

## Pendiente para producción

Antes de una apertura pública grande:

- dominio propio;
- remitente de correo propio en Resend;
- `VR_REQUIRE_EMAIL_VERIFICATION=true`;
- upgrade de Render o migración a infraestructura persistente;
- almacenamiento externo para imágenes;
- backups;
- políticas legales y privacidad definitivas;
- moderación reforzada de imágenes/contenido;
- observabilidad y auditoría.
