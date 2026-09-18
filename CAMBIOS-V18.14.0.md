# V/R Match 18.14.0 — Retención inteligente

Esta versión añade una capa de retención por email sobre V18.13.0, sin introducir píxeles de terceros ni correos masivos.

## Nuevos avisos

- **Perfil incompleto**: recordatorio único tras 24 h por defecto, solo para correo verificado y si el perfil sigue sin crear.
- **Nuevo mensaje**: si el destinatario no está conectado, puede recibir un email corporativo. Máximo uno por match cada 6 h por defecto.
- **Invitación a jugar**: si el match no está conectado, la invitación deja aviso y puede enviar un email para que vuelva a V/R Match.
- **Match sin conversación**: si después de 18 h por defecto el match sigue sin mensajes, cada miembro puede recibir una única sugerencia para romper el hielo jugando.

## Anti-spam y privacidad

- Interruptor global `VR_RETENTION_EMAIL_ENABLED`.
- Preferencia individual **Recordatorios por email** en el centro de notificaciones.
- Los avisos de mensajes e invitaciones también respetan sus categorías correspondientes.
- Los recordatorios de retención solo se envían a correos verificados.
- El contenido privado de los chats no aparece en los emails.
- Se registran únicamente tipo, contexto técnico y fecha de envío para evitar duplicados y medir funcionamiento.

## Invitaciones a jugar

Una invitación puede enviarse aunque el match no tenga un socket activo. Si está conectado, conserva el modal de invitación en tiempo real. Si no lo está, se utiliza la capa de notificación/email según sus preferencias.

## Panel de métricas

Administración → Métricas muestra:

- emails de retención enviados;
- desglose por tipo;
- cuentas con actividad posterior al envío.

La métrica de actividad posterior es descriptiva y no atribuye causalidad al email.

## Variables nuevas

```env
VR_RETENTION_EMAIL_ENABLED=true
VR_RETENTION_SWEEP_MINUTES=30
VR_RETENTION_PROFILE_HOURS=24
VR_RETENTION_MATCH_HOURS=18
VR_RETENTION_MESSAGE_COOLDOWN_HOURS=6
```

## Base de datos

Nueva tabla `retention_email_log`. La columna `notification_preferences.retention_email` se crea automáticamente al arrancar.
