# V/R Match · Fase 17 · Control de monetización

**Fecha:** 17/09/2026  
**Versión:** 17.0.0

## Objetivo

Permitir que el propietario de V/R Match decida desde el panel de administración cuándo termina el periodo de Premium incluido gratis y cuándo empieza V/R Premium de pago, sin editar variables de Render ni volver a desplegar.

## Modos

### Premium incluido gratis
- La modalidad base de V/R Match sigue siendo gratuita.
- Los extras V/R+ también están disponibles para todos.
- Checkout bloqueado.
- No se solicita tarjeta.

### Premium de pago
- La modalidad base de V/R Match sigue siendo gratuita.
- Los extras V/R+ requieren membresía activa.
- Checkout habilitado únicamente si la infraestructura de pago está lista y LIVE.
- Los usuarios existentes no se convierten automáticamente en suscriptores.

## Fuente de verdad

El modo se guarda en SQLite, tabla `app_settings`, clave `premium_mode`:

```text
launch_free
paid
```

La primera ejecución de Fase 17 siempre usa `launch_free` por seguridad.

## Seguridad de la activación

Para activar cobro real el backend exige simultáneamente:

1. Cuenta administradora autenticada.
2. Contraseña de administrador correcta.
3. Frase exacta `ACTIVAR PREMIUM`.
4. Confirmación legal/fiscal/comercial.
5. Checklist base de producción listo.
6. `VR_LAUNCH_MODE=production`.
7. Proveedor preparado y modo LIVE.

## Reversión

Para volver a Premium incluido gratis se exige contraseña + `VOLVER A GRATIS`. La acción se rechaza si existen suscripciones de pago activas para evitar cobros incoherentes.

## Auditoría

Los cambios de modo se registran en el historial administrativo como:

- `monetization_paid_enabled`
- `monetization_launch_free_enabled`

## Páginas públicas

El estado comercial seguro se publica en:

```text
GET /api/product/monetization
```

No expone claves ni secretos. Sirve para que las páginas públicas actualicen automáticamente sus mensajes.
