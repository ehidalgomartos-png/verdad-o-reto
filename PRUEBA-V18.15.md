# Checklist V18.15 — Seguridad y verificación

## 1. Solicitud de verificación
- Entra con una cuenta cuyo correo esté verificado.
- Asegúrate de tener al menos una foto pública.
- Cuenta → Verificación de perfil.
- Selecciona/toma una selfie y envíala.
- Debe aparecer “Revisión pendiente”.
- Un segundo intento mientras está pendiente debe rechazarse.

## 2. Revisión administrativa
- Entra con una cuenta incluida en `VR_ADMIN_EMAILS`.
- Administración → Seguridad.
- Debe aparecer la solicitud pendiente.
- “Ver selfie” debe mostrar la prueba privada.
- “Ver fotos” debe abrir la ficha moderable del usuario.
- Aprueba la solicitud.
- Al refrescar, la prueba ya no debe poder recuperarse y el perfil debe constar como verificado.

## 3. Insignia pública
- Desde otra cuenta, localiza el perfil en Descubrir.
- Debe aparecer `✓ Perfil verificado`.
- El correo y la fecha interna de verificación no deben ser públicos.

## 4. Cambio de fotos
- Vuelve a la cuenta verificada y cambia el conjunto de fotos públicas.
- La insignia debe retirarse automáticamente.
- La cuenta debe poder solicitar una nueva revisión.

## 5. Rechazo
- Envía una nueva solicitud.
- Desde Administración → Seguridad, recházala e introduce una nota breve.
- La prueba debe borrarse.
- El usuario debe poder volver a enviar otra selfie y ver la nota de corrección.

## 6. Retirada manual
- Administración → Usuarios → abre una cuenta verificada.
- Usa “Retirar verificación”.
- La insignia debe desaparecer de Descubrir.

## 7. Anti-spam
- No hace falta alcanzar los límites en producción para probarlos.
- Comprueba en código/logs que:
  - un uso masivo de likes registra `like_burst` / `like_daily_limit`;
  - el mismo texto enviado a 7 matches diferentes en 30 minutos bloquea el siguiente intento;
  - una cuenta de menos de 24 h que comparte un enlace/teléfono genera una señal leve, sin bloquear por sí sola el mensaje.

## 8. Privacidad / borrado
- Solicita verificación y, antes de revisarla, elimina la cuenta de prueba.
- El archivo privado asociado a esa cuenta debe desaparecer de `VR_STORAGE_DIR/verification`.
- Exporta datos de una cuenta y comprueba que aparecen estado de verificación y señales técnicas, pero no la selfie en base64.
