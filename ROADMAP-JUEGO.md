# V/R Match — evolución del juego

## V18.4 implementado

- Mantiene el motor autoritativo de turnos de V18.3.
- Amplía los bancos de cartas sincronizadas de Rompehielos, Parejas y +18.
- Las partidas nacidas de un Match pueden recibir una carta sincronizada creada a partir de un interés que ambos perfiles tengan en común.
- Esa personalización se decide en servidor y no depende del nombre visible del perfil.
- Revelación renovada con cuenta atrás 3–2–1, comparación visual de respuestas y resultado destacado.
- Feedback háptico y tono corto de interfaz cuando el navegador lo permite; se respeta `prefers-reduced-motion` para las animaciones.
- Partículas visuales en coincidencias/aciertos sin recursos externos.
- Nuevos contadores compartidos: coincidencias A/B, predicciones acertadas y cartas sincronizadas personalizadas.
- El resumen final utiliza esos contadores sin convertirlos en una puntuación de compatibilidad.
- Se corrige una llamada duplicada a `prepararMesa()` en el inicio de partida.
- `server.js`, `package.json` y Service Worker pasan a 18.4.0.
- Las respuestas secretas sincronizadas continúan viviendo solo en memoria durante la ronda; no se crea historial persistente de respuestas.

## Principio que se mantiene

V/R Match sigue siendo primero una app de citas y después un juego. El recorrido principal continúa siendo:

**DESCUBRIR → LIKE → MATCH → CHAT → JUGAR → VOLVER AL CHAT**

## Siguiente bloque recomendado — V18.5

1. Crear un historial opcional de partidas terminadas que guarde solo metadatos seguros: fecha, mazo, duración aproximada, número de rondas, coincidencias y reacciones; nunca respuestas, fotos ni vídeos.
2. Incorporar métricas agregadas de abandono/completado por tipo de partida para mejorar el diseño sin almacenar contenido privado.
3. Añadir “favoritos de partida”: permitir marcar una pregunta como interesante para retomarla después en el chat, guardando solo la referencia/tipo de carta y no la respuesta privada.
4. Mejorar la recuperación ante una reconexión breve para que una partida activa pueda restaurar su estado durante unos segundos en vez de terminar inmediatamente.
5. Revisar duración real de las partidas con pruebas de dos usuarios y ajustar el objetivo de 8 turnos por jugador si resulta demasiado largo.
