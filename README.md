# V/R Match — Fase 10 · PWA instalable

Versión: **10.0.0**

Esta fase convierte V/R Match en una **Progressive Web App instalable**, conservando todas las funciones de las fases anteriores.

## Qué añade Fase 10

- `manifest.webmanifest` con identidad V/R Match.
- Iconos 192×192, 512×512, maskable y Apple Touch Icon.
- Instalación desde Chrome/Edge/Android mediante el prompt nativo cuando está disponible.
- Instrucciones específicas para iPhone/iPad: Safari → Compartir → Añadir a pantalla de inicio.
- Botón de instalación en la cabecera cuando el navegador permite instalar.
- Sección **Aplicación** dentro de Cuenta y seguridad.
- Modo `standalone`: al abrir desde la pantalla de inicio se comporta como una app independiente.
- Service Worker actualizado con caché controlada del shell público.
- Pantalla offline de respaldo.
- Web Push de Fase 9 conservado en el mismo Service Worker.
- Safe areas para móviles con notch/isla dinámica.

## Importante sobre el modo offline

V/R Match puede arrancar como PWA, pero perfiles, matches, mensajes, ubicación y partidas siguen necesitando conexión con el backend. No se guardan datos privados de usuarios en la caché del Service Worker.

La caché excluye expresamente:

- `/api/*`
- `/socket.io/*`
- `/uploads/*`

## Render

No se necesitan variables de entorno nuevas para instalar la PWA.

Continúan pendientes para producción:

- dominio propio;
- Render de pago y persistencia;
- remitente de correo con dominio propio;
- VAPID si se decide activar push real de fondo;
- checkout real de V/R+.

## Health check

```json
{"ok":true,"db":true,"version":"10.0.0"}
```

En logs:

```text
V/R Match v10.0 escuchando en puerto 10000
```

Consulta `PRUEBA-FASE10.md` después del deploy.
