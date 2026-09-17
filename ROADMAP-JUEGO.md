# V/R Match — evolución del juego

## V18.5 implementado

- Historial persistente y seguro de partidas nacidas desde un Match.
- Guarda únicamente metadatos agregados: Match asociado, mazo, inicio/fin, duración, turnos, rondas sincronizadas, coincidencias, aciertos, reacciones, personalización por intereses y uso de rondas extra.
- No guarda respuestas, predicciones textuales, contenido de cartas, fotos ni vídeos de pruebas.
- El chat muestra cuántas partidas habéis completado juntos y un resumen agregado de la relación de juego.
- El historial se incluye en la exportación de datos de la cuenta.
- Una partida que queda abierta por reinicio/despliegue se cierra de forma coherente usando el último estado agregado persistido.
- El panel Admin incorpora Partidas iniciadas, Partidas finalizadas y el paso Jugó dentro del embudo.
- La gráfica diaria incorpora partidas junto a altas, matches y mensajes.
- Se refuerza el retorno al chat también cuando la partida se inició desde el modal de Match y no desde un chat ya abierto.
- `server.js`, `package.json` y Service Worker pasan a 18.5.0.

## Principio que se mantiene

V/R Match sigue siendo primero una app de citas y después un juego:

**DESCUBRIR → LIKE → MATCH → CHAT → JUGAR → VOLVER AL CHAT**

## Prioridad de lanzamiento

La prioridad inmediata deja de ser añadir muchas mecánicas nuevas y pasa a ser observar uso real:

1. estabilidad de registro, Match, chat y juego;
2. porcentaje de usuarios que llegan a jugar;
3. partidas iniciadas frente a finalizadas;
4. errores del cliente y abandonos;
5. repetición: cuántos Matches vuelven a jugar.

## Siguiente bloque recomendado — V18.6

1. Reconexión breve de partida con una ventana de gracia antes de dar por abandonada la sala.
2. “Retomar conversación”: al volver al chat, sugerir una frase basada en el tipo de momento vivido, sin guardar la respuesta privada.
3. Métricas de repetición de juego por Match y retención 1/7 días.
4. Revisión de duración real de partidas y ajuste de 8 turnos si los datos indican que es demasiado largo.
5. Pulido de onboarding para explicar en menos pasos qué hace diferente a V/R Match.

## Regla para actualizaciones diarias

Una actualización diaria debe cambiar un bloque concreto y medible. Evitar mezclar en el mismo deploy cambios grandes de base de datos, diseño, monetización y juego. Las correcciones urgentes sí pueden salir como hotfix independiente.
