# V/R Match — Fase 11 · Preproducción

Versión: **11.0.0**

Esta fase no añade un nuevo modelo de negocio ni cambia el núcleo dating → chat → juego. Su objetivo es **pulir la beta y preparar el salto posterior a producción**.

## Qué añade

- onboarding persistente de bienvenida;
- confirmación +18 y aceptación explícita de condiciones/privacidad al registrar cuentas nuevas;
- borradores beta de Condiciones, Privacidad y Normas de comunidad;
- enlaces legales desde login, cuenta y footer;
- panel admin **Producción** con checklist técnico;
- endpoint admin `/api/admin/production-readiness`;
- cabeceras de seguridad adicionales (CSP, COOP, CORP, no-store en API);
- `index.html` sin caché HTTP para reducir versiones visuales obsoletas tras deploy;
- Service Worker actualizado a caché `v11`;
- health check `11.0.0`.

## Importante

Los textos legales son **borradores de beta, no una revisión jurídica final**. Antes del lanzamiento comercial deben adaptarse a la entidad responsable, política real de conservación, proveedores, jurisdicción y cumplimiento aplicable.

## Pendiente para cierre de producción

- dominio propio;
- Render de pago + almacenamiento persistente o migración de base de datos/objetos;
- remitente de correo en dominio propio;
- activar `VR_REQUIRE_EMAIL_VERIFICATION=true`;
- VAPID si se quiere push real en segundo plano;
- checkout real de V/R+;
- revisión jurídica final.

## Deploy

No requiere nuevas variables obligatorias. Sustituye los archivos del repositorio y deja que Render despliegue.

Esperado:

```text
V/R Match v11.0 escuchando en puerto 10000
Preproducción: pendiente | legal beta-2026-09-16
```

```json
{"ok":true,"db":true,"version":"11.0.0"}
```

Consulta `PRUEBA-FASE11.md`.
