# VRMatch V18.21.2 — Gestión de perfiles + novedades por email

- Administración puede borrar un perfil completo manteniendo la cuenta. Se eliminan fotos, verificación, ciudad, likes, matches y el perfil público; la persona puede crear un perfil nuevo.
- Administración puede eliminar una cuenta completa con confirmación reforzada. Si existe una suscripción Stripe activa, la eliminación se bloquea hasta cancelarla.
- Nueva pestaña Administración → Novedades.
- Editor corporativo de email con asunto, preheader, etiqueta, título, cuerpo y CTA.
- Plantilla rápida para anunciar la nueva comunidad pública de `/espera`.
- Envío de prueba a la cuenta administradora.
- Envío masivo mediante cola, por lotes, sin bloquear la petición HTTP.
- Destinatarios: cuentas activas, correo verificado y preferencia de novedades habilitada; filtro opcional por ciudad.
- Baja de novedades desde el propio correo y desde Notificaciones.
- Historial de campañas con enviados, errores y cancelados.
- El contenido del email se trata como texto, no HTML arbitrario, y los CTA quedan restringidos al propio dominio de VRMatch.
