# Checklist V18.24.4

1. `/healthz` debe devolver `18.24.4`.
2. Abrir `/descubrir.html` y comprobar las 50 tarjetas.
3. Abrir `/ciudades/malaga.html`, `/ciudades/sagunto.html` y `/guias/app-de-citas-en-espana.html`.
4. Probar `/ciudades/malaga` y verificar redirección 301 a `/ciudades/malaga.html`.
5. Abrir `/robots.txt`.
6. Abrir `/sitemap.xml` y `/sitemap-landings.xml`.
7. Validar que los CTA llevan a `/?register=1` y en ciudades incluyen `city=`.
8. Tras desplegar, enviar `https://vrmatch.es/sitemap.xml` en Google Search Console.
