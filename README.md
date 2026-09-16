# V/R Match — MVP Step 2

V/R Match mezcla una experiencia de dating con el juego multijugador de Verdad o Reto ya existente.

## Qué incluye esta versión

- App solo para mayores de 18 años.
- Perfil con nombre, edad, ciudad, bio, intereses y galería de hasta 4 fotos.
- Descubrir con tarjetas, swipe táctil, galería por perfil y filtros por edad, ciudad e interés.
- Likes mutuos y animación de match.
- Lista de matches.
- Chat en tiempo real entre matches mediante Socket.IO.
- Inicios de conversación para evitar el chat vacío.
- Invitación a jugar desde el propio chat: Rompehielos, Conóceme o After Dark.
- El juego original conserva turnos, texto, cámara, vídeo y reacciones.
- Al terminar un juego iniciado desde un chat, se vuelve a esa conversación.
- V/R+ aparece solo como preparación visual; no bloquea el núcleo del MVP.

## Ejecutar

```bash
npm install
npm start
```

Abre `http://localhost:3000` en dos navegadores, perfiles o dispositivos que puedan acceder al mismo servidor. Crea dos usuarios, da like desde ambos y prueba match → chat → juego.

## Preview sin servidor

Abre `preview.html`. Es una demo visual local con perfiles simulados, galería, match y chat.

## Importante para una siguiente fase

Este MVP guarda perfiles, likes y relaciones de sockets en memoria. Las fotos viajan comprimidas como Data URLs para facilitar la prueba. Antes de producción conviene migrar a base de datos, autenticación, almacenamiento de imágenes/medios, moderación/reportes, presencia, bloqueo y gestión de privacidad.
