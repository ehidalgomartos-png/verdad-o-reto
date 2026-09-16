# Prueba Fase 16

## 1. Registro
- Abrir `/`.
- Confirmar que aparece el aviso “Todo incluido gratis durante el lanzamiento”.
- Abrir “Cómo funciona” y “Gratis y Premium”.

## 2. Acceso V/R+ gratuito
- Crear/iniciar sesión.
- Abrir V/R+.
- Debe mostrar `INCLUIDO` y `V/R+ incluido`.
- Rewind y filtros avanzados no deben aparecer bloqueados.
- Boost debe poder activarse respetando su cooldown.

## 3. Cobro bloqueado
- Mantener `VR_FREE_PREMIUM_DURING_LAUNCH=true`.
- Un POST autenticado a `/api/billing/checkout` debe responder 409 indicando que V/R+ está incluido gratis.

## 4. Páginas públicas
- `/como-funciona.html` responde 200.
- `/premium.html` responde 200.
- Los enlaces a Condiciones, Privacidad y Comunidad funcionan.

## 5. PWA
- Actualizar el Service Worker.
- Confirmar caché `vr-match-shell-v16`.
- Abrir las dos páginas nuevas una vez y probar navegación offline.
- Confirmar que visitar una página informativa ya no sustituye el caché de `/index.html`.
