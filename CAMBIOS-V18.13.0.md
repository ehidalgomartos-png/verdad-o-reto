# V/R Match 18.13.0 — Analítica de crecimiento

Esta versión añade analítica propia de primera parte para medir el embudo completo de adquisición y activación sin añadir Google Analytics, Meta Pixel ni TikTok Pixel.

## Nuevo
- Visitas/sesiones de entrada.
- Inicio y finalización de registro.
- Atribución por `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` y `utm_term`.
- Embudo: visita → registro → ciudad → perfil → primer like → match → mensaje → partida → compartir.
- Rendimiento por canal, campaña y contenido/Reel.
- Altas por ciudad.
- Exportación CSV desde Administración > Métricas.
- Periodos 24 h, 7, 30 y 90 días.
- Analítica pre-login con identificador aleatorio de sessionStorage; no fingerprinting.

## Ejemplo de URL para TikTok
`https://vrmatch.es/?register=1&city=Valencia&utm_source=tiktok&utm_medium=organic_social&utm_campaign=LANZAMIENTO_VALENCIA&utm_content=REEL-023`

## Importante
Los datos anteriores a instalar 18.13 no pueden reconstruir visitas/UTM históricas. Las altas existentes seguirán apareciendo en métricas de producto, pero la atribución de campañas empieza a llenarse desde el despliegue de esta versión.
