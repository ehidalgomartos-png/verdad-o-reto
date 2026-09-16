# Checklist de prueba · V/R Match Fase 6

## Antes del deploy
- [ ] Sustituir archivos en GitHub.
- [ ] No subir el ZIP directamente.
- [ ] Commit + push a `main`.
- [ ] Confirmar que las variables SMTP actuales siguen en Render.
- [ ] Mantener `VR_REQUIRE_EMAIL_VERIFICATION=false` durante desarrollo.

## Después del deploy
- [ ] Logs muestran `V/R Match v6.0`.
- [ ] `/healthz` devuelve `version: 6.0.0`.
- [ ] Login existente funciona.
- [ ] Perfil existente carga sin errores.

## Geolocalización
- [ ] En Perfil aparece “Ubicación aproximada”.
- [ ] Pulsar “Usar mi ubicación”.
- [ ] El navegador pide permiso.
- [ ] Aceptar permiso.
- [ ] Guardar perfil.
- [ ] Al volver a editar aparece “Ubicación activada”.
- [ ] Elegir radio de 5/15/30/50/100/200 km y guardar.

## Prueba con dos cuentas
- [ ] Cuenta A activa ubicación.
- [ ] Cuenta B activa ubicación.
- [ ] En Descubrir aparece distancia aproximada.
- [ ] La tarjeta no muestra coordenadas.
- [ ] En la respuesta de Descubrir no aparecen `location_lat`, `location_lng`, `location`, `preferences` ni `privacy` de otros perfiles.
- [ ] Con radio pequeño desaparece un perfil que esté fuera del límite.
- [ ] Con radio mayor vuelve a aparecer si cumple los demás filtros.
- [ ] El filtro rápido de distancia solo reduce resultados.

## Privacidad
- [ ] Pulsar “Quitar ubicación”.
- [ ] Guardar perfil.
- [ ] Confirmar que vuelve a “Ubicación no activada”.
- [ ] La app sigue funcionando con ciudad y filtros tradicionales.

## Regresión
- [ ] Like mutuo.
- [ ] Match.
- [ ] Chat.
- [ ] Invitación a juego.
- [ ] Partida.
- [ ] Regreso al chat.
- [ ] Recuperación de contraseña.
- [ ] Verificación de email opcional.
