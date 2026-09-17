# V/R Match — Landing FIXED

Esta versión corrige el problema de carga visto en la primera entrega.

## Importante

`index.html` es ahora AUTOCONTENIDO:
- CSS dentro del propio archivo.
- JavaScript dentro del propio archivo.
- No necesita `styles.css` ni `app.js` para mostrar correctamente la landing.
- Los estilos están prefijados con `vr-` para reducir conflictos con el CSS existente de V/R Match.
- Tiene contenido visible de respaldo aunque fallen funciones opcionales del navegador.

## Prueba rápida

Abre directamente `index.html` en Chrome.

## Integración

Los archivos `schema.sql`, `waitlist-router.example.js` e `INTEGRACION.md` siguen sirviendo como base para conectar la landing con Node.js + Express + SQLite.

Los perfiles y contadores actuales son únicamente datos de demostración y deben reemplazarse por datos reales antes de publicar.
