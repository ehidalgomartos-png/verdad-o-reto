# Actualización a V/R Match 18.0.0

## Objetivo
Eliminar de la experiencia pública cualquier referencia a precios, planes Premium, pagos, tarjetas, suscripciones o futuros cobros. Las funciones V/R+ actuales quedan disponibles para todos los usuarios.

## Archivos que debes sustituir en el proyecto
- `index.html`
- `como-funciona.html`
- `funciones.html` (nuevo)
- `terms.html`
- `privacy.html`
- `server.js`
- `sw.js`
- `.env.example`
- `render.yaml`
- `README.md`

Los demás archivos incluidos se mantienen como apoyo o sin cambios relevantes.

## Importante sobre la antigua página Premium
La nueva página pública es:

`/funciones.html`

Las rutas antiguas `/premium` y `/premium.html` redirigen automáticamente a `/funciones.html` para evitar enlaces rotos.

## Después del despliegue
1. Abrir `/healthz` y comprobar que muestra `18.0.0`.
2. Abrir la portada en una ventana privada.
3. Revisar `Cómo funciona`.
4. Revisar `Funciones V/R+`.
5. Entrar con una cuenta de prueba y comprobar Rewind, filtros avanzados, Boost y ranking.
6. Confirmar que no aparece ningún texto sobre pagos, Premium, tarjetas o suscripciones.
7. Si la PWA conserva textos antiguos, cerrar/reabrir la app o limpiar la caché: el Service Worker ahora usa `vr-match-shell-v18`.

## Dominio y correo
No cambies en Render los valores que ya tienes funcionando para dominio propio y SMTP. Este paquete no conoce el dominio final exacto ni tus credenciales y no debe reemplazarlos.

## Pagos
No integrar PayPal en esta fase. No hace falta configurar ningún proveedor de pago para V18.
