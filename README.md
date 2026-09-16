# V/R Match · Step 3 — cuentas, persistencia y seguridad

V/R Match combina una experiencia de dating con un juego multijugador de preguntas y retos para romper el hielo después del match.

## Lo nuevo en Step 3

- Registro e inicio de sesión con correo y contraseña.
- Contraseñas derivadas con `scrypt` + salt aleatorio usando `crypto` de Node.js.
- Sesiones persistentes de 30 días mediante token aleatorio almacenado de forma hasheada en SQLite.
- Base de datos SQLite para usuarios, perfiles, likes, passes, matches, mensajes, bloqueos y denuncias.
- Matches y conversaciones sobreviven reinicios del servidor.
- Hasta 4 fotos por perfil almacenadas en `/uploads` en lugar de mantenerlas solo en memoria/base64.
- Preferencias permanentes: rango de edad, género/personas que deseas conocer, ciudad e interés compartido.
- Descubrimiento compatible en ambos sentidos: no muestra perfiles que quedan fuera de las preferencias mutuas.
- Historial de chat persistente.
- Bloquear elimina el match activo e impide que ambos perfiles vuelvan a descubrirse.
- Denunciar guarda un registro separado para revisión.
- El juego multijugador existente se conserva y sigue iniciándose desde un match activo.

## Requisitos

- Node.js 20 o superior.

## Ejecutar

```bash
npm install
npm start
```

Abre `http://localhost:3000`.

Para probar un match real, crea dos cuentas diferentes en dos navegadores o perfiles de navegador. Completa ambos perfiles, asegúrate de que las preferencias sean compatibles y da like desde ambos lados.

## Datos locales

- Base de datos: `data/vrmatch.db`
- Fotos: `uploads/`

Ambas rutas están ignoradas por Git salvo el `.gitkeep` de `uploads`.

## Antes de producción pública

Este Step 3 es una arquitectura funcional para validación. Antes de lanzar públicamente conviene añadir verificación de correo, recuperación de contraseña, rate limiting, CSRF/origin hardening, moderación de imágenes, panel de administración para denuncias, términos/privacidad, eliminación/exportación de cuenta y almacenamiento de imágenes en un servicio externo (S3/R2/Cloudinary equivalente).

## Deploy en GitHub + Render

### GitHub
Sube al root del repositorio al menos: `index.html`, `styles.css`, `server.js`, `package.json`, `.gitignore` y `render.yaml`.
No subas `node_modules/`, `data/*.db*`, `uploads/*` ni `.env`.

### Render (recomendado: persistencia)
Este proyecto está preparado para un Persistent Disk montado en `/var/data`.
La variable `VR_STORAGE_DIR=/var/data` hace que SQLite y las fotos se guarden en ese disco.

Opción Blueprint:
1. Sube `render.yaml` a GitHub.
2. En Render: New > Blueprint.
3. Selecciona el repositorio.
4. Revisa el servicio y crea el Blueprint.

Opción manual sobre un Web Service existente:
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/healthz`
- Environment: `VR_STORAGE_DIR=/var/data`
- Persistent Disk mount path: `/var/data`

Render proporciona `PORT` automáticamente; no hace falta configurarlo manualmente.
