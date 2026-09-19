# V/R Match 18.18.0 — Matching inteligente

## Objetivo
Mejorar el orden de perfiles en Descubrir sin usar una caja negra ni inferencias sensibles.

## Cambios
- Nuevo ranking `smart` basado en señales explicables: intereses compartidos, distancia aproximada, actividad reciente, completitud del perfil, misma ciudad y estados de verificación.
- Los filtros duros siguen mandando: edad, género/preferencia, ciudad/interés guardado, radio, bloqueos, likes/passes previos y preferencia recíproca.
- El Boost aporta una ventaja moderada de orden, pero no salta filtros ni bloqueos.
- Desempate por actualización reciente para evitar que el mismo conjunto quede siempre arriba.
- Cada tarjeta puede mostrar `Afinidad` y hasta tres razones generales como “3 intereses en común”, “Misma ciudad” o “Perfil verificado”.
- No se muestran pesos internos ni última actividad exacta.
- El modo manual por cercanía, intereses o actividad reciente sigue disponible.
- Política de privacidad actualizada con una explicación del orden inteligente.
- Test automático nuevo para verificar que el ranking prioriza mejores señales y no expone componentes internos.

## Nota
La afinidad es un orden de relevancia del producto, no una predicción de compatibilidad sentimental o psicológica.
