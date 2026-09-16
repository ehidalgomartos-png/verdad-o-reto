# Prueba rápida — Fase 7 Moderación

## 1. Deploy

Después del push a GitHub, revisa Render:

```text
V/R Match v7.0 escuchando en puerto 10000
Your service is live
```

Después abre:

```text
/healthz
```

Debe responder:

```json
{"ok":true,"db":true,"version":"7.0.0"}
```

## 2. Configurar administrador

En Render → Environment añade:

```text
VR_ADMIN_EMAILS=<correo de una cuenta existente de V/R Match>
```

Guarda y redespliega.

Inicia sesión con esa cuenta y abre:

**Cuenta y seguridad → Abrir panel de moderación**

## 3. Crear una denuncia

Usa dos cuentas:

- Cuenta A
- Cuenta B

Haz match, intercambia varios mensajes y desde A denuncia a B.

En el panel de administrador:

- abre **Denuncias**;
- comprueba que aparece la denuncia;
- comprueba que se muestra un contexto limitado de mensajes anteriores;
- verifica que no aparecen coordenadas de ubicación.

## 4. Acciones de denuncia

Prueba:

- Resolver.
- Descartar.
- Suspender cuenta.
- Reactivar cuenta.

Al suspender:

- la sesión del usuario debe cerrarse;
- el usuario suspendido no debe aparecer en Descubrir;
- mientras siga suspendido no debe aparecer como match disponible.

## 5. Moderar un mensaje

Desde una denuncia que tenga evidencia:

1. pulsa **Eliminar mensaje**;
2. confirma;
3. abre el chat de los dos usuarios;
4. el mensaje debe desaparecer;
5. revisa **Historial** y confirma que aparece la acción.

## 6. Gestión de usuarios

En la pestaña **Usuarios**:

- busca por nombre;
- busca por correo;
- filtra suspendidos;
- abre la ficha de un usuario.

Prueba:

- Ocultar perfil.
- Mostrar perfil.
- Limpiar biografía.
- Eliminar fotos.

Cada acción debe aparecer después en **Historial**.

## 7. Regresión del núcleo

Antes de cerrar la fase vuelve a probar:

- registro/login;
- editar perfil;
- geolocalización;
- Descubrir;
- like mutuo;
- match;
- chat;
- juego desde chat;
- regreso al chat;
- recuperación de contraseña.
