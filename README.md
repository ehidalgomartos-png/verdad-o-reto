# V/R Match — V18 · Producto sin monetización pública

Versión **18.1.0**, construida sobre V17.

## Decisión de producto

V/R Match se presenta actualmente como una plataforma en beta con sus funciones disponibles. La interfaz pública no muestra mensajes sobre precios, suscripciones, tarjetas, planes Premium ni posibles cobros futuros.

Las funciones actuales agrupadas bajo **V/R+** —Rewind, filtros avanzados, Boost y ranking inteligente— forman parte de la experiencia disponible para los usuarios.

## Cambios principales

- Inicio: eliminado el mensaje comercial de Gratis/Premium.
- `como-funciona.html`: reescrita sin referencias a monetización.
- `funciones.html`: nueva página pública de **Funciones V/R+**. Las rutas antiguas `/premium` y `/premium.html` redirigen por compatibilidad.
- Zona V/R+: eliminados textos de plan, checkout, tarjeta, suscripción y cobro.
- Condiciones y Privacidad: eliminadas referencias a pagos futuros.
- Admin: la pestaña de Monetización queda oculta en la interfaz.
- Funciones V/R+ actuales: habilitadas para todos los usuarios.
- Configuración de Stripe retirada de `.env.example` y `render.yaml`.
- Service Worker actualizado a `vr-match-shell-v18`.
- `/healthz` debe mostrar **18.1.0**.

## Regla de esta versión

No presentar las funciones actuales como una prueba de un plan comercial. Cualquier cambio de modelo de negocio deberá diseñarse como una fase nueva y separada, sin alterar silenciosamente las funciones que ya forman parte de la experiencia actual.


### V18.1
En la pantalla de acceso, Funciones V/R+ se mueve al pie, debajo del aviso +18 y enlaces legales.
