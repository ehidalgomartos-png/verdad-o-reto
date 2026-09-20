# VRMatch V18.24.3 — Responsive real por dispositivo

Esta versión no cambia la lógica de VRMatch. Reorganiza la interfaz para que la misma aplicación tenga una composición propia según el dispositivo.

## Móvil
- Mantiene dock inferior, navegación táctil y tarjetas a una columna.
- Conserva adaptación al teclado y safe areas.

## Tablet
- Contenedor más ancho (hasta ~920/960 px).
- Perfil en dos columnas.
- Descubrir y chat aprovechan mejor el espacio sin estirar las tarjetas.
- Listas de matches y selectores pueden usar dos columnas.
- Detección específica de iPad y Android tablet, incluso en horizontal.

## Ordenador
- Shell de hasta 1180 px.
- Perfil en dos columnas.
- Descubrir y Matches usan navegación lateral de escritorio.
- Chat gana altura y ancho real de conversación.
- Administración puede aprovechar todo el ancho disponible.
- Juegos/mazos usan dos columnas cuando resulta útil.
- Dock móvil desactivado.

## Detección
Se combina detección básica del tipo de dispositivo con breakpoints responsive. El diseño sigue reaccionando al ancho de la ventana y no depende únicamente del user-agent.
