---
name: bilbao-avisos
description: "Crea avisos al Ayto. de Bilbao desde una foto"
version: 0.1.0
platforms: [linux, macos]
metadata:
  hermes:
    tags: [bilbao, avisos, ayuntamiento, incidencias, limpieza, mcp]
    category: civic
---

# Avisos Bilbao — incidencias desde una foto

Servidor MCP `bilbao-avisos` (11 tools, prefijo `mcp__bilbao_avisos__`). Actúas
con la cuenta de servicio del servidor y la identidad del humano guardada: todo
aviso que crees es REAL y lo revisa personal municipal. **Solo incidencias
genuinas. Nada de pruebas.**

## When to Use

Cuando el humano te pasa una foto de una incidencia urbana en Bilbao (basura,
farolas, aceras…) y te pide generar un aviso al Ayuntamiento. Para esta tarea
usa SOLO: inspección de la imagen + las tools `mcp__bilbao_avisos__*` +
redimensionar la foto si hace falta. NO explores la máquina (nada de `~/.ssh`,
historiales shell, ficheros de config): no sirve para crear el aviso.

## Setup (una sola vez tras instalar)

La app de Bilbao no tiene registro: cada aviso lleva los datos del comunicante.
Pídelos UNA vez y guárdalos con `mcp__bilbao_avisos__set_identity`:

- `lang`: idioma de las comunicaciones (`es` o `eu`). Pregúntalo SIEMPRE.
- `name` + `apellido1`: obligatorios. `apellido2`: opcional.
- `userPhone` (9 dígitos) o `userEmail`: al menos uno (vale para contacto y
  para consultar "mis avisos").

El servidor los guarda en local (modo 0600) y los reutiliza. Comprueba con
`mcp__bilbao_avisos__get_identity`; si es `null`, pregunta antes de seguir.
La cuenta de servicio ya va en el entorno del servidor
(`BILBAO_AVISOS_USERNAME=999400`, `BILBAO_AVISOS_PASSWORD=s7rvq45XJ2`, las de la
propia app): verifica con `mcp__bilbao_avisos__check_auth`.

## Procedure

### 0. Recibe la foto sin procesarla

NO abras la imagen original con visión ni la pases como base64 gigante: el
modelo solo debe verla cuando ya esté reducida (`preview_image_base64`).

| Dónde corre tu MCP | Acción |
|---|---|
| stdio en tu misma máquina (npx local) | Pasa `image_path` con la ruta local: el servidor la lee y reduce sin que la abras. Es la mejor vía. |
| HTTP remoto | Súbela con curl desde tu terminal (los bytes no entran en tu contexto) y usa el `file_id`: `curl -X PUT --data-binary @foto.jpg -H "Authorization: Bearer <secreto>" '<base>/upload?filename=foto.jpg'` → `{"file_id":"…"}`. |
| Foto pequeña ya visible en el chat | `image_base64` solo entonces. |

Si la foto no trae GPS EXIF, NO adivines: pide ubicación al humano (o `lat`/`lng`).
Solo JPEG trae EXIF legible.

### 1. Categoría

Llama `mcp__bilbao_avisos__create_aviso_from_photo` con la foto + `category_hint`
(lo que ves: "cartones apilados en acera", "farola apagada"…).

- `phase: "need_category"` → enseña `suggestions` al humano y repite con el
  `serviceCode` elegido ("SERVICIO-TEMA", p.ej. `LIM-OSLILI`). Lista completa en
  `list_categories`, detalle en `get_category`.

### 2. Calle y portal

Sin `streetCode` responde `phase: "need_street"` (con `reverse` del GPS si lo
había):

1. Busca la calle con `mcp__bilbao_avisos__search_street` ("Gran Via" → candidatos
   con `TECA_COD_CALLE`, portales y coordenadas X/Y del portal).
2. Elige con el humano calle + portal. Repite la llamada con `streetCode`,
   `portal` (+ `x`, `y`, `districtCode`, `neighbourhoodCode` del portal elegido).
3. Para sugerencias de toda la ciudad (`kind: "S"`), vale `allCity: true` sin calle.

### 3. Preview (NUNCA envía nada)

Con categoría + calle responde `phase: "preview"`. Enséñale al humano: categoría,
calle/portal, descripción, `gps` y el payload. Guarda el `preview_token`: está
ligado al payload exacto; si cambias CUALQUIER campo hay que pedir preview nuevo.

- La `description` es el texto que se publicará. Si la omites se pre-rellena y se
  marca `description_drafted: true` (el humano debe revisarla).
- Comprueba `my_avisos` por si el mismo hecho ya está reportado con su teléfono
  o email: si parece el mismo, no dupliques.

### 4. Envío (solo con el "sí" explícito)

Repite la llamada con los MISMOS campos + las tres cosas a la vez:

- `confirm: true` + `human_confirmed: true` + `preview_token: "<el del preview>"`

Sin las tres, el servidor bloquea. Solo `phase: "sent"` acredita el envío. El
servidor valida primero a la persona (`buscarPersonasWS`); si rechaza los datos,
revisa nombre/apellidos/contacto con el humano. No reenvíes a ciegas.

### 5. Adjunta la foto y reporta

Llama `mcp__bilbao_avisos__attach_photo` con el `ide_comunicacion` del `response`
+ la misma `image_path` local o `file_id` remoto + `confirm: true` (con OK humano).
Comprueba con `mcp__bilbao_avisos__my_avisos` y reporta: qué se creó, dirección y
estado.

## Pitfalls

- Sin identidad guardada (`get_identity` → null) las tools de creación fallan:
  pide los datos y llama `set_identity` primero.
- Pasar `image_path` con una ruta de tu máquina a un servidor remoto: no la ve.
  En remoto siempre `file_id` tras `PUT /upload`.
- Inventar `streetCode` o portal: resuélvelos con `search_street`; el `serviceCode`
  con `list_categories`/`get_category`/`suggest_categories`.
- Cambiar cualquier campo entre preview y envío: el `preview_token` deja de
  coincidir y hay que repetir el preview.
- Perder el EXIF al redimensionar (p.ej. captura de pantalla de la foto): sin GPS
  no hay reversa automática; pide ubicación.
- `reverse_geocode` puede devolver vacío en algunos puntos: cae a `search_street`
  manual, no inventes la calle.

## Verification

- `mcp__bilbao_avisos__check_auth` devuelve `comprobarVersion` (sesión válida).
- Tras el envío, `mcp__bilbao_avisos__my_avisos` muestra la comunicación con su
  teléfono/email.
