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
