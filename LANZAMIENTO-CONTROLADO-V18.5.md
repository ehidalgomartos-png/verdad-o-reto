# V/R Match — lanzamiento controlado desde V18.5

## Objetivo

Empezar a recibir usuarios reales cuanto antes sin convertir cada actualización en un riesgo para el producto.

## Primer grupo

Comienza con un grupo pequeño y manejable. Lo importante durante los primeros días no es el volumen bruto, sino comprobar si las personas completan el recorrido:

**registro → perfil → Match → mensaje → partida → vuelta al chat**

## Antes de invitar usuarios

- Confirmar `/healthz` en 18.5.0.
- Dos cuentas reales completan una partida entera.
- Registro/login, fotos, Match, chat, bloqueo y denuncia funcionan.
- Revisar Render Logs después del deploy.
- Verificar dónde persisten SQLite y uploads. Si el almacenamiento puede desaparecer con un reinicio, mantener el lanzamiento como piloto limitado.
- Mantener secretos únicamente en Render Environment.

## Ritmo diario recomendado

**Mañana:** revisar Admin → Métricas, feedback y errores.

**Durante el día:** elegir un único problema o mejora con impacto claro.

**Antes de publicar:** `npm run check`, prueba rápida con dos cuentas y copia/estado de la base si ya existe almacenamiento persistente.

**Después del deploy:** comprobar `/healthz`, una partida corta y los logs.

Evita rediseñar varias áreas a la vez. La velocidad viene de publicar cambios pequeños que podamos medir y revertir, no de acumular funciones.

## Métricas clave desde V18.5

- altas;
- usuarios activos;
- Matches;
- mensajes;
- partidas iniciadas;
- partidas finalizadas;
- usuarios nuevos que llegan a jugar;
- errores del cliente;
- denuncias y feedback.

## Qué no guarda el historial de partidas

No guarda respuestas, contenido de cartas, fotos, vídeos ni el texto privado intercambiado durante las rondas sincronizadas. Solo métricas agregadas de la sesión.
