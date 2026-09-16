# V/R Match — Fase 12 · Observabilidad y feedback beta

Versión: **12.0.0**

Esta fase prepara V/R Match para una beta más seria antes de pagar infraestructura o conectar dominio/pagos. No añade trackers externos: las métricas se calculan dentro del propio backend con los datos que la app ya necesita para funcionar.

## Qué añade

- panel admin **Métricas** con periodos 24 h / 7 días / 30 días;
- embudo registro → perfil → match → mensaje;
- actividad agregada de altas, likes, matches, mensajes, denuncias y feedback;
- diagnóstico de instancia: uptime, memoria, sockets, usuarios online, tamaño SQLite y uploads;
- registro limitado de errores JavaScript de usuarios autenticados, sin stack completo ni contenido de chats;
- apartado **Beta y soporte** dentro de Cuenta;
- formulario de feedback para errores, ideas y experiencia de uso;
- panel admin **Feedback** para resolver, descartar o reabrir comentarios;
- auditoría de acciones sobre feedback;
- Service Worker v12;
- health check `12.0.0`.

## Privacidad

No se instala Google Analytics, Meta Pixel ni un servicio de analítica de terceros. Las métricas son internas y agregadas. El feedback no adjunta chats, fotos ni coordenadas. La telemetría de errores guarda únicamente un mensaje técnico limitado, página y posición aproximada del error.

## Producción pendiente

Se mantiene para el cierre:

- dominio propio;
- Render de pago + persistencia definitiva / base administrada;
- almacenamiento persistente de imágenes;
- remitente profesional;
- `VR_REQUIRE_EMAIL_VERIFICATION=true`;
- VAPID si se activa push de fondo;
- checkout real V/R+;
- revisión jurídica final.

## Deploy

No requiere variables nuevas. Sustituye los archivos del repositorio y deja que Render despliegue.

Esperado:

```text
V/R Match v12.0 escuchando en puerto 10000
Observabilidad beta: métricas internas + feedback + diagnóstico cliente
```

```json
{"ok":true,"db":true,"version":"12.0.0"}
```

Consulta `PRUEBA-FASE12.md`.
