# Checklist V18.22.0

## 1. Despliegue
1. Haz backup de la base SQLite y de `uploads/`.
2. Despliega V18.22.0 sin borrar `data/` ni `uploads/`.
3. Reinicia el servicio.
4. Comprueba `/healthz`: debe indicar `18.22.0`.

## 2. Perfil completo en Administración
1. Entra con una cuenta administradora.
2. Abre `Administración → Usuarios`.
3. Busca una cuenta y pulsa `Revisar`.
4. Verifica que aparecen bio, intereses, ciudad, preferencias, estados de privacidad y todas sus fotos.
5. Comprueba que el panel muestra denuncias, reportantes distintos, bloqueos, avisos y suspensiones.

## 3. Avisos y suspensiones
1. Desde una cuenta de prueba, usa `Enviar aviso` y confirma que recibe un aviso de sistema genérico.
2. Prueba una suspensión temporal de 24 h en una cuenta de prueba.
3. Comprueba que la sesión deja de ser válida y que el panel muestra la fecha de fin.
4. Reactiva manualmente la cuenta y comprueba que puede volver a entrar.
5. No pruebes una suspensión larga sobre una cuenta real sin necesidad.

## 4. Pedir ciudad a una cuenta
1. Elige una cuenta de prueba sin ciudad.
2. Pulsa `📍 Pedir ciudad`.
3. Comprueba que recibe la notificación `Añade tu ciudad`.
4. Abre el aviso y verifica que aparece el selector de ciudad.
5. Guarda una ciudad y vuelve a Administración: la petición debe aparecer como completada.
6. Intenta pedirla de nuevo inmediatamente: el sistema debe impedir duplicados durante el periodo de espera.

## 5. Campaña masiva de ciudades
1. En `Administración → Usuarios`, selecciona el filtro `Sin ciudad`.
2. Revisa el contador de cuentas sin ciudad.
3. Decide si quieres activar `Enviar también email`.
4. Pulsa `Invitar a añadir ciudad` y escribe `INVITAR` cuando se solicite confirmación.
5. Verifica las métricas: invitados 7d, completados 30d y emails en cola.
6. Si SMTP está configurado, usa `Procesar emails` para una prueba controlada.

## 6. Email de ciudad
- Debe enviarse solo a correo verificado y con recordatorios por email activos.
- No debe incluir información privada del perfil.
- El botón debe abrir `/?city_invite=1`.
- Al entrar, una cuenta sin ciudad debe recibir la indicación para completar el selector.

## 7. Regresión
Prueba también registro, login, perfil, Descubrir, like, match, chat, juego, bloqueo, `/espera`, novedades y eliminación de cuenta.
