# Checklist V18.23.0

1. Haz copia de seguridad de `data/` y `uploads/`.
2. Despliega V18.23.0 sin borrar esas carpetas.
3. Comprueba `/healthz`: debe indicar `18.23.0`.
4. En móvil, inicia sesión y comprueba el dock inferior: Descubrir / Matches / Jugar / Perfil.
5. Abre el chat: el dock no debe tapar el compositor y al aparecer el teclado la pantalla debe conservar una altura usable.
6. Cuenta > Aplicación: prueba activar/desactivar `Respuesta táctil`.
7. Tras varias interacciones en móvil, comprueba que la sugerencia de instalar no aparece si ya está instalada.
8. Desactiva temporalmente Wi‑Fi/datos y comprueba el aviso `Sin conexión`; al recuperar red debe indicar `Conexión recuperada`.
9. Comprueba que el contador de Matches se refleja también en el dock móvil.
10. Instala la PWA y revisa que no vuelva a aparecer la sugerencia de instalación.
