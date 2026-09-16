# PRUEBA FASE 13 — CONTROL DE CUENTA Y PRIVACIDAD

## 1. Salud
- [ ] `/healthz` devuelve `13.0.0`
- [ ] Render arranca sin errores

## 2. Sesiones
- [ ] Iniciar sesión en dos navegadores distintos
- [ ] Cuenta y seguridad → Control de cuenta → Sesiones muestra dos sesiones
- [ ] La sesión actual aparece marcada como `Actual`
- [ ] Cerrar una sesión secundaria
- [ ] El navegador secundario pierde acceso al recargar
- [ ] Volver a abrir dos sesiones y probar `Cerrar las demás`

## 3. Bloqueados
- [ ] Bloquear un match/perfil
- [ ] El perfil aparece en `Bloqueados`
- [ ] Desbloquearlo
- [ ] Desaparece de la lista
- [ ] No se restaura automáticamente un match anterior

## 4. Exportación
- [ ] Pulsar `Descargar mis datos`
- [ ] Se descarga un JSON válido
- [ ] Incluye cuenta, perfil, preferencias, legal, matches/mensajes propios y feedback
- [ ] No contiene contraseña, token de sesión ni hash de sesión
- [ ] Las coordenadas incluidas corresponden únicamente a la ubicación propia almacenada

## 5. Regresión
- [ ] Registro / login
- [ ] Descubrir / geolocalización
- [ ] Match / chat / juego
- [ ] V/R+
- [ ] Notificaciones
- [ ] Moderación
- [ ] PWA
