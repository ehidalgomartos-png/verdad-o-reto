# V18.24.4 — SEO Landings

- 20 nuevas landings SEO (15 ciudades + 5 guías) para un total de 50.
- Registro abierto reflejado en las landings antiguas; se elimina texto obsoleto de lista de espera/lanzamiento progresivo.
- `descubrir.html` actualizado como hub interno de las 50 páginas.
- `sitemap-landings.xml` actualizado y nuevo `sitemap.xml` principal.
- `robots.txt` creado (la ruta existía en `server.js`, pero faltaba el archivo en V18.24.3).
- `server.js` mantiene `/ciudades` y `/guias` como recursos estáticos, por lo que no hace falta añadir 50 rutas individuales.
- Se añaden redirecciones 301 desde URLs SEO sin `.html` hacia la canónica con `.html` para evitar duplicados.
- `/sitemap.xml` queda servido explícitamente desde `server.js`.
- Versión 18.24.4.
