# Checklist — Fase 12 · Observabilidad y feedback beta

## Deploy
- [ ] Render muestra `V/R Match v12.0 escuchando en puerto 10000`.
- [ ] `/healthz` devuelve `version: 12.0.0`.
- [ ] No se requieren variables nuevas.

## Feedback usuario
- [ ] Cuenta → Beta y soporte → Enviar comentario beta abre el modal.
- [ ] Menos de 10 caracteres no permite enviar.
- [ ] Enviar un error/idea cierra el modal y muestra confirmación.
- [ ] El comentario no contiene automáticamente chats ni coordenadas.

## Admin → Feedback
- [ ] Aparece el comentario enviado.
- [ ] Filtro por estado funciona.
- [ ] Filtro por tipo funciona.
- [ ] Resolver / descartar / reabrir funciona.
- [ ] La acción aparece también en Historial.

## Admin → Métricas
- [ ] Cambiar 24 h / 7 días / 30 días funciona.
- [ ] Se muestran altas, activos, likes, matches, mensajes y denuncias.
- [ ] El embudo Registro → Perfil → Match → Mensaje carga.
- [ ] Actividad diaria muestra datos agregados.
- [ ] Salud beta muestra usuarios online, sockets, memoria, SQLite y uploads.

## Diagnóstico cliente
- [ ] La sección de errores recientes carga sin exponer secretos.
- [ ] Un error de JS autenticado puede registrarse de forma limitada.
- [ ] No se almacena stack completo, chat ni ubicación.

## Regresión
- [ ] Registro/login/email.
- [ ] Perfil/geolocalización.
- [ ] Descubrir/match/chat/juego.
- [ ] Moderación.
- [ ] V/R+.
- [ ] Notificaciones.
- [ ] PWA.
- [ ] Legal/onboarding.
