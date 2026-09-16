# Checklist — Fase 9 · Notificaciones

## 1. Deploy
- [ ] Render muestra `V/R Match v9.0 escuchando en puerto 10000`.
- [ ] `/healthz` devuelve `version: 9.0.0`.
- [ ] No aparecen errores de migración SQLite.

## 2. Notificación de match
- [ ] Cuenta A da like a B.
- [ ] Cuenta B da like a A.
- [ ] Ambos reciben `¡Nuevo match!`.
- [ ] La campana muestra contador.
- [ ] Al abrir la notificación queda leída.

## 3. Notificación de mensaje
- [ ] A envía un mensaje a B.
- [ ] B recibe `Nuevo mensaje`.
- [ ] El aviso aparece en el centro de notificaciones.
- [ ] Al pulsarlo se abre el contexto correspondiente.

## 4. Invitación a jugar
- [ ] A invita a B a jugar.
- [ ] B recibe `Invitación a jugar`.
- [ ] La invitación normal del chat continúa funcionando.

## 5. Turno de juego
- [ ] A y B comienzan una partida.
- [ ] Al terminar una jugada, el otro usuario recibe `Te toca jugar`.

## 6. Preferencias
- [ ] Desactivar notificaciones de mensajes para B.
- [ ] A envía un mensaje.
- [ ] B no recibe una nueva notificación de tipo mensaje.
- [ ] Reactivar la preferencia.

## 7. Leídas
- [ ] `Marcar todo leído` deja el contador en 0.
- [ ] Tras recargar la página, el estado leído se conserva mientras la base de datos exista.

## 8. Navegador
- [ ] Pulsar `Activar` en avisos del navegador.
- [ ] Conceder permiso.
- [ ] Si VAPID NO está configurado: la interfaz indica que el push de fondo queda pendiente.
- [ ] Si VAPID SÍ está configurado: la suscripción push se registra correctamente.

## 9. Regresión
- [ ] Registro/login.
- [ ] Verificación y recuperación de contraseña.
- [ ] Perfil y geolocalización.
- [ ] Match/chat.
- [ ] Juego y regreso al chat.
- [ ] Moderación.
- [ ] V/R+ Rewind / filtros / Boost.
