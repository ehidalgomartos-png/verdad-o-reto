# Instrucciones de subida

## Sustituir en el repositorio

Sube/reemplaza estos archivos por los incluidos en este paquete:

- `server.js`
- `index.html`
- `styles.css`
- `sw.js`
- `manifest.webmanifest`
- `terms.html`
- `privacy.html`
- `.env.example`
- `render.yaml`
- `README.md`

Añade:

- `como-funciona.html`
- `premium.html`
- `LANZAMIENTO-FASE16-GRATIS-PREMIUM.md`
- `PRUEBA-FASE16.md`
- `ESTADO-FASE16-2026-09-17.md`

Conserva del repositorio actual cualquier archivo que no vino en el envío, especialmente `package.json`, `package-lock.json`, la carpeta `icons`, y cualquier configuración adicional.

## Render

Confirma estas variables:

```text
VR_FREE_PREMIUM_DURING_LAUNCH=true
VR_BILLING_ENABLED=false
```

No añadas claves reales al repositorio. Los secretos continúan únicamente en Render → Environment.

## Después del deploy

1. Abrir `/healthz` y comprobar versión `16.0.0`.
2. Abrir `/como-funciona.html`.
3. Abrir `/premium.html`.
4. Registrar/entrar con un usuario de prueba.
5. Abrir V/R+ y comprobar `INCLUIDO`.
6. Probar Rewind, filtros y Boost.
7. Confirmar que ningún flujo solicita tarjeta.
8. Forzar actualización de la PWA si el navegador conserva el Service Worker anterior.
