# V/R Match 18.15.0 — Seguridad y verificación de perfiles

## Qué incorpora

- Verificación opcional de perfil mediante una selfie privada.
- La prueba de verificación **no se publica** y se almacena fuera de `/uploads`.
- Revisión manual desde Administración → Seguridad.
- La selfie privada se elimina automáticamente al aprobar o rechazar la solicitud.
- Insignia `✓ Perfil verificado` visible en Descubrir cuando la revisión ha sido aprobada.
- Posibilidad de retirar la insignia desde moderación.
- Si una persona verificada cambia sus fotos públicas, la insignia se retira automáticamente y puede solicitar una nueva revisión.
- Cola interna de señales de riesgo para priorizar revisión humana.
- Controles anti-spam adicionales:
  - límite diario de likes muy alto para frenar automatizaciones masivas;
  - detección del mismo mensaje enviado a numerosos matches en poco tiempo;
  - señal interna de contacto externo muy temprano en cuentas recién creadas (no bloquea el mensaje por sí sola).
- Las señales de riesgo **no suspenden automáticamente** a nadie. Solo ayudan a moderación a decidir qué revisar primero.
- Exportación de datos ampliada con estado de verificación y señales técnicas asociadas a la propia cuenta.
- Borrado de cuenta elimina también cualquier selfie privada pendiente.
- Privacidad y condiciones actualizadas.

## Qué significa “Perfil verificado”

Es una revisión visual manual entre la selfie privada enviada voluntariamente y las fotos públicas del perfil. No es una verificación documental de identidad ni una comprobación de antecedentes. La app lo explica expresamente para no crear una falsa sensación de seguridad.

## Prueba recomendada

1. Crear/verificar una cuenta de prueba con al menos una foto de perfil.
2. Cuenta → Verificación de perfil → Elegir selfie → Enviar a revisión.
3. Entrar como administrador → Seguridad.
4. Abrir la selfie privada, aprobar la solicitud y comprobar que desaparece la prueba.
5. Volver a la cuenta y confirmar que aparece como `Perfil verificado`.
6. Entrar con otra cuenta y comprobar que la insignia aparece en Descubrir.
7. Revocar la verificación desde Administración → Usuarios y confirmar que el badge desaparece.

## Privacidad

El directorio `verification/` debe vivir en `VR_STORAGE_DIR` (en Render, por ejemplo `/var/data/verification`) y **no está expuesto mediante Express**. Solo el endpoint autenticado de administrador puede leer temporalmente la prueba pendiente.
