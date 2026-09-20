# V/R Match V18.23.0 — Pulido móvil + PWA + experiencia “app”

## Qué cambia
- Dock inferior móvil persistente para Descubrir, Matches, Jugar y Perfil.
- Respeta las áreas seguras de iPhone/Android y desaparece al abrir el teclado.
- Chat adaptado a la altura real del viewport, con compositor fijo y scroll independiente.
- Respuesta háptica opcional en dispositivos compatibles, configurable en Cuenta > Aplicación.
- Sugerencia inteligente de instalación PWA después de varias interacciones, nunca al aterrizar en frío y con pausa de 7 días si se cierra.
- Estado de conexión visible cuando el dispositivo se queda sin red y confirmación al recuperar conexión.
- Precarga en segundo plano de la siguiente foto de Descubrir para reducir esperas.
- Navegación y transiciones respetan `prefers-reduced-motion`.
- Mejoras de targets táctiles, safe areas y modo standalone.

## Privacidad
La preferencia háptica y el rechazo temporal del aviso de instalación se guardan solo en el navegador. No se envían al servidor.

## Configuración
No requiere variables nuevas en Render.
