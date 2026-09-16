# PRUEBA FASE 14 — RESILIENCIA Y MANTENIMIENTO

## 1. Salud
- [ ] `/healthz` devuelve `14.0.0`
- [ ] Render arranca sin errores
- [ ] En logs aparece `Resiliencia F14: mantenimiento + backup manual protegidos`

## 2. Admin → Sistema
- [ ] La pestaña Sistema abre correctamente
- [ ] Integridad SQLite aparece como OK
- [ ] Se muestran tamaño DB/WAL, fotos y sesiones
- [ ] Se muestran candidatos de limpieza

## 3. Mantenimiento
- [ ] Limpiar sesiones/tokens caducados
- [ ] Depurar telemetría antigua
- [ ] Eliminar fotos huérfanas
- [ ] Optimizar SQLite
- [ ] Cada acción aparece en Historial
- [ ] Perfiles, matches, chats y fotos referenciadas siguen funcionando

## 4. Backup manual
- [ ] Introducir contraseña admin incorrecta → rechazo
- [ ] Introducir contraseña correcta → descarga `.tar.gz`
- [ ] El archivo contiene `backup-manifest.json`, `data/vrmatch.db` y `uploads/` si existen fotos
- [ ] El manifiesto indica que el backup es sensible
- [ ] Guardar la copia fuera de Render

## 5. Regresión
- [ ] Login / perfiles
- [ ] Descubrir / geolocalización
- [ ] Match / chat / juego
- [ ] V/R+
- [ ] Notificaciones
- [ ] Moderación
- [ ] PWA
- [ ] Sesiones / bloqueados / exportación de datos
