# V/R Match V18.24.0 — Beta Valencia

## Objetivo
Controlar una beta real por ciudad sin cerrar el registro nacional. La beta sirve para medir activación, retorno y fricción de una cohorte concreta y recoger feedback voluntario.

## Administración → 🧪 Beta
- Ciudad configurable, con Valencia como valor inicial.
- Olas de beta numeradas.
- Alta masiva de hasta 100 cuentas activas de la ciudad, priorizando las más recientes/activas.
- Alta individual desde la ficha completa de usuario.
- Estados: activo, pausado, completado y retirado.
- Retirar de la beta no elimina ni bloquea la cuenta ordinaria.
- CSV de la cohorte.

## Métricas de cohorte
- Participantes activos.
- Activos en los últimos 7 días.
- Perfil listo.
- Primer like desde entrada en beta.
- Primer match desde entrada en beta.
- Primera conversación/interacción.
- Primer juego.
- Primera invitación/compartido.
- Retorno D1 y D7 con denominador elegible.
- Nota media y feedback recibido.

## Experiencia del participante
- Tarjeta “Beta VRMatch” en Cuenta y seguridad.
- Registro de apertura diaria de la app únicamente para participantes activos.
- Formulario específico de feedback con valoración 1–5 y categoría.
- El feedback no adjunta chats privados ni coordenadas.
- Aviso interno cuando un administrador incorpora la cuenta a una beta.

## Privacidad
- La beta guarda ciudad de cohorte, ola, fechas/estado, días de retorno e hitos de producto.
- No usa el contenido privado de chats para las métricas de cohorte.
- La participación en beta no cambia quién puede registrarse ni bloquea otras ciudades.
- Exportación de datos personales actualizada con datos de beta.

## Variables opcionales
```text
VR_BETA_CITY=Valencia
VR_BETA_BULK_LIMIT=100
```
No son obligatorias.
