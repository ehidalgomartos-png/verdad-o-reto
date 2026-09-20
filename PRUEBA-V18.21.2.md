# Prueba V18.21.2

1. Despliega y comprueba `/healthz` → `18.21.2`.
2. Administración → Usuarios: abre una cuenta de prueba y verifica que aparecen `Borrar perfil completo` y `Eliminar cuenta definitivamente`.
3. Prueba `Borrar perfil completo`: la cuenta debe seguir existiendo, pero sin perfil/fotos/matches y debe poder reconstruirlo.
4. Prueba la eliminación total solo con una cuenta desechable. Debe pedir escribir `ELIMINAR`.
5. Administración → Novedades: pulsa `Plantilla: comunidad pública`.
6. Pulsa `Previsualizar` y después `Enviarme prueba`; confirma recepción.
7. Comprueba el número de destinatarios elegibles.
8. Con dos o más cuentas de prueba verificadas, crea un envío y escribe `ENVIAR`. La cola debe avanzar y mostrar enviados/errores.
9. Desde uno de los emails, usa `Dejar de recibir novedades`, confirma la baja y comprueba que el interruptor de Novedades queda desactivado.
10. Vuelve a activarlo desde Notificaciones y confirma que la preferencia se guarda.
11. Prueba el filtro por ciudad antes de un envío real.

Antes de un envío grande: haz primero una prueba, revisa asunto/texto/enlace y confirma que SMTP está correctamente autenticado (SPF/DKIM/DMARC).
