# Checklist V18.24.0 — Beta Valencia

1. Haz backup de `data/` y `uploads/`.
2. Despliega V18.24.0 sin borrar esos directorios.
3. Abre `/healthz` y comprueba `version: 18.24.0`.
4. Entra con una cuenta administradora y abre **Administración → 🧪 Beta**.
5. Comprueba que la ciudad inicial es Valencia.
6. Añade una cuenta de prueba de Valencia de forma individual desde **Usuarios → Revisar → Añadir a beta**.
7. Inicia sesión con esa cuenta y comprueba que aparece la sección **Beta VRMatch** en Cuenta y seguridad.
8. Envía un feedback de beta con valoración y texto.
9. Vuelve al panel administrador y comprueba que aparece en el bloque de feedback.
10. Resuelve o descarta ese feedback.
11. Crea una ola masiva con un número pequeño de usuarios de prueba.
12. Comprueba que el panel muestra perfil listo, like, match, conversación y juego cuando esos hitos ocurren después de entrar en la beta.
13. D1/D7 deben mostrar denominador 0 hasta que haya transcurrido tiempo suficiente; no deben inventarse retornos.
14. Pausa un participante y comprueba que ya no registra actividad beta.
15. Retira un participante y confirma que su cuenta normal sigue funcionando.
16. Exporta el CSV y revisa que contiene estado, ola, activación e hitos.
17. Comprueba Privacidad y Condiciones actualizadas.

## Validaciones realizadas en el paquete
- `node --check server.js`.
- `node --check sw.js`.
- `node --check tests/smoke.test.js`.
- JavaScript inline de `index.html` validado por sintaxis.
- 408 IDs HTML únicos, sin duplicados.
- `schema.sql` ejecutado correctamente sobre SQLite vacío.
- Esquema inline del servidor y tablas beta simulados con SQLite.
- Tests estáticos V18.24: 3/3 superados.

La batería `npm test` completa requiere instalar las dependencias del proyecto, incluido `socket.io-client`.
