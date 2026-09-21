# Auditoría SEO V18.24.4

## Comprobación de `server.js`

Sí se revisó. Las carpetas `ciudades/` y `guias/` ya estaban expuestas mediante `express.static`, por lo que cualquier nuevo archivo `.html` dentro de ellas se sirve automáticamente. No es necesario crear una ruta Express individual por landing.

Se detectó una incidencia: `server.js` ya tenía `/robots.txt`, pero el ZIP V18.24.3 no contenía `robots.txt`, por lo que esa URL podía fallar. V18.24.4 añade el archivo.

También se añade `/sitemap.xml` como sitemap principal y se mantiene `/sitemap-landings.xml`.

## Elementos incluidos por landing

- title y meta description únicos;
- canonical;
- robots index/follow;
- Open Graph y Twitter Card;
- H1 único y jerarquía H2/H3;
- contenido original y CTA coherente con registro abierto;
- enlazado interno;
- BreadcrumbList;
- WebPage + Organization + FAQPage en JSON-LD;
- imagen social compartida;
- accesibilidad básica y navegación coherente.

## Evitar contenido duplicado

`server.js` redirige `/ciudades/slug` a `/ciudades/slug.html` y `/guias/slug` a `/guias/slug.html`. La URL `.html` es la canónica.

## Nota

Ninguna implementación garantiza posiciones en Google. La indexación y el ranking dependen también de autoridad, enlaces, competencia, rendimiento, comportamiento de rastreo y calidad percibida.
