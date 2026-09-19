# Checklist V18.20 — Push y Reactivación

- [ ] `/healthz` devuelve `18.20.0`, `db=true` y `storage=true`.
- [ ] Configura VAPID en Render y reinicia el servicio.
- [ ] Inicia sesión desde Chrome/Edge/Android y pulsa **Activar** en Notificaciones.
- [ ] Comprueba que la suscripción aparece activa y que el navegador conserva el permiso.
- [ ] Con dos cuentas, crea un match dejando una cuenta fuera de la app: debe recibir push.
- [ ] Envía un mensaje con el receptor fuera: el push debe decir que tiene un mensaje, sin mostrar el texto privado.
- [ ] Envía una invitación a jugar con el receptor fuera: debe llegar el aviso.
- [ ] Con el receptor conectado en ese momento, no debe enviarse un push duplicado al sistema.
- [ ] Activa horario silencioso que cubra la hora actual y genera un match: el aviso debe quedar diferido.
- [ ] Cambia el horario para salir del periodo silencioso o espera al final: el push diferido debe entregarse si sigue vigente.
- [ ] Desactiva **Actividad en mi ciudad**, **Recomendaciones** o **Reactivación** y confirma que esa categoría deja de crearse.
- [ ] Abre un push tocándolo: Administración → Métricas debe registrar una apertura.
- [ ] Revisa **Push y reactivación** en Métricas y comprueba enviados, aperturas y actividad posterior.
- [ ] Verifica que `npm test` pasa en GitHub Actions antes de desplegar a producción.
