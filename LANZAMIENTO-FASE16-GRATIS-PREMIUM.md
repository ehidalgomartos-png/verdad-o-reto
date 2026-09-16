# V/R Match · Fase 16 · Lanzamiento gratuito y Premium opcional

## Decisión de producto

V/R Match mantendrá una modalidad gratuita. Durante los primeros meses de lanzamiento, además, los extras V/R+ actualmente implementados estarán incluidos sin coste.

## Configuración

```text
VR_LAUNCH_MODE=beta
VR_FREE_PREMIUM_DURING_LAUNCH=true
VR_BILLING_ENABLED=false
```

Con `VR_FREE_PREMIUM_DURING_LAUNCH=true` (independiente de `VR_LAUNCH_MODE`):

- `plusIsActive()` devuelve acceso activo a todos los usuarios autenticados.
- Rewind, filtros avanzados, Boost y ranking inteligente funcionan sin membresía manual.
- `/api/billing/checkout` rechaza intentos de compra durante esta etapa.
- La interfaz muestra “Premium incluido durante el lanzamiento”.

## Páginas públicas

- `/como-funciona.html`: explica registro, Descubrir, Like, Match, chat, juego, privacidad, seguridad y notificaciones.
- `/premium.html`: explica que la modalidad gratuita seguirá existiendo y que Premium será opcional.

## Al terminar la etapa gratuita

1. Definir definitivamente el límite entre Gratis y Premium.
2. Revisar jurídicamente condiciones y privacidad.
3. Configurar proveedor de pagos en sandbox.
4. Probar altas, renovaciones, fallos y cancelaciones.
5. Cambiar `VR_FREE_PREMIUM_DURING_LAUNCH=false`.
6. Mantener `VR_BILLING_ENABLED=false` hasta que las pruebas estén completas.
7. Activar cobros reales solo con confirmación expresa del usuario.
