# V/R Match — Landing viral MVP

Prototipo estático para validar la idea de lanzamiento por ciudades.

## Incluye

- Selector de ciudad.
- Contador de personas y progreso de desbloqueo.
- Mosaico "V/R People".
- Perfiles de DEMOSTRACIÓN (no son usuarios reales).
- Lista de espera.
- Consentimiento separado para aparecer públicamente.
- Código de referido.
- Botón de compartir / copiar.
- Diseño responsive.
- Datos guardados localmente en `localStorage` únicamente para la demo.

## Cómo probarlo

1. Abre `index.html` en el navegador.
2. Cambia de ciudad.
3. Completa el formulario.
4. Se genera un código de invitación.

Para evitar restricciones del navegador con `navigator.share` o portapapeles, puedes servir la carpeta con:

```bash
npx serve .
```

o cualquier servidor local.

## Para conectarlo a V/R Match

El prototipo NO escribe todavía en SQLite ni usa el backend real. El siguiente paso recomendado es crear:

- `POST /api/waitlist`
- `GET /api/cities`
- `GET /api/cities/:slug/people`
- `POST /api/referrals/visit`
- `GET /api/referrals/:code`

### Tabla sugerida: waitlist_users

- id
- alias
- age
- email
- city
- public_profile (boolean)
- referral_code
- referred_by
- created_at
- verified_at

### Tabla sugerida: city_launches

- id
- city
- target_users
- current_users
- is_unlocked
- unlocked_at

## Privacidad

Para la página pública:
- alias o nombre de pila;
- edad;
- ciudad (nunca ubicación precisa);
- intereses;
- foto aprobada por el usuario;
- consentimiento explícito y revocable.

No publicar apellidos, email, teléfono, distancia exacta ni ubicación exacta.

## Nota

Los números y perfiles incluidos en esta demo son ficticios y sirven únicamente para visualizar la experiencia.
