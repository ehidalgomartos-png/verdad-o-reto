# V/R Match 18.20.0 — Push y Reactivación Inteligente

## Objetivo
Hacer que una persona vuelva a V/R Match cuando ocurre algo relevante, sin convertir las notificaciones en spam.

## Cambios principales
- Push de match, mensaje, invitación a jugar y turno de partida cuando el usuario está fuera de la app.
- El contenido privado del chat no se incluye en la notificación de pantalla bloqueada.
- Nuevas categorías opcionales: actividad agregada de ciudad, recomendaciones y reactivación.
- Reactivación escalonada tras 3, 7 y 14 días de inactividad, solo cuando hay perfiles disponibles en Descubrir.
- Aviso de actividad local solo cuando se han unido al menos 3 personas desde la última visita.
- Recomendación ocasional para usuarios ausentes aproximadamente 36–72 horas.
- Horario silencioso configurable por usuario. Los avisos de eventos se difieren y se entregan después si siguen siendo útiles.
- Límites por defecto: 8 push totales/24 h y 2 push inteligentes/24 h.
- No se envían push al dispositivo si el usuario ya está conectado a V/R Match.
- Métricas internas: enviados, aperturas al tocar la notificación, actividad posterior, likes posteriores y matches posteriores (sin atribuir causalidad).
- Cola de push diferidos, eliminación de suscripciones caducadas y limpieza de logs antiguos.
- Centro de notificaciones ampliado con nuevas preferencias y zona horaria del navegador.

## Variables nuevas
- `VR_SMART_PUSH_ENABLED=true`
- `VR_SMART_PUSH_SWEEP_MINUTES=30`
- `VR_PUSH_DAILY_CAP=8`
- `VR_PUSH_SMART_DAILY_CAP=2`

Para Web Push también deben existir `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`.
