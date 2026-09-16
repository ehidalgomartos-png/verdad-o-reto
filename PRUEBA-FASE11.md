# Checklist — Fase 11 · Preproducción

## Deploy
- [ ] Render muestra `V/R Match v11.0 escuchando en puerto 10000`.
- [ ] `/healthz` devuelve `version: 11.0.0`.
- [ ] La PWA sigue abriendo después del cambio de caché.

## Registro nuevo
- [ ] En Crear cuenta aparecen los dos consentimientos.
- [ ] Sin confirmar +18 no permite registrarse.
- [ ] Sin aceptar condiciones/privacidad no permite registrarse.
- [ ] Con ambos marcados permite crear la cuenta.
- [ ] Login normal no muestra esos checkboxes.

## Onboarding
- [ ] Una cuenta nueva ve el onboarding una sola vez.
- [ ] Pulsar Empezar lo marca como completado.
- [ ] Cerrar sesión y volver a entrar no lo vuelve a mostrar.

## Legal
- [ ] `/terms.html` abre.
- [ ] `/privacy.html` abre.
- [ ] `/community.html` abre.
- [ ] Los enlaces del login, Cuenta y footer funcionan.

## Admin / Producción
- [ ] Cuenta admin ve la pestaña Producción.
- [ ] Muestra dominio, persistencia, SMTP, verificación, admin, push y cobro.
- [ ] No muestra claves ni secretos.
- [ ] En Render Free debe marcar persistencia como pendiente.

## Regresión
- [ ] Perfil / ubicación.
- [ ] Descubrir / match.
- [ ] Chat.
- [ ] Juego y retorno al chat.
- [ ] Moderación.
- [ ] V/R+.
- [ ] Notificaciones.
- [ ] PWA instalable.
