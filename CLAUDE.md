# Tres65 Inmobiliaria — Frontend (WEBSITE)

Índice de arquitectura del frontend. Ver también `agente-tres65/CLAUDE.md` (repo hermano) para el backend — este documento asume que ya lo leíste.

## Qué es esto

Sitio estático en GitHub Pages (org `Tres65Inmobiliaria`, repo `discovery-inmobiliaria`), publicado en `https://tres65inmobiliaria.github.io/discovery-inmobiliaria/`. Cada push a `main` se auto-publica (tarda ~30s-2min).

Backend: `https://agente-tres65-production.up.railway.app` (Flask, repo hermano `agente-tres65/`).

## Páginas y para quién son

**Cliente (sin login, autenticado por custom token vía su `?client=<token>`):**
- `index.html` — cuestionario de discovery (bloque 1 + bloque 2, con modo "inversión" que reenfoca preguntas), genera perfil con IA al final.
- `home.html` — stepper de progreso del cliente (9 pasos), incluye el paso especial de "propiedad de interés" cuando el agente ya le asignó una.
- `resumen.html` — muestra el reporte generado.
- `agente.html` — "conoce a tu agente", botón que marca `metAgent=true` (sincroniza a Firestore antes de navegar — si no, se pierde).
- `login.html` — prop/mockup, no está conectado a auth real.

**Agente/Admin (login con `agente-login.html`, Firebase email/password):**
- `agente-home.html` — dashboard: lista de clientes, crear cliente, buscar propiedades, ley, resumir link. Link a "Leads del día" (todos lo ven ahora, filtrado por asignación).
- `cliente-detalle.html` — detalle de un cliente: datos, tipo de comprador + estrategia de cierre, propiedad de interés, propiedades agregadas (buscar/agregar por link/quitar), avance del progreso (checklist con palomitas + burbujas + reporte retráctil), análisis comparativo (generar/corregir/compartir), notas internas.
- `leads.html` — tablero de leads desde Chatwoot (cliente-potencial / listo-para-asesor), Round Robin (solo Admin), convertir/crear portal.

## El puente `firebase-sync.js`

Módulo ES central, cargado en casi todas las páginas (`<script type="module" src="firebase-sync.js">`). Expone `window.tres65Sync` con todo lo que las páginas necesitan (auth, sync de progreso, llamadas al backend). Si agregas una función nueva al backend, casi siempre necesitas un wrapper aquí + agregarlo al objeto exportado al final del archivo.

**Importante — `init(fichaToken)`:** resuelve la identidad del CLIENTE para un link específico. Siempre valida contra el backend (`/portal/auth-token`) que el usuario YA firmado en el navegador coincida con el que corresponde a ese `ficha_token` — si no coincide, cierra esa sesión y firma con la correcta. Esto existe porque probar varias fichas seguidas en el mismo navegador hacía que se reusara la sesión de un cliente anterior (bug real, ya corregido). No revertir a la versión simple de "si ya hay alguien firmado, úsalo".

**`agentInit()`** es la función distinta para agentes/admin (email/password + custom claim `admin`) — no confundir con `init()`.

## Convenciones de UI que ya se repiten

- Paleta de marca fija en cada `<style>` (`--profundo`, `--acento`, `--medio`, `--menta`, `--texto`, `--borde`). Copiar/pegar el bloque `:root` de una página existente al crear una nueva.
- Patrón de "resultado cerrable": un `.tool-result-wrap` (o similar) con `position:relative`, `padding-top` para no tapar contenido, y un botón `×` absoluto arriba a la derecha — ya implementado en `agente-home.html` y `cliente-detalle.html`, copiar ese patrón en vez de reinventarlo.
- Botones "Agregar" a una propiedad de búsqueda: siempre `display:block` (si no, quedan pegados al final de un link que es inline y se desalinean).
- Nunca emojis en nada que genere/escriba Claude en este proyecto (símbolos si hacen falta, usar iconos Lucide). Esto NO aplica al texto de los mensajes de WhatsApp que ya existían antes de este trabajo (los de María) — esos no se tocan.

## Pendientes de UI anotados (no urgentes)

- Burbujas de palabras clave en "Avance del progreso" (`cliente-detalle.html`): deben ir alineadas al margen **izquierdo** (ahora mismo están con `margin-left:auto`, empujadas a la derecha, por un pedido anterior — hay que revertir/ajustar).
- En "Buscar propiedades" del dashboard general (`agente-home.html`), el botón "Agregar" de cada resultado debe bajar a su propia línea, alineado al margen **derecho**.

## Cómo desplegar

```bash
cd WEBSITE
git add <archivos>
git commit -m "..."
git push
```
GitHub Pages se actualiza solo. Para confirmar que ya se publicó sin adivinar tiempos, usar un loop de curl en background (patrón ya usado toda la sesión):
```bash
until curl -s "https://tres65inmobiliaria.github.io/discovery-inmobiliaria/ARCHIVO.html" | grep -q "ALGO_NUEVO_DEL_CAMBIO"; do sleep 5; done
```

## Antes de tocar algo, revisa balance de JS

Los archivos son HTML+JS inline sin build step ni linter. Antes de dar por bueno un cambio grande, verificar que `{`/`}` y `(`/`)` cuadren (o correr `node --check` sobre el `<script>` extraído) — no hay otro checador.
