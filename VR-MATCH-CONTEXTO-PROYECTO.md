# V/R MATCH — CONTEXTO MAESTRO DEL PROYECTO

**Última actualización:** 16 de septiembre de 2026  
**Estado:** Fases 4, 5 y 6 validadas; Fase 7 preparada para desplegar  
**Proyecto:** V/R Match  
**Concepto:** App de citas donde, después de hacer match, dos personas pueden conversar y jugar dinámicas tipo Verdad o Reto / Rompehielos dentro de la propia experiencia de dating.

---

## 1. IDEA CENTRAL

V/R Match nació a partir de un proyecto previo de **Verdad o Reto multijugador online**.

La evolución del concepto es:

**DESCUBRIR → LIKE → MATCH → CHAT → JUGAR → VOLVER AL CHAT**

La diferencia principal frente a una app de citas convencional es que el match no termina en un chat vacío. El juego sirve como herramienta para romper el hielo, generar conversación y conocerse.

---

## 2. PRINCIPIO DE PRODUCTO

V/R Match debe sentirse primero como una **app de citas** y después como un juego.

El juego debe estar integrado en la experiencia, no sentirse como una aplicación aparte.

Ejemplo de flujo:

1. Usuario crea cuenta.
2. Completa su perfil.
3. Configura preferencias.
4. Explora perfiles.
5. Da like o pasa.
6. Si el like es mutuo, hay match.
7. Se abre un chat.
8. Desde el chat se puede invitar a jugar.
9. Ambos aceptan el tipo de juego.
10. Se juega.
11. Al terminar, vuelven directamente a la conversación.

---

## 3. URL PÚBLICA ACTUAL

Aplicación publicada en Render:

**https://verdad-o-reto-zz0k.onrender.com**

La versión desplegada fue probada manualmente y el núcleo funcionó correctamente:

- registro/login
- perfiles
- descubrimiento
- likes
- match
- chat
- juego desde el chat
- regreso a la conversación después del juego

---

## 4. STACK ACTUAL

### Frontend
- HTML
- CSS
- JavaScript vanilla

### Backend
- Node.js
- Express
- Socket.IO

### Base de datos
- SQLite

### Autenticación / seguridad
- sesiones persistentes
- contraseñas hasheadas
- tokens/sesiones
- controles básicos de seguridad

### Hosting / despliegue
- GitHub
- Render

---

## 5. FLUJO DE TRABAJO DEL PROYECTO

El flujo de trabajo acordado es:

**ChatGPT prepara nueva versión → usuario sube los archivos a GitHub → Render detecta el push → Render despliega automáticamente**

GitHub debe considerarse la **fuente principal del código**.

Este archivo sirve como la **memoria técnica y funcional** del proyecto.

---

# 6. FASES COMPLETADAS

## FASE 1 — Juego original

El proyecto original incluía:

- creación de perfil
- avatar/foto
- edad
- mazos
- lobby
- emparejamiento online
- salas privadas
- invitación por WhatsApp
- Verdad
- Reto
- turnos
- temporizador
- respuestas de texto
- foto en directo
- vídeo en directo
- reacciones
- Socket.IO
- Express

Mazos originales:

- Rompehielos
- Parejas
- Sección XX +18

---

## FASE 2 — Conversión a app de citas

Se añadió la capa de dating.

Funciones creadas:

- pantalla Descubrir
- tarjetas visuales de perfiles
- swipe
- likes
- match mutuo
- pantalla de matches
- galería de fotos
- filtros
- chat en tiempo real
- integración del juego dentro del chat
- retorno al chat al terminar una partida

Se decidió que toda la plataforma debe ser **solo para mayores de 18 años**.

---

## FASE 3 — Persistencia y cuentas reales

La app dejó de ser solamente un prototipo temporal.

Se añadió:

- registro
- login
- sesiones persistentes
- SQLite
- perfiles persistentes
- likes persistentes
- matches persistentes
- mensajes persistentes
- preferencias de búsqueda
- fotos de perfil guardadas
- bloqueo
- denuncias
- deshacer match

Preferencias incluidas:

- identidad/género
- quién quiere conocer
- edad mínima
- edad máxima
- ciudad
- intereses compartidos

---

## 7. RENDER + GITHUB

El proyecto ya fue configurado para funcionar con Render.

Configuración utilizada:

### Build Command

```bash
npm install
```

### Start Command

```bash
npm start
```

### Health Check Path

```text
/healthz
```

Render asigna automáticamente el puerto mediante `process.env.PORT`.

El servidor debe escuchar en:

