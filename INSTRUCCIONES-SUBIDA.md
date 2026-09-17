# Instrucciones de subida · Fase 17

## Sustituir en el repositorio

Reemplaza con los archivos de este paquete:

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
- `como-funciona.html`
- `premium.html`

Añade:

- `LANZAMIENTO-FASE17-CONTROL-MONETIZACION.md`
- `PRUEBA-FASE17.md`
- `ESTADO-FASE17-2026-09-17.md`

Conserva los archivos que no vinieron en el envío original, especialmente `package.json`, `package-lock.json`, `icons/` y cualquier configuración adicional del repositorio.

## Render

No necesitas variables para encender/apagar Premium. Fase 17 guarda ese estado en SQLite desde **Admin → Monetización**.

Mantén:

```text
VR_LAUNCH_MODE=beta
```

hasta completar la preparación real de producción.

Las claves del proveedor de pago, cuando se configuren, siguen exclusivamente en Render → Environment. No subir secretos a GitHub.

## Después del deploy

1. Abrir `/healthz` y comprobar `17.0.0`.
2. Forzar actualización de la PWA si mantiene caché anterior.
3. Entrar con cuenta administradora.
4. Abrir **Admin → Monetización**.
5. Confirmar **Premium incluido gratis** y **Checkout bloqueado**.
6. Abrir `/como-funciona.html` y `/premium.html`.
7. Probar V/R+ con un usuario normal.
8. Seguir `PRUEBA-FASE17.md`.

## No activar Premium de pago todavía

El botón de activación está preparado, pero debe usarse únicamente después de completar producción, revisión legal/fiscal y proveedor LIVE.
