# V/R Match 18.16.0 — Calidad y Producción

## Objetivo
Hacer que el proyecto sea más seguro de desplegar y más fácil de diagnosticar antes de empezar a captar cientos de usuarios.

## Cambios principales

- Nuevo test automático del flujo crítico con `node:test`:
  - health check
  - registro
  - selección de ciudad
  - perfil
  - like + match
  - chat
  - invitación y arranque de partida
  - bloqueo
  - referidos
  - borrado de cuenta
  - backup restaurable
  - registro de errores
- `npm test`, `npm run test:smoke`, `npm run test:syntax` y `npm run check`.
- Workflow de GitHub Actions para ejecutar los tests en cada push y pull request.
- `/healthz` mejorado: comprueba SQLite y escritura del almacenamiento, con caché de la prueba de disco para evitar I/O excesivo.
- Request ID por petición (`X-Request-Id`) para poder relacionar errores del navegador y servidor.
- Nueva tabla `server_errors`, sin bodies, contraseñas, tokens ni contenido de chats.
- Captura de `console.error` y errores no controlados mediante `uncaughtExceptionMonitor`.
- Administración → Sistema muestra diagnóstico de:
  - integridad SQLite
  - lectura/escritura del almacenamiento
  - persistencia
  - configuración SMTP
  - última prueba SMTP
  - última prueba de restauración
  - memoria
  - errores recientes
- Nueva prueba SMTP real: envía un correo técnico a la propia cuenta administradora.
- Nueva prueba de restauración: crea una copia temporal con `db.backup()`, la abre en modo lectura, ejecuta `quick_check` y compara recuentos de usuarios, perfiles, matches y mensajes.
- Producción ya considera necesarias una prueba SMTP reciente y una prueba de restauración reciente para marcar el núcleo como listo.
- Mantenimiento elimina también errores antiguos del servidor.
- Nuevas variables opcionales:
  - `VR_SYSTEM_ERROR_RETENTION_DAYS=30`
  - `VR_HEALTH_MEMORY_WARN_MB=768`

## Privacidad
Los errores técnicos persistidos no guardan bodies HTTP, contraseñas, tokens, cookies ni contenido de conversaciones. Los textos se recortan y se intentan redactar secretos comunes.
