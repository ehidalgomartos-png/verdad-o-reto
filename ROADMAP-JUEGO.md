# V/R Match · siguiente evolución del juego

## Ya implementado en V18.2
La partida deja de ser una secuencia plana de Verdad/Reto. Ahora tiene cuatro fases visuales, cartas especiales, cartas contextuales por intereses compartidos, tiempos variables, una ronda final y continuidad mediante rondas extra.

## Fase servidor recomendada
Para implementar correctamente las mecánicas simultáneas hay que modificar el backend Socket.IO. La propuesta es crear un estado de partida por sala con `round`, `phase`, `specialType`, `answers`, `revealed`, `stats` y `finished`.

### Respuesta secreta de ambos
El servidor envía la misma pregunta a ambos. Cada jugador responde sin ver la respuesta contraria. Cuando existen dos respuestas, el servidor emite `game_reveal` y ambos clientes las muestran a la vez.

### Adivina su respuesta
Primero cada usuario marca qué cree que responderá el rival; después responde personalmente. El servidor espera las cuatro entradas y revela coincidencias sin convertirlo en una puntuación de compatibilidad científica.

### Final sincronizado
Al completar la ronda objetivo, el servidor congela la mesa, envía un resumen compartido y ofrece `seguir`, `volver al chat` o `revancha`. Si ambos eligen seguir, se crea una fase extra sincronizada.

### Historial de partida
Guardar únicamente metadatos necesarios: mazo, rondas completadas, tipos de carta y reacciones agregadas. No es necesario conservar fotos o vídeos de pruebas para construir un historial atractivo.
