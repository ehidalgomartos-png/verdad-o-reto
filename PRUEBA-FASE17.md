# Prueba Fase 17

## 1. Estado inicial
- Entrar como administrador.
- Abrir **Admin → Monetización**.
- Confirmar `Premium incluido gratis`.
- Confirmar `Checkout: Bloqueado`.
- Confirmar que V/R+ aparece incluido para un usuario normal.

## 2. Persistencia
- Reiniciar el servicio con disco persistente.
- Confirmar que el modo comercial seleccionado se conserva.

## 3. Protección de activación
Mientras falte cualquier requisito de producción:
- intentar `ACTIVAR PREMIUM`;
- confirmar que el backend rechaza la acción;
- confirmar que no aparece ningún checkout público.

## 4. Confirmaciones
- Contraseña incorrecta → rechazo.
- Frase incorrecta → rechazo.
- Casilla legal/comercial sin marcar → rechazo.

## 5. Activación real (solo cuando corresponda)
Con producción y proveedor LIVE correctamente configurados:
- escribir contraseña;
- marcar confirmación legal/fiscal/comercial;
- escribir `ACTIVAR PREMIUM`;
- confirmar el diálogo;
- comprobar que Admin indica `Premium de pago activo`;
- comprobar que un usuario gratuito conserva acceso a la modalidad base;
- comprobar que los extras V/R+ quedan bloqueados hasta contratar;
- comprobar que `/premium.html` y `/como-funciona.html` cambian el mensaje automáticamente.

## 6. No suscripción automática
- Revisar usuarios existentes.
- Confirmar que no se creó ninguna suscripción ni cargo por el cambio de modo.

## 7. Reversión segura
Sin suscripciones activas:
- escribir `VOLVER A GRATIS`;
- confirmar que V/R+ vuelve a estar incluido.

Con alguna suscripción activa/trialing/past_due:
- comprobar que la reversión es rechazada.

## 8. PWA
- Confirmar caché `vr-match-shell-v17`.
- Actualizar/recargar la PWA tras el deploy.

## 9. Salud
- `/healthz` → versión `17.0.0`.
- `node --check server.js` sin errores.
