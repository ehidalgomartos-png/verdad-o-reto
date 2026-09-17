# Checklist de integración

- [ ] Hacer copia de seguridad de la SQLite actual.
- [ ] Ejecutar `migration.sql`.
- [ ] Importar `createLaunchSystem`.
- [ ] Pasar la instancia `db` real.
- [ ] Pasar el middleware `adminGuard` real.
- [ ] Montar `/api/launch`.
- [ ] Montar `/api/admin/launch`.
- [ ] Servir `/espera`.
- [ ] Servir `/activar`.
- [ ] Servir `/admin/launch` detrás del adminGuard.
- [ ] Configurar APP_BASE_URL.
- [ ] Configurar RESEND_API_KEY y MAIL_FROM.
- [ ] Conectar `finalizeActivation()` al final del alta/perfil real.
- [ ] Probar con una ciudad de prueba.
- [ ] Confirmar que ningún email o dato privado sale por `/people`.
- [ ] Desbloquear prueba y comprobar email → activación → perfil → app.
