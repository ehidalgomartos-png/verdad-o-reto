# V/R Match — Fase 13 · Control de cuenta y privacidad

Versión **13.0.0** construida sobre la Fase 12.

## Novedades
- Centro de control de cuenta desde **Cuenta y seguridad**.
- Lista de sesiones abiertas sin almacenar ni mostrar IP o huella de dispositivo.
- Cierre individual de otras sesiones y botón para cerrar todas las demás.
- Lista de personas bloqueadas y desbloqueo manual.
- Exportación de datos propios en JSON desde la aplicación.
- La exportación omite contraseñas, tokens y hashes de sesión.
- Mantiene observabilidad, feedback beta, moderación, V/R+, notificaciones y PWA.

## Versión
`/healthz` debe mostrar `13.0.0`.

## Render
No requiere variables de entorno nuevas. Mantener las variables actuales.

## Nota de privacidad
Esta fase mejora el control del usuario sobre sus datos, pero no debe presentarse como certificación de cumplimiento legal. Los textos y procesos deben revisarse profesionalmente antes del lanzamiento comercial.
