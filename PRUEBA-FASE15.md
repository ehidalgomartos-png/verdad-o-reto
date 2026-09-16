# Prueba Fase 15 — Lanzamiento y Billing

1. Despliega sin variables Stripe nuevas. La app debe iniciar y V/R+ debe seguir funcionando en modo beta.
2. `/healthz` debe devolver `15.0.0`.
3. Admin → Producción debe mostrar **Modo producción** y **Stripe preparado / Cobro V/R+** como pendientes.
4. V/R+ debe indicar que el checkout está desactivado.
5. Configura Stripe solo en Sandbox: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLUS_MONTHLY`; deja `VR_BILLING_ENABLED=false` y redeploy. Admin debe mostrar Stripe preparado pero cobro pendiente.
6. Cuando quieras probar cobro sandbox, cambia `VR_BILLING_ENABLED=true`.
7. Registra en Stripe el webhook HTTPS `/api/billing/webhook` y escucha `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
8. Con una cuenta de correo verificado abre V/R+ → Suscribirme. Debe redirigir al Checkout de Stripe.
9. Tras completar pago de prueba, el webhook debe activar V/R+ y el botón Gestionar suscripción debe abrir Customer Portal.
10. Cancela en portal y confirma que el estado se sincroniza mediante webhook.
11. No actives claves live ni `VR_LAUNCH_MODE=production` hasta tener dominio, almacenamiento persistente y revisión legal/fiscal.