```text
0.0.0.0
```

---

## 8. ALMACENAMIENTO EN RENDER

El proyecto fue preparado para utilizar:

```text
VR_STORAGE_DIR=/var/data
```

El objetivo es guardar de forma persistente:

```text
/var/data/data/vrmatch.db
/var/data/uploads/
```

Esto permite conservar:

- usuarios
- sesiones
- likes
- matches
- chats
- fotos

### IMPORTANTE

En Render Free el filesystem puede ser efímero.

Para producción real se recomienda:

- Render Web Service de pago
- Persistent Disk
- Mount Path:

```text
/var/data
```

---

# 9. FASE 4 — SEGURIDAD Y CUENTAS

La Fase 4 fue desarrollada después de confirmar que el MVP publicado funcionaba correctamente.

Archivo preparado:

**VR-Match-Fase4-Render.zip**

Esta fase está pensada para sustituir los archivos actuales del repositorio GitHub.

## Funciones añadidas

### Cuenta y seguridad
- recuperación de contraseña
- cambio de contraseña
- eliminación de cuenta
- controles de privacidad
- pausa del perfil

### Privacidad
- ocultar perfil
- ocultar estado online
- controlar invitaciones a jugar

### Seguridad
- rate limiting
- protección anti-spam
- bloqueo
- denuncias
- moderación básica

### Administración
- panel de moderación
- cola de denuncias
- acciones administrativas

Los administradores se definen mediante variables de entorno.

---

# 10. VERIFICACIÓN DE EMAIL

La arquitectura para verificación de correo está preparada.

Sin embargo:

**NO activar todavía**

```text
VR_REQUIRE_EMAIL_VERIFICATION=true
```

hasta configurar correctamente un proveedor SMTP.

Para recuperación de contraseña y verificación real se necesita configurar envío de correo.

Variables previstas:

```text
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
SMTP_FROM
```

No guardar contraseñas SMTP dentro de GitHub.

Configurar siempre los secretos en:

**Render → Environment**

---

# 11. CORS

La versión preparada para Render restringe CORS al dominio:

```text
https://verdad-o-reto-zz0k.onrender.com
```

Si en el futuro se usa un dominio personalizado, habrá que actualizar la configuración.

---

# 12. NODE

La versión Render Ready / Fase 4 fija una versión estable de Node.

Objetivo:

**Node.js 22**

Esto evita depender automáticamente de versiones demasiado nuevas.

---

# 13. HEALTH CHECK

La aplicación dispone de:

```text
/healthz
```

Resultado esperado aproximado:

```json
{
  "ok": true,
  "db": true,
  "version": "5.0.0"
}
```

---

# 14. SEGURIDAD IMPORTANTE YA CORREGIDA

En una versión anterior se servía la carpeta completa del proyecto mediante Express.

Eso podía convertirse en un problema una vez añadida SQLite.

Se modificó la arquitectura para evitar exponer públicamente:

- base de datos
- server.js
- archivos privados
- configuración interna

Solo deben servirse públicamente los archivos necesarios:

- interfaz
- CSS
- assets públicos
- imágenes autorizadas

---

# 15. V/R+

Existe un botón/placeholder llamado:

**V/R+**

Actualmente no representa todavía una suscripción real.

Cuando se pulsa puede aparecer un mensaje parecido a:

> V/R+ llegará en una siguiente fase. Primero estamos validando el núcleo de la app.

Esto es intencional.

No debe interpretarse como error.

---

# 16. IDEA FUTURA DE V/R+

Funciones planteadas para una futura versión premium:

- volver al perfil anterior
- filtros avanzados
- boosts
- mayor visibilidad
- otras ventajas premium

Todavía no se ha definido el modelo final de monetización.

---

# 17. DINÁMICAS DE JUEGO

La aplicación conserva el sistema original de juego.

Opciones principales planteadas:

### 🧊 Rompe el hielo
Preguntas ligeras para iniciar conversación.

### ❤️ Conóceme
Preguntas de personalidad, gustos y compatibilidad.

### 🎮 Verdad o Reto
Dinámica central original.

### 🔥 After Dark +18
Contenido adulto.

Para contenidos +18 debe existir consentimiento de ambos usuarios.

Nunca debe enviarse contenido adulto automáticamente sin aceptación de los dos participantes.

---

# 18. EXPERIENCIA DE CHAT

Una decisión importante del producto es que el juego debe vivir dentro de la conversación.

Por tanto:

**Chat → invitar a jugar → partida → finalizar → regresar al mismo chat**

