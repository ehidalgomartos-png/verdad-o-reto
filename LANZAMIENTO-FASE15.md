# V/R Match — Ruta de lanzamiento real

Esta fase deja el código preparado, pero **no activa cobros automáticamente**.

## Orden recomendado
1. Haz un backup F14/F15 y guárdalo fuera de Render.
2. Sube Render a un plan con Persistent Disk y monta `/var/data`.
3. Define `VR_STORAGE_DIR=/var/data` y verifica que SQLite/fotos persisten tras redeploy.
4. Compra/conecta dominio y cambia `VR_APP_BASE_URL` + `VR_ALLOWED_ORIGINS` al dominio HTTPS definitivo.
5. Verifica el dominio en Resend, cambia `SMTP_FROM` a una dirección del dominio y activa `VR_REQUIRE_EMAIL_VERIFICATION=true`.
6. Crea el producto/precio V/R+ en Stripe Sandbox. Configura las tres variables Stripe.
7. Registra `https://TU-DOMINIO/api/billing/webhook` en Stripe y copia su signing secret a `STRIPE_WEBHOOK_SECRET`.
8. Prueba checkout, portal, cancelación y webhooks con `VR_BILLING_ENABLED=true` pero Stripe en modo test.
9. Revisa condiciones, privacidad, fiscalidad, precio, desistimiento y facturación con asesoramiento profesional.
10. Solo después: claves Stripe live + Price ID live, `VR_LAUNCH_MODE=production` y validación final desde Admin → Producción.

## Variables nuevas
```text
VR_LAUNCH_MODE=beta
VR_BILLING_ENABLED=false
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PLUS_MONTHLY=
```

No subas claves de Stripe, SMTP ni VAPID a GitHub.
