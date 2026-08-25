# Tres65 Inmobiliaria — Frontend (WEBSITE)

Índice de arquitectura del frontend. Ver también `agente-tres65/CLAUDE.md` (repo hermano) para el backend — este documento asume que ya lo leíste.

## Qué es esto

Sitio estático en GitHub Pages (org `Tres65Inmobiliaria`, repo `discovery-inmobiliaria`), publicado en `https://tres65inmobiliaria.github.io/discovery-inmobiliaria/`. Cada push a `main` se auto-publica (tarda ~30s-2min).

Backend: `https://agente-tres65-production.up.railway.app` (Flask, repo hermano `agente-tres65/`).

## Páginas y para quién son

**Cliente (sin login, autenticado por custom token vía su `?client=<token>`):**
- `index.html` — cuestionario de discovery (bloque 1 + bloque 2, con modo "inversión" que reenfoca preguntas), genera perfil con IA al final. Tiene el mismo aviso de privacidad que `home.html` (ver abajo) como respaldo, por si alguien llega directo aquí en vez de por el link de `home.html`.
- `home.html` — stepper de progreso del cliente (9 pasos), incluye el paso especial de "propiedad de interés" cuando el agente ya le asignó una. Es el link REAL que se comparte con los clientes (`?client=<token>`). Al entrar por primera vez, un popup obligatorio de "Aviso de Privacidad" (texto completo embebido, con scroll — no un link externo, para no sacar al cliente de su flujo) bloquea el paso hasta que marquen la casilla; se sincroniza a Firestore (`privacyAccepted`) para no volver a mostrarse. Debajo de "Tu progreso", si la ficha no tiene `client_email`, aparece un widget en rojo con el que el cliente puede agregarlo (`POST /portal/ficha/<token>/correo`, público).
- `resumen.html` — muestra el reporte generado.
- `agente.html` — "conoce a tu agente", botón que marca `metAgent=true` (sincroniza a Firestore antes de navegar — si no, se pierde).
- `login.html` — prop/mockup, no está conectado a auth real.

**Agente/Admin (login con `agente-login.html`, Firebase email/password):**
- `agente-home.html` — dashboard: crear cliente, buscar propiedades, ley, resumir link. Link a "Leads del día" (todos lo ven ahora, filtrado por asignación). Para Admin: la lista completa "Mis clientes" (cards de todos los clientes de todos los agentes) está oculta — en su lugar hay un widget "Clientes por agente" debajo de "Resumen de clientes" con un botón por cada agente (Damara/Moisés/Guillermo); al picarlo abre un popup con una tabla simple (nombre + estado: Cliente potencial / Listo para asesor / Portal creado - etapa), combinando leads de Chatwoot (`getLeadsPotenciales`) con clientes de Firestore (`listClients`) filtrados por `agent_uid`/`assignee_uid`. Para agentes no-admin, "Mis clientes" se sigue mostrando normal (su propia lista de cards).
- `cliente-detalle.html` — detalle de un cliente: datos (incluye Correo), tipo de comprador + estrategia de cierre + burbuja de prioridad (alta/media/baja), propiedad de interés, propiedades agregadas (buscar/agregar por link/quitar), avance del progreso (checklist con palomitas + burbujas + reporte retráctil), análisis comparativo (generar/corregir/compartir), y "Tareas" (antes "Notas internas" — ahora cada una tiene checkbox, al marcarla se tacha; el campo en Firestore sigue llamándose `agent_notes` con un `done: bool` nuevo, sin migración de datos viejos).
- `leads.html` — tablero de leads desde Chatwoot (cliente-potencial / listo-para-asesor), Round Robin (solo Admin), convertir/crear portal, registrar intentos de contacto (1er/2do/... contacto: contestó o no + resultado, se acumulan, se ven todos en la tarjeta). Botón "Borrar lead" (rojo suave, pide razón) le pone el label `lead-perdido` en Chatwoot — no borra la conversación, solo lo saca del tablero activo. Toggle "Ver leads perdidos"/`?view=perdidos` en la misma página muestra esos leads con su razón/quién/cuándo.

