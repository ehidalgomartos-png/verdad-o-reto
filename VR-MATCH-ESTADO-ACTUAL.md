# V/R Match — estado actual

**Fecha:** 17 de septiembre de 2026  
**Versión:** 18.5.0

## Concepto

V/R Match es una app de citas donde el juego sirve para romper el hielo después de un Match.

Flujo principal:

**DESCUBRIR → LIKE → MATCH → CHAT → JUGAR → VOLVER AL MISMO CHAT**

## Stack

- Frontend: HTML, CSS y JavaScript vanilla.
- Backend: Node.js 22, Express y Socket.IO.
- Base de datos: SQLite.
- Hosting actual: Render.
- Código fuente: GitHub.
- PWA instalable con Service Worker.

## Juego actual

- Rompehielos.
- Conóceme/Parejas.
- After Dark +18.
- Verdad y Reto.
- respuestas de texto;
- foto/vídeo de prueba;
- reacciones;
- turnos controlados por servidor;
- progresión de partida;
- cartas sincronizadas;
- Los dos responden;
- Adivina a tu Match;
- final a dos voces;
- cartas adaptadas a intereses compartidos;
- revelaciones visuales sincronizadas;
- rondas extra por decisión de ambos.

## Historial seguro desde 18.5

Se guardan únicamente metadatos agregados de partidas: mazo, fecha, duración, turnos, rondas sincronizadas, coincidencias, aciertos, reacciones, personalización y rondas extra.

No se guardan respuestas, texto de cartas, fotos ni vídeos dentro del historial de partidas.

## Observación de producto

Admin → Métricas permite observar altas, activos, Likes, Matches, mensajes, partidas iniciadas, partidas finalizadas, usuarios nuevos que llegan a jugar, feedback y errores del cliente.

## Prioridad inmediata

Lanzamiento controlado con usuarios reales, mejoras pequeñas y medibles, revisión diaria de errores y conversión, y recuperación de partidas ante desconexiones breves como siguiente bloque importante.
