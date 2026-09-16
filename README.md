# V/R Match — Fase 14 · Resiliencia y mantenimiento

Versión **14.0.0** construida sobre la Fase 13.

## Novedades
- Nueva pestaña **Admin → Sistema**.
- Comprobación de integridad de SQLite (`quick_check`).
- Diagnóstico de base de datos, WAL, fotos, sesiones y elementos antiguos depurables.
- Limpieza manual de sesiones/tokens caducados.
- Retención beta: errores cliente de más de 30 días y notificaciones leídas de más de 90 días.
- Detección y limpieza de fotos huérfanas no referenciadas por perfiles.
- Optimización segura con `PRAGMA optimize` y checkpoint WAL; no ejecuta VACUUM en caliente.
- Backup manual protegido por contraseña del administrador.
- El backup incluye una copia consistente de SQLite, `uploads/` y un manifiesto en `.tar.gz`.
- No incluye secretos de Render/SMTP, pero **sí contiene datos privados y hashes de contraseña**, por lo que debe guardarse de forma segura.

## Importante
Mientras Render siga en Free, el almacenamiento local continúa siendo temporal. El backup manual es una medida de beta y no sustituye almacenamiento persistente ni una estrategia profesional de backups.

## Versión
`/healthz` debe mostrar `14.0.0`.

## Render
No requiere variables nuevas.
