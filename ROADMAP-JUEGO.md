# V/R Match — evolución del juego

## V18.3 implementado

- Motor de turnos autoritativo en `server.js`.
- Ronda 3: **Los dos responden** — elección A/B oculta y revelación simultánea.
- Ronda 6: **Adivina a tu Match** — respuesta propia + predicción de la respuesta del otro.
- Ronda 8: **Final a dos voces** — respuesta de texto secreta de ambos y revelación simultánea.
- El servidor espera las dos respuestas antes de revelar datos.
- Tiempo máximo de ronda sincronizada controlado por servidor.
- Progreso compartido de partida y conteo de turnos por jugador.
- Final compartido solo cuando ambos han completado 8 turnos.
- Decisión final sincronizada: si ambos eligen seguir, se abren rondas extra; si cualquiera termina, se cierra la sala para ambos.
- Reacciones incluidas en las estadísticas compartidas.
- Se conserva Verdad/Reto, cámara, vídeo, salas privadas, lobby e invitaciones desde Match.

## Siguiente bloque recomendado

1. Historial opcional de partidas terminadas (sin guardar fotos/vídeos de retos).
2. Más bancos de cartas sincronizadas por mazo.
3. Cartas sincronizadas personalizadas con intereses compartidos desde servidor.
4. Animaciones/sonido/háptica para revelaciones y Match mental.
5. Métricas agregadas sobre abandono de partida y tipos de carta más usados, sin almacenar respuestas privadas.
