# V/R Match — Fase 8 · V/R+

Versión: **8.0.0**

Esta versión continúa directamente sobre la Fase 7. Mantiene cuentas, perfiles, descubrimiento por proximidad, matches, chat, juego integrado, email/recuperación y moderación avanzada.

## Qué añade Fase 8

### V/R+ como capa real de producto
- Estado de membresía V/R+ persistente en SQLite.
- Pantalla propia de V/R+.
- Estado Free / Plus visible para la propia cuenta.
- Administración manual de membresías durante la beta.
- La capa de cobro **NO está activada todavía**. El checkout real se conectará al pasar a producción.

### Rewind
- Usuarios V/R+ pueden recuperar el último perfil que hayan pasado.
- Solo revierte el último `pass`; no deshace matches ni likes mutuos.

### Filtros avanzados V/R+
- Solo cuentas con correo confirmado.
- Mínimo de intereses compartidos: 0–3.
- Orden de descubrimiento:
  - Compatibilidad.
  - Cercanía.
  - Intereses comunes.
  - Actividad reciente.

### Boost V/R+
- 1 Boost cada 24 horas.
- Duración: 30 minutos.
- Los perfiles con Boost se priorizan en Descubrir.
- No revela ubicación exacta ni datos privados.

### Panel administrador
Desde Moderación → Usuarios el administrador puede:
- Conceder V/R+ durante 30 días.
- Revocar V/R+.
- Ver si una cuenta tiene V/R+ activo.
- Las acciones quedan registradas en Historial.

## Pagos

En esta fase se implementa la **lógica de membresía y ventajas**, pero no se procesa ningún pago real.

Se deja para el cierre de producción, junto con:
- dominio propio,
- upgrade de Render,
- almacenamiento persistente,
- proveedor de pagos / checkout,
- webhooks de suscripción.

Esto evita cobrar dinero mientras el backend sigue en Render Free con almacenamiento efímero.

## Deploy

1. Descomprimir el ZIP.
2. Sustituir los archivos del repositorio GitHub.
3. Commit y push a `main`.
4. Render desplegará automáticamente.
5. Revisar logs.
6. Comprobar:

```text
/healthz
```

Respuesta esperada:

```json
{"ok":true,"db":true,"version":"8.0.0"}
```

En logs debe aparecer:

```text
V/R Match v8.0 escuchando en puerto 10000
```

## Cómo probar V/R+ durante la beta

1. Entrar con la cuenta administradora.
2. Abrir `Cuenta y seguridad` → `Panel de moderación`.
3. Ir a `Usuarios`.
4. Abrir un usuario.
5. Pulsar `Conceder V/R+ 30 días`.
6. La cuenta recibirá el estado V/R+ automáticamente si está conectada.
7. Abrir V/R+ desde Descubrir.
8. Probar Rewind, filtros avanzados y Boost.

## Importante

- `VR_ADMIN_EMAILS` continúa configurado únicamente en Render Environment.
- No guardar claves SMTP/API en GitHub.
- `VR_REQUIRE_EMAIL_VERIFICATION` puede seguir en `false` durante la beta.
- Render Free continúa usando filesystem temporal; los datos son de prueba hasta el upgrade final.