No se debe enviar al usuario a la pantalla Descubrir después de terminar la partida.

---

# 19. SEGURIDAD PARA UNA APP DE CITAS

Elementos considerados imprescindibles:

- plataforma solo +18
- bloquear usuario
- denunciar usuario
- deshacer match
- eliminar cuenta
- control de contenido adulto
- consentimiento de ambos jugadores
- moderación
- protección anti-spam
- límites de peticiones
- privacidad de imágenes
- protección de datos

---

# 20. COSAS QUE NO DEBEN GUARDARSE EN ESTE ARCHIVO

No añadir nunca:

- contraseñas
- claves SMTP
- claves API
- tokens
- secretos de Render
- credenciales de base de datos
- claves privadas

Esos datos deben vivir únicamente en:

**Render → Environment Variables**

---

# 21. ARCHIVOS PRINCIPALES DEL PROYECTO

La estructura habitual es similar a:

```text
index.html
styles.css
server.js
package.json
render.yaml
.gitignore
README.md
```

También pueden existir:

```text
uploads/
data/
```

dependiendo del entorno.

---

# 22. GITHUB

Al desplegar una versión nueva:

1. Descomprimir el ZIP generado.
2. No subir el ZIP directamente.
3. Sustituir los archivos correspondientes en el repositorio.
4. Commit.
5. Push a la rama conectada con Render.
6. Render realiza el deploy automáticamente.
7. Revisar logs.
8. Probar la aplicación.

---

# 23. PRUEBA MÍNIMA DESPUÉS DE CADA DEPLOY

Siempre probar con dos usuarios diferentes.

Idealmente:

- navegador normal
- navegador incógnito

Checklist:

- [ ] crear cuenta A
- [ ] crear cuenta B
- [ ] iniciar sesión
- [ ] editar perfil
- [ ] subir foto
- [ ] comprobar Descubrir
- [ ] A da like a B
- [ ] B da like a A
- [ ] aparece Match
- [ ] abrir chat
- [ ] enviar mensaje
- [ ] recargar navegador
- [ ] comprobar historial
- [ ] iniciar juego
- [ ] aceptar juego
- [ ] responder carta
- [ ] terminar/salir de partida
- [ ] regresar al chat
- [ ] bloquear
- [ ] denunciar
- [ ] revisar logs

---

# 24. ESTADO ACTUAL

El núcleo del producto fue probado en Render y funcionó correctamente.

Confirmado manualmente:

- cuentas
- login
- perfiles
- descubrimiento
- match
- chat
- juego
- retorno al chat

La siguiente versión preparada es:

**FASE 4 — Seguridad y persistencia**

Antes de continuar con nuevas funciones, desplegar y validar esta fase.

---

# 25. SIGUIENTE PASO RECOMENDADO

### Paso inmediato

Subir **VR-Match-Fase4-Render** a GitHub y dejar que Render haga el deploy.

Después revisar:

```text
Render → Logs
```

y comprobar:

```text
/healthz
```

### Después

Configurar email real mediante SMTP para:

- recuperación de contraseña
- verificación de email

Luego activar, cuando esté probado:

```text
VR_REQUIRE_EMAIL_VERIFICATION=true
```

---

# 26. FASES FUTURAS PROPUESTAS

## Fase 5 — Email y recuperación real
- proveedor SMTP
- verificación de email
- recuperar contraseña
- plantillas de correo
- enlaces con expiración

## Fase 6 — Geolocalización y descubrimiento
- distancia entre perfiles
- radio de búsqueda
- ciudad/ubicación
- preferencias avanzadas

## Fase 7 — Moderación
- panel admin completo
- revisar denuncias
- suspensión de usuarios
- eliminación de contenido
- historial de acciones

## Fase 8 — V/R+
- suscripción
- filtros avanzados
- rewind
- boosts
- visibilidad adicional
- ventajas de juego

## Fase 9 — Notificaciones
- nuevo match
- nuevo mensaje
- invitación a juego
- turno de juego
- push notifications

## Fase 10 — Producto móvil
Evaluar:
- PWA
- React Native
- Flutter
- app iOS/Android

---

# 27. IDENTIDAD DEL PRODUCTO

Nombre actual:

**V/R Match**

Concepto verbal:

**Dating meets Truth or Dare**

Ideas de mensaje:

**Haz match. Rompe el hielo. Descubre si hay química.**

El producto no debe presentarse como una copia directa de Tinder.

La diferenciación debe estar en:

**conocer personas jugando.**

---

# 28. DIRECTRIZ DE DISEÑO

Estética actual:

