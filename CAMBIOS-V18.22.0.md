# V/R Match V18.22.0 — Moderación avanzada + Admin + Ciudades

## Objetivo
Dar al equipo administrador más contexto para revisar cuentas y facilitar que los perfiles incompletos añadan su ciudad sin perder el enfoque de privacidad de V/R Match.

## Novedades

### Ficha completa de usuario en Administración
- Vista privada de administración con nombre, edad, género, ciudad, bio, intereses y preferencias de descubrimiento.
- Galería con todas las fotos del perfil.
- Estado de correo y perfil verificado, visibilidad, comunidad pública, online, juegos, ubicación aproximada, V/R+ y preferencias de notificación.
- Resumen de actividad: matches, mensajes, denuncias, reportantes distintos, bloqueos recibidos, avisos y suspensiones.
- Historial reciente de denuncias, acciones administrativas y peticiones de ciudad.
- La puntuación/señal de riesgo es solo contexto para revisión humana y no sanciona automáticamente.

### Moderación avanzada
- Aviso de moderación sin enviar al usuario la nota interna del administrador.
- Suspensiones de 24 horas, 7 días, 30 días o indefinidas.
- Reactivación automática cuando vence una suspensión temporal.
- Reactivación manual desde Administración.
- Panel de denuncias con contexto de reincidencia: denuncias históricas, reportantes distintos, bloqueos y avisos previos.
- Las acciones relevantes quedan registradas en el historial de administración.

### Completar ciudades
- Filtro de usuarios: Todos / Sin ciudad / Con ciudad.
- Botón individual `📍 Pedir ciudad` en la ficha de una cuenta sin ciudad.
- Campaña masiva para cuentas activas que aún no tengan ciudad.
- Aviso interno que abre directamente el selector de ciudad.
- Email opcional usando el SMTP ya configurado, solo para cuentas con correo verificado y recordatorios por email activos.
- Cola de emails en lotes, reintentos limitados y botón para procesarla manualmente.
- Periodo de espera por defecto de 7 días para no repetir la petición a la misma cuenta.
- La invitación se marca como completada cuando el usuario guarda su ciudad.
- Se solicita ciudad o municipio, nunca una dirección exacta ni ubicación precisa.

## Configuración opcional
No hay nuevas variables obligatorias. Si quieres cambiar los valores por defecto:

```env
VR_CITY_INVITE_BATCH_SIZE=15
VR_CITY_INVITE_COOLDOWN_DAYS=7
```

## Privacidad
La política de privacidad y las condiciones de uso se han actualizado para explicar el acceso administrativo autorizado, las suspensiones temporales y las solicitudes para completar la ciudad.
