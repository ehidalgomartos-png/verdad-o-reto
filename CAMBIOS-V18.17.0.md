# V/R Match 18.17.0 — Onboarding y Activación

## Objetivo
Reducir el abandono durante los primeros minutos y guiar a cada cuenta desde el registro hasta su primera conversación real.

## Cambios principales

- Nuevo estado de activación calculado con 7 pasos reales:
  1. ciudad elegida
  2. perfil básico creado
  3. al menos una foto
  4. bio de 20+ caracteres y 2+ intereses
  5. primer like
  6. primer match
  7. primer mensaje
- Nuevo endpoint autenticado `GET /api/activation/me`.
- La respuesta de `/api/me` incorpora el estado de activación.
- La selección de ciudad y el guardado de perfil devuelven el progreso actualizado.
- Nuevo panel de progreso en Perfil con porcentaje, pasos completados y CTA contextual.
- Nuevo coach compacto en Descubrir que desaparece al completar la activación.
- Nuevo modal “Tu camino al primer match” con los 7 pasos y contexto de la comunidad local.
- El onboarding inicial se ha reescrito alrededor de los primeros 5 minutos: descubrir → like → match → conversación/juego.
- El estado vacío de Descubrir ahora distingue filtros demasiado restrictivos de una comunidad todavía pequeña; ofrece quitar filtros, revisar radio/preferencias e invitar a otra persona sin bloquear el acceso.
- El progreso del perfil se actualiza también mientras se escriben nombre, bio, intereses o se añaden fotos, antes de guardar.
- Al dar like, recibir un match o enviar el primer mensaje el progreso se refresca automáticamente.
- Nuevo evento interno de primera parte `profile_ready` cuando un perfil alcanza foto + bio + intereses mínimos.
- Administración → Métricas añade el paso **Perfil listo** al embudo.
- CSV de crecimiento añade `activation_percent`, `profile_ready` y `next_step` para estudiar abandonos por campaña.
- Privacidad actualizada para explicar el uso del progreso de activación.
- PWA actualizada a caché `v18-17-0`.

## Qué no hace

- No garantiza que una persona consiga match: el interés debe ser mutuo.
- No usa una puntuación secreta de atractivo o compatibilidad para este progreso.
- No guarda contenido adicional de chats para calcularlo.
- No bloquea el uso si el progreso no llega al 100%; el panel es una guía.