- fondo oscuro
- rosa/fucsia
- azul/cyan
- tarjetas
- gradientes
- estilo moderno
- experiencia móvil primero

La interfaz debe evolucionar hacia:

- fotos más protagonistas
- menos sensación de formulario
- tarjetas de perfil más visuales
- animaciones de match
- chat limpio
- juego integrado
- identidad propia V/R

---

# 29. DECISIONES IMPORTANTES QUE NO SE DEBEN PERDER

1. No reconstruir el juego desde cero.
2. Reutilizar el motor de Verdad o Reto existente.
3. App únicamente +18.
4. Match antes de jugar.
5. Consentimiento para contenido adulto.
6. Juego integrado en el chat.
7. Volver al chat al finalizar.
8. Persistencia mediante base de datos.
9. GitHub es la fuente principal del código.
10. Render es el hosting actual.
11. Secretos fuera de GitHub.
12. Primero validar estabilidad; después monetización.

---

# 30. CÓMO CONTINUAR EN OTRO CHAT DE CHATGPT

En un chat nuevo:

1. Adjuntar este archivo.
2. Escribir:

> **Continuemos el proyecto V/R Match desde el punto descrito en este archivo.**

3. Si existe una nueva versión del código, adjuntarla también.
4. Si hay un error de Render, adjuntar captura de los Logs.
5. Si se va a modificar código, utilizar siempre la versión más reciente del repositorio/ZIP.

---

# 31. MENSAJE RECOMENDADO PARA RETOMAR

Copiar y pegar:

> Estoy desarrollando V/R Match, una app de citas donde después del match los usuarios pueden conversar y jugar dinámicas de Rompehielos / Verdad o Reto. El proyecto está en GitHub y desplegado en Render. Lee el archivo VR-MATCH-CONTEXTO-PROYECTO.md que adjunto y continuemos exactamente desde el estado descrito. No reconstruyas el proyecto desde cero y conserva el flujo actual de cuentas → descubrir → match → chat → juego → regreso al chat.

---

# 32. NOTA FINAL

Este documento debe actualizarse cuando ocurra alguno de estos cambios:

- nueva fase
- cambio de hosting
- cambio de base de datos
- nuevo dominio
- nuevas variables de entorno
- integración de email
- integración de pagos
- cambio importante de arquitectura
- publicación móvil

La finalidad es que el proyecto pueda retomarse rápidamente incluso meses después sin depender del historial completo del chat.


---

# ACTUALIZACIÓN — 16 DE SEPTIEMBRE DE 2026 · FASES 5 Y 6

## Fase 5 validada

- SMTP configurado y probado con Resend.
- Render Free utiliza `SMTP_PORT=2465`.
- Verificación de correo probada correctamente.
- Recuperación de contraseña probada correctamente.
- Cambio de contraseña probado correctamente.
- `VR_REQUIRE_EMAIL_VERIFICATION=false` se mantiene durante desarrollo.
- Dominio propio + remitente profesional + verificación obligatoria quedan para la etapa final.
- Upgrade de Render y persistencia definitiva también quedan para la etapa final.

## Fase 6 desarrollada

- Geolocalización opcional desde el perfil mediante permiso del navegador.
- Coordenadas redondeadas a 3 decimales en servidor.
- Nunca se exponen coordenadas a otros usuarios.
- Descubrir/matches solo reciben datos públicos + distancia aproximada; preferencias privadas, privacidad y metadatos de ubicación no se comparten con otros usuarios.
- Distancia pública aproximada en kilómetros.
- Radio de descubrimiento: 5 / 15 / 30 / 50 / 100 / 200 km.
- Descubrir ordena perfiles por proximidad cuando la ubicación está activada.
- El radio guardado funciona como filtro real de servidor.
- Filtro rápido de distancia permite reducir resultados desde Descubrir.
- El usuario puede quitar su ubicación.
- Sin ubicación, V/R Match mantiene el descubrimiento tradicional por preferencias/ciudad.
- `/healthz` pasa a versión `6.0.0`.

## Render durante desarrollo

El servicio continúa en Render Free. No se debe añadir `VR_STORAGE_DIR=/var/data` hasta contar con Persistent Disk o una estrategia de persistencia equivalente. Los usuarios/datos actuales deben considerarse de prueba.


---

# ACTUALIZACIÓN — 16 DE SEPTIEMBRE DE 2026 · FASE 7

## Fase 6 validada

La geolocalización y el descubrimiento por proximidad fueron desplegados y probados correctamente.

`/healthz` confirmó:

```json
{"ok":true,"db":true,"version":"6.0.0"}
```

