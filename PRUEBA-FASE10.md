# Checklist — Fase 10 · PWA instalable

## Deploy
- [ ] Render muestra `V/R Match v10.0 escuchando en puerto 10000`.
- [ ] `/healthz` devuelve `version: 10.0.0`.
- [ ] `/manifest.webmanifest` abre correctamente.
- [ ] `/icons/icon-192.png` y `/icons/icon-512.png` cargan.
- [ ] `/sw.js` responde sin error.

## Android / Chrome / Edge
- [ ] Abrir V/R Match por HTTPS.
- [ ] Esperar unos segundos y comprobar que aparece **Instalar** en la cabecera o en Cuenta y seguridad.
- [ ] Pulsar `Instalar aplicación`.
- [ ] Aceptar el diálogo del navegador.
- [ ] Abrir V/R Match desde el icono instalado.
- [ ] Comprobar que abre sin barra de direcciones en modo standalone.
- [ ] Login, Descubrir, Matches, Chat y Juego siguen funcionando.

## iPhone / iPad
- [ ] Abrir la web con Safari.
- [ ] Cuenta y seguridad → Aplicación → Instalar.
- [ ] La ayuda explica: Compartir → Añadir a pantalla de inicio → Añadir.
- [ ] Abrir desde el icono de inicio.
- [ ] Safe areas correctas y controles accesibles.

## Actualización
- [ ] Con la PWA instalada, hacer un redeploy futuro y recargar.
- [ ] El Service Worker elimina cachés antiguas `vr-match-shell-*`.
- [ ] La aplicación muestra la nueva versión sin desinstalar.

## Sin conexión
- [ ] Abrir la PWA al menos una vez con conexión.
- [ ] Cortar Internet y volver a abrir.
- [ ] La interfaz/caché o la pantalla de respaldo se muestra sin error blanco.
- [ ] La app informa que las funciones online requieren conexión.

## Seguridad de caché
- [ ] No se almacenan respuestas `/api/*`.
- [ ] No se almacenan chats ni perfiles desde `/api/*`.
- [ ] No se cachea `/uploads/*` desde el Service Worker.
