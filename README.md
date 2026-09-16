# Foto/Avatar + vídeo grabado en el momento (máximo 30 s)

Este paquete añade al perfil:

- Foto de perfil desde imagen.
- Avatares predeterminados.
- Grabación de vídeo únicamente desde cámara + micrófono.
- Duración máxima de 30 segundos.
- Parada automática al llegar a 00:30.
- Contador visible.
- Cambio entre cámara frontal y trasera cuando el dispositivo dispone de más de una cámara.
- Previsualización del vídeo.
- Botones "Repetir vídeo" y "Usar vídeo".
- No existe selector para subir un vídeo ya guardado.

## Archivos

- `index.html`: demostración de la interfaz.
- `profile-media.css`: estilos.
- `profile-media.js`: lógica de foto/avatar y MediaRecorder.
- `README.md`: este archivo.

## Prueba local

La cámara del navegador normalmente requiere un contexto seguro:
- `https://`, o
- `localhost`.

No abras simplemente `index.html` con `file://` si el navegador bloquea la cámara.

Ejemplo rápido:
```bash
python -m http.server 8080
```

Después abre:
`http://localhost:8080`

## Integración con el backend

Cuando el usuario pulsa **Usar vídeo**, el módulo emite:

```js
profileVideoRecorded
```

El `event.detail.blob` contiene el archivo de vídeo generado.

También se emiten:
- `profilePhotoSelected`
- `profileAvatarSelected`

Puedes reemplazar el evento por una subida `fetch()` a la API de tu proyecto.

## Importante sobre la regla "solo grabado al momento"

La interfaz no ofrece ningún input para cargar vídeos desde archivos. La grabación se genera mediante `getUserMedia()` + `MediaRecorder`.

Para una aplicación real, la validación definitiva debe hacerse también en el backend (autenticación, tamaño, formato, sesión de grabación y políticas de almacenamiento), porque ninguna restricción puramente visual del navegador debe considerarse una medida de seguridad absoluta.

## Compatibilidad

Funciona mejor en navegadores modernos con soporte de:
- `navigator.mediaDevices.getUserMedia`
- `MediaRecorder`

En iPhone/iPad conviene probar la versión concreta de Safari que se vaya a usar.