## El puente `firebase-sync.js`

Módulo ES central, cargado en casi todas las páginas (`<script type="module" src="firebase-sync.js">`). Expone `window.tres65Sync` con todo lo que las páginas necesitan (auth, sync de progreso, llamadas al backend). Si agregas una función nueva al backend, casi siempre necesitas un wrapper aquí + agregarlo al objeto exportado al final del archivo.

**Importante — `init(fichaToken)`:** resuelve la identidad del CLIENTE para un link específico. Siempre valida contra el backend (`/portal/auth-token`) que el usuario YA firmado en el navegador coincida con el que corresponde a ese `ficha_token` — si no coincide, cierra esa sesión y firma con la correcta. Esto existe porque probar varias fichas seguidas en el mismo navegador hacía que se reusara la sesión de un cliente anterior (bug real, ya corregido). No revertir a la versión simple de "si ya hay alguien firmado, úsalo".

**`agentInit()`** es la función distinta para agentes/admin (email/password + custom claim `admin`) — no confundir con `init()`.

## Convenciones de UI que ya se repiten

- Paleta de marca fija en cada `<style>` (`--profundo`, `--acento`, `--medio`, `--menta`, `--texto`, `--borde`). Copiar/pegar el bloque `:root` de una página existente al crear una nueva.
- Patrón de "resultado cerrable": un `.tool-result-wrap` (o similar) con `position:relative`, `padding-top` para no tapar contenido, y un botón `×` absoluto arriba a la derecha — ya implementado en `agente-home.html` y `cliente-detalle.html`, copiar ese patrón en vez de reinventarlo.
- Botones "Agregar" a una propiedad de búsqueda: siempre `display:block` (si no, quedan pegados al final de un link que es inline y se desalinean).
- Nunca emojis en nada que genere/escriba Claude en este proyecto (símbolos si hacen falta, usar iconos Lucide). Esto NO aplica al texto de los mensajes de WhatsApp que ya existían antes de este trabajo (los de María) — esos no se tocan.
- Todo popup/modal debe tener un botón `×` de cerrar arriba a la derecha (`.popup-close` para los de `style.display` en `index.html`, `.modal-close` para los de `.classList` en `agente-home.html`/`leads.html`). **Excepción deliberada:** el popup `#popup-privacidad` (aviso de privacidad obligatorio, en `index.html` y `home.html`) NUNCA debe tener esa ×, porque dejaría al cliente saltarse el consentimiento requerido — si agregas un injector genérico de botones de cerrar, exclúyelo explícitamente por id.
- Barras de tipo funnel (ej. "Resumen de clientes" en `agente-home.html`): el ancho de cada barra es `n / FUNNEL_SCALE` (fijo en 9, NO el total de clientes activos ni el valor máximo entre barras) — si no, una etapa con 1 solo cliente se ve con la barra llena y es engañoso. Si el conteo es 0, la barra no se dibuja (width:0), sin mínimo forzado.
- ⚠️ **Cuidado con selectores CSS amplios tipo `.modal-card input{width:100%}`** — si un modal tiene checkboxes (ej. las tareas dentro del modal "Agentes"), esa regla también les pega a ellos y les da `flex-basis` gigante, rompiendo el `display:flex` del contenedor y colapsando el texto/botón de al lado a ancho 0 (se ve como un cuadro de color liso sin texto, con solo el checkbox visible). Ya pasó una vez — la regla debe excluir checkboxes: `.modal-card input:not([type="checkbox"])`. Si agregas un checkbox dentro de un `.modal-card` en el futuro, verifica esto primero.
- Para depurar un bug de renderizado "raro" que no se explica por el código, usar Playwright para llamar la función de render directamente en el navegador real con datos reales (`page.evaluate(() => renderX(datosReales))`) e inspeccionar `getBoundingClientRect()`/`getComputedStyle()` de los hijos — así se encontró el bug de arriba, mucho más rápido que adivinar por lectura de CSS.

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
