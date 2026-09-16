# V/R Match — Fase 15 · Lanzamiento comercial preparado

Versión **15.0.0** construida sobre la Fase 14.

## Novedades
- Centro de producción ampliado con **modo beta/producción**, dominio, persistencia, correo y Stripe.
- Billing V/R+ opcional mediante **Stripe Checkout** y **Customer Portal**.
- Webhook firmado de Stripe con deduplicación de eventos.
- V/R+ se activa o revoca automáticamente según el estado de la suscripción.
- La app no almacena datos completos de tarjeta.
- El borrado de cuenta intenta cancelar primero una suscripción activa para evitar cobros posteriores.
- El sistema sigue funcionando en beta si Stripe no está configurado.
- Render Free sigue siendo válido para pruebas, pero **no** para el lanzamiento con datos persistentes.

## Muy importante
Por defecto: `VR_LAUNCH_MODE=beta` y `VR_BILLING_ENABLED=false`. Subir esta fase **no empieza a cobrar a nadie**.

## Versión
`/healthz` debe mostrar `15.0.0`.

Consulta `LANZAMIENTO-FASE15.md` antes de activar producción.


## Fase 16 — Gratis permanente + Premium opcional (17/09/2026)

- Nueva página pública: `/como-funciona.html`.
- Nueva página pública: `/premium.html`.
- Mensaje visible en registro: la modalidad gratuita continuará.
- `VR_FREE_PREMIUM_DURING_LAUNCH=true` activa temporalmente todos los extras V/R+ para usuarios autenticados durante el periodo gratuito, incluso si después se cambia el modo general a producción.
- Mientras esa variable esté activa, el checkout queda bloqueado aunque existan credenciales de Stripe.
- No se requiere tarjeta durante el lanzamiento.
- Una cuenta gratuita no se convierte automáticamente en Premium.
- Service Worker actualizado a `vr-match-shell-v16` y corregido para no sobrescribir el caché del inicio al visitar páginas legales/informativas.

### Para terminar el periodo gratuito

Cuando llegue el momento de ofrecer Premium de pago, primero define qué funciones seguirán siendo gratuitas y cuáles serán Premium. Después cambia `VR_FREE_PREMIUM_DURING_LAUNCH=false`, configura y prueba el proveedor de pago en sandbox y solo entonces habilita cobros.
