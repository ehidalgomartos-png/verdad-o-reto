# V/R Match MVP

Primera evolución del juego V/R hacia una experiencia de citas basada en match + juego.

## Qué incluye
- Perfil +18 con foto/avatar, ciudad, bio e intereses.
- Pantalla Descubrir con tarjetas y gesto swipe (también botones).
- Likes mutuos y modal de Match.
- Lista de Matches.
- Invitación consensuada a jugar Rompehielos.
- Reutiliza el motor original: Socket.IO, turnos, Verdad/Reto, texto, foto, vídeo y reacciones.
- Los perfiles, likes y matches viven en memoria del servidor: al reiniciar se borran.

## Cómo probar
1. Ejecuta `npm install`.
2. Ejecuta `npm start`.
3. Abre `http://localhost:3000` en dos ventanas o navegadores diferentes.
4. Crea dos perfiles mayores de 18 años.
5. Da like desde ambos perfiles.
6. Al producirse el match, invita a jugar y acepta desde la otra ventana.

## Siguiente fase sugerida
Persistencia con base de datos, autenticación, varias fotos, preferencias/filtros, bloqueo/denuncia, chat persistente y controles de privacidad.
