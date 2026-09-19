# Checklist V18.16 — Calidad y Producción

## 1. Después de desplegar

1. Abre `https://vrmatch.es/healthz`.
2. Debe responder `ok: true`, `db: true`, `storage: true`, `version: 18.16.0`.
3. Entra como administrador → **Sistema**.
4. Comprueba que SQLite y almacenamiento aparecen correctos.

## 2. SMTP

1. En Administración → Sistema escribe la contraseña de tu cuenta administradora.
2. Pulsa **Probar SMTP**.
3. Debe llegar un correo a la dirección de esa cuenta.
4. Vuelve a Producción: “SMTP probado” debe figurar como configurado.

## 3. Restauración del backup

1. En Administración → Sistema escribe la contraseña admin.
2. Pulsa **Probar restauración**.
3. El servidor creará una copia temporal de SQLite, la abrirá y ejecutará `quick_check`.
4. Debe aparecer como correcta.
5. La copia temporal se elimina automáticamente al terminar.

La prueba de restauración no sustituye la copia manual: sigue descargando backups antes de cambios importantes y guárdalos fuera de Render.

## 4. Errores de servidor

1. Administración → Sistema → Errores recientes.
2. Si ocurre un error técnico, aparecerá con contexto, fecha, ruta y request-id cuando exista.
3. No debe mostrar contraseñas, tokens ni contenido de chat.

## 5. Tests automáticos

En una copia local del proyecto:

```bash
npm install
npm run check
npm test
```

El test usa una SQLite temporal y no toca la base de producción.

## 6. GitHub

El archivo `.github/workflows/vrmatch-tests.yml` ejecuta automáticamente los checks en cada push y pull request.

## 7. Antes de activar verificación de correo obligatoria

No cambies `VR_REQUIRE_EMAIL_VERIFICATION=true` hasta haber superado la prueba SMTP real. De lo contrario podrías impedir el acceso a usuarios que no reciben el correo.