## Fase 7 preparada — Moderación avanzada

La siguiente versión preparada es:

**V/R Match 7.0.0 — Centro de moderación**

Funciones añadidas:

- panel administrativo dividido en Denuncias, Usuarios e Historial;
- estadísticas de usuarios activos/suspendidos, matches, denuncias, mensajes y acciones recientes;
- filtros de denuncias por estado, motivo y búsqueda;
- nuevas denuncias guardan un contexto limitado de los últimos mensajes del match como evidencia;
- suspensión y reactivación de cuentas;
- usuarios suspendidos no aparecen en Descubrir ni como matches disponibles;
- búsqueda administrativa de usuarios;
- ficha de moderación por cuenta;
- ocultar/mostrar perfiles;
- eliminar fotos de perfil;
- limpiar biografía;
- eliminar mensajes concretos desde una denuncia;
- sincronización en tiempo real cuando moderación elimina un mensaje;
- historial persistente de acciones administrativas;
- ubicación precisa nunca expuesta al panel.

## Administración

Para habilitar una cuenta administradora se utiliza exclusivamente:

```text
VR_ADMIN_EMAILS=correo-admin@ejemplo.com
```

en **Render → Environment**.

No introducir correos administrativos directamente en el código.

## Estado de infraestructura

Se mantiene durante desarrollo:

```text
VR_REQUIRE_EMAIL_VERIFICATION=false
```

y Render Free sin Persistent Disk.

Queda para cierre de desarrollo:

- dominio propio;
- remitente profesional en Resend;
- verificación obligatoria;
- upgrade de Render;
- persistencia definitiva;
- backups y almacenamiento de imágenes.

---

# ACTUALIZACIÓN — 16 DE SEPTIEMBRE DE 2026 · FASE 8

## Fase 7 desplegada

El Centro de moderación fue desplegado y la cuenta administradora quedó reconocida mediante `VR_ADMIN_EMAILS`.

## Fase 8 preparada — V/R+

La siguiente versión preparada es:

**V/R Match 8.0.0 — V/R+**

### Membresía

Se añade una capa persistente de membresía V/R+ en SQLite. Durante la beta la membresía se concede o revoca desde el panel administrador.

No existe todavía cobro real. El checkout/proveedor de pagos se conectará en producción, después de resolver dominio, Render de pago y persistencia definitiva.

### Funciones V/R+

- Rewind del último perfil pasado.
- Filtro de cuentas con correo confirmado.
- Mínimo de 0–3 intereses compartidos.
- Orden premium por compatibilidad, cercanía, intereses o actividad reciente.
- Boost de 30 minutos.
- Un Boost disponible cada 24 horas.
- Perfiles con Boost se priorizan en Descubrir.
- Pantalla propia de V/R+ y estado Free / Plus.

### Administración de V/R+

Desde Moderación → Usuarios:

- `Conceder V/R+ 30 días`.
- `Revocar V/R+`.
- Estado V/R+ visible en la ficha administrativa.
- Concesión/revocación registrada en historial.
- Si el usuario está conectado, el estado V/R+ se sincroniza en tiempo real.

### Privacidad

V/R+ no expone:

- coordenadas;
- preferencias privadas;
- configuración interna;
- email del usuario a otros perfiles.

El indicador `Correo confirmado` únicamente refleja verificación de email y no debe presentarse como verificación de identidad.

## Producción pendiente

Dejar para el cierre:

- dominio propio;
- Render Starter/Persistent Disk o migración de base de datos;
- almacenamiento persistente de imágenes;
- checkout real y webhooks del proveedor de pagos;
- remitente profesional de correo;
- `VR_REQUIRE_EMAIL_VERIFICATION=true`;
- copias de seguridad.

## Health check esperado

```json
{"ok":true,"db":true,"version":"8.0.0"}
```

---

# ACTUALIZACIÓN — FASE 9 · NOTIFICACIONES

**Versión preparada:** 9.0.0

Se incorpora un sistema persistente de notificaciones para:
- nuevo match,
- nuevo mensaje,
- invitación a jugar,
- turno de juego.

Incluye centro de notificaciones, contador de no leídas, preferencias por usuario y arquitectura opcional de Web Push mediante VAPID + Service Worker (`sw.js`).

El Web Push de fondo puede permanecer sin configurar durante la beta. Las claves VAPID, si se activan, deben vivir únicamente en Render Environment y nunca en GitHub.

Siguiente paso después de validar Fase 9: **Fase 10 — producto móvil / PWA y evaluación de empaquetado móvil**.
