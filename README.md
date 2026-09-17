# V/R Match — Fase 17 · Control de monetización desde Admin

Versión **17.0.0**, construida sobre la Fase 16.

## Novedad principal

El modo comercial ya no se cambia entrando a Render. El administrador puede controlar desde **Admin → Monetización** si los extras V/R+ están incluidos gratis o si V/R Premium está habilitado como servicio de pago.

### Estado inicial seguro

En una instalación nueva de Fase 17 el sistema arranca siempre así:

- V/R Match base: gratis.
- Extras V/R+: incluidos gratis durante el lanzamiento.
- Checkout: bloqueado.
- Nadie necesita tarjeta.
- Nadie se suscribe automáticamente.

El estado se guarda en SQLite (`app_settings`) y, con almacenamiento persistente, sobrevive a reinicios y despliegues.

## Activar Premium de pago

El botón **Activar Premium de pago** solo funciona si:

- la aplicación está en `VR_LAUNCH_MODE=production`;
- dominio propio y almacenamiento persistente están listos;
- SMTP y verificación obligatoria están listos;
- hay administrador configurado;
- el proveedor de pago está completamente configurado;
- el proveedor está en modo LIVE;
- el administrador vuelve a escribir su contraseña;
- escribe exactamente `ACTIVAR PREMIUM`;
- confirma la revisión legal, fiscal y comercial.

Activar Premium **no suscribe ni cobra a usuarios existentes**. Solo cambia la disponibilidad de los extras; cada usuario debe contratar Premium expresamente.

## Volver a Premium gratis

Existe el botón **Volver a Premium incluido gratis**. Por seguridad, se bloquea si quedan suscripciones de pago activas, `trialing` o `past_due`, para evitar cobrar por extras que pasarían a ser gratuitos.

## Páginas públicas dinámicas

`/`, `/como-funciona.html` y `/premium.html` consultan `/api/product/monetization`. Cuando el administrador cambia el modo comercial, los textos públicos se adaptan automáticamente sin nuevo deploy.

## Proveedor de pago actual

El código recibido ya traía Stripe Checkout, Customer Portal y webhooks. Fase 17 conserva ese motor como proveedor actual y deja el control de activación desacoplado en Admin. Las claves permanecen exclusivamente en Render → Environment.

## PWA

Service Worker actualizado a `vr-match-shell-v17`.

## Verificación

`/healthz` debe mostrar `17.0.0`.

Consulta `LANZAMIENTO-FASE17-CONTROL-MONETIZACION.md` y `PRUEBA-FASE17.md` antes del deploy.
