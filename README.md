# bilbao-avisos-mcp

Servidor **MCP** (y CLI de apoyo) para el sistema de avisos del Ayuntamiento de Bilbao
(MeJora Bilbao / Bilbo Hobetuz). Permite a un agente listar categorías, buscar calles,
consultar avisos y crear avisos con inteligencia artificial — incluso desde una foto.

La finalidad de este proyecto es hacer más fácil que los ciudadanos puedan reportar
problemas al Ayuntamiento de Bilbao. Saca una foto de la incidencia (por ejemplo,
basura tirada en la calle, una farola que no funciona…) pásasela al agente pidiéndole
que genere un aviso para que de forma autónoma describa el problema, seleccione la
categoría más adecuada, añada la ubicación (la foto tiene que estar geolocalizada) y
lance el aviso al Ayuntamiento.

- [Inicio rápido](#inicio-rápido)
- [Fotos demasiado grandes para el modelo](#fotos-demasiado-grandes-para-el-modelo)
- [¿Eres un agente IA? Lee esto primero](#eres-un-agente-ia-lee-esto-primero)
- [Añadir el MCP vía npx](#añadir-el-mcp-vía-npx)
- [Herramientas MCP](#herramientas-mcp)
- [Configuración](#configuración)
- [Uso como CLI](#uso-como-cli)
- [Servidor HTTP (opcional, avanzado)](#servidor-http-opcional-avanzado)
- [Arquitectura](#arquitectura)

## Inicio rápido

Bilbao no usa cuenta de ciudadano: la app se autentica con una cuenta de servicio
(Keycloak, grant password) y cada aviso lleva los datos del comunicante.

1. Credenciales de servicio (las que usa la propia app; van en el entorno, no en el código):
   ```bash
   export BILBAO_AVISOS_USERNAME=999400
   export BILBAO_AVISOS_PASSWORD=s7rvq45XJ2
   ```
   Si el Ayuntamiento las rota, relee tu copia del APK de "Mejora Bilbao"
   (`grep -o 'token_credentials:{[^}]*}' assets/public/main.*.js`) o pide
   credenciales propias.
2. Añade el servidor a tu cliente MCP ([ejemplos](#añadir-el-mcp-vía-npx)) o
   configúralo a mano:

```json
{
  "mcpServers": {
    "bilbao-avisos": {
      "command": "npx",
      "args": ["-y", "bilbao-avisos-mcp"],
      "env": { "BILBAO_AVISOS_USERNAME": "999400", "BILBAO_AVISOS_PASSWORD": "s7rvq45XJ2" }
    }
  }
}
```

3. Verifica: `check_auth` debe devolver `comprobarVersion` con `estadoVersion`.
4. Pregunta al humano UNA vez su idioma (`es`/`eu`), nombre, primer apellido y
   teléfono o email; guárdalo con la tool `set_identity`. Se reutiliza en todos
   los avisos.
5. Flujo del agente: `create_aviso_from_photo` (foto → categoría → calle →
   preview) → enseña el preview al humano → `confirm: true` + `human_confirmed: true` +
   `preview_token` solo con su "sí" → `attach_photo`.

Todo corre en tu máquina; los avisos se crean con tu cuenta de servicio y los
datos del comunicante guardados.

## Fotos demasiado grandes para el modelo

Algunos modelos rechazan fotos muy grandes (`image decode limit exceeded`). El servidor
reduce en TypeScript (sin dependencias) conservando el GPS, así que el modelo nunca
necesita procesar la original:

* **Remoto (HTTP)**: sube la foto con curl y usa el `file_id` (los bytes no pasan por el
  modelo). Requiere el secreto del servidor:
  ```bash
  curl -X PUT --data-binary @foto.jpg \
    -H "Authorization: Bearer ***" \
    'http://127.0.0.1:3000/upload?filename=foto.jpg'
  # → {"file_id":"…","bytes":…}
  ```
  El preview devuelve `preview_image_base64` (copia reducida) para visión y adjunta
  siempre la original.
* **Local (stdio/CLI)**: pasa `image_path`; el servidor lee y reduce sin que el modelo
  abra el fichero. O reduce tú con `node dist/cli.js prep-photo foto.jpg [foto-ligera.jpg]`.

## ¿Eres un agente IA? Lee esto primero

La skill (`skill/SKILL.md`) no se autoinstala: cópiala al directorio de tu cliente
y abre sesión nueva.

```bash
cp -r skill ~/.hermes/skills/bilbao-avisos        # Hermes
cp -r skill ~/.claude/skills/bilbao-avisos        # Claude Code
# o descárgala: https://github.com/Naroh091/bilbao-avisos-mcp/blob/main/skill/SKILL.md
```

Instálalo así (requiere Node 18+):

1. **Credenciales**: las de la propia app (`BILBAO_AVISOS_USERNAME=999400`,
   `BILBAO_AVISOS_PASSWORD=s7rvq45XJ2`) en el entorno del servidor. Sin ellas solo
   funcionan las llamadas sin auth (categorías, callejero).
2. **Instalación** según tu cliente ([comandos exactos](#añadir-el-mcp-vía-npx)):
   Claude Code (`claude mcp add … -- npx -y bilbao-avisos-mcp`), Hermes (`hermes mcp add …
   --command npx … --args -y bilbao-avisos-mcp`) u OpenClaw (`openclaw mcp add …
   --command npx --arg -y --arg bilbao-avisos-mcp`). Las credenciales viajan en el
   entorno de tu config.
3. **Identidad**: pregunta idioma + nombre + primer apellido + teléfono o email UNA
   vez y guárdala con `set_identity` (verifica con `get_identity`). Sin identidad
   no se puede crear ni consultar.
4. **Verifica** (`mcp list` / `test` / `doctor --probe` según cliente): debes ver 12 tools.
5. **Uso**: hay skill completa en [`skill/SKILL.md`](skill/SKILL.md).
   Lo esencial: solo incidencias genuinas; `create_aviso_from_photo` en fases
   (categoría → calle → preview → envío solo con "sí" humano + `confirm` +
   `human_confirmed` + `preview_token`); foto por `file_id`; sin GPS no adivines
   la ubicación; calle y portal siempre de `search_street`.

## Añadir el MCP vía npx

Requiere Node 18+.

### Claude Code

```bash
claude mcp add bilbao-avisos -e BILBAO_AVISOS_USERNAME=999400 -e BILBAO_AVISOS_PASSWORD=s7rvq45XJ2 -- npx -y bilbao-avisos-mcp
claude mcp list   # verificar
```

### Hermes

```bash
hermes mcp add bilbao-avisos --command npx --env BILBAO_AVISOS_USERNAME=999400 --env BILBAO_AVISOS_PASSWORD=s7rvq45XJ2 --args -y bilbao-avisos-mcp
hermes mcp test bilbao-avisos   # verificar (lista las 12 tools)
```

### OpenClaw

```bash
openclaw mcp add bilbao-avisos \
  --command npx \
  --arg -y \
  --arg bilbao-avisos-mcp \
  --env BILBAO_AVISOS_USERNAME=999400 \
  --env BILBAO_AVISOS_PASSWORD=s7rvq45XJ2
openclaw mcp doctor bilbao-avisos --probe   # verificar
```

### Desde código

```bash
npm install
npm run build
npx -y -p bilbao-avisos-mcp bilbao-avisos-mcp-http   # HTTP en 127.0.0.1:3000/mcp
```

## Herramientas MCP

| Tool | Qué hace |
|---|---|
| `check_auth` | Token Keycloak + `comprobarVersion` (verifica la instalación). |
| `get_identity` | Identidad guardada del comunicante (o null). |
| `set_identity` | Guarda nombre/apellidos/contacto/idioma (se pregunta una vez). |
| `list_categories` | Servicios y temas (cada tema trae su `serviceCode`). |
| `get_category` | Detalle de un `serviceCode` (servicio, tipo A/S, tema). |
| `suggest_categories` | Sugiere `serviceCode` por palabras. |
| `search_street` | Callejero: calle → `TECA_COD_CALLE`, portales y coordenadas. |
| `reverse_geocode` | lon/lat → calle y portal cercanos. |
| `my_avisos` | Comunicaciones del comunicante (por teléfono/email). |
| `create_aviso` | Crea un aviso/sugerencia. **Dry-run por defecto**; `confirm: true` para enviar. |
| `create_aviso_from_photo` | Aviso desde foto en fases: categoría → calle → preview (GPS EXIF) y envío solo con `confirm: true` + `human_confirmed: true` + `preview_token`. Acepta `image_base64`, `image_path` o `file_id`. |
| `attach_photo` | Adjunta una foto a la comunicación (`ide_comunicacion`). Dry-run por defecto. |

Son 12 tools.

### Seguridad de envío

`create_aviso` es **dry-run por defecto**: devuelve el payload **sin crear nada**. Solo con
`confirm: true` hace los `POST` reales — un aviso real que revisa personal municipal.
Envía únicamente incidencias reales.

`create_aviso_from_photo` exige confirmación humana en fases:

1. **Categoría** (sin `serviceCode`): sugiere y no envía nada.
2. **Calle** (sin `streetCode`): pide calle/portal y no envía nada.
3. **Preview** (`confirm` ausente/false): GPS EXIF (o `lat`/`lng` manuales), payload +
   `preview_token`. No envía nada.
4. **Envío**: el agente muestra el preview al humano y espera su "sí"; solo entonces
   repite la llamada con los MISMOS campos + `confirm: true` + `human_confirmed: true` +
   `preview_token`. Si cambió cualquier campo, hay que repetir el preview.

## Uso como CLI

```bash
export BILBAO_AVISOS_USERNAME=999400 BILBAO_AVISOS_PASSWORD=s7rvq45XJ2
node dist/cli.js check-auth
node dist/cli.js identity-set "Nombre" "Apellido1" "" 944000000 nombre@example.com es
node dist/cli.js categories
node dist/cli.js category LIM-OSLILI
node dist/cli.js street "Gran Via"
node dist/cli.js reverse -2.9234 43.2642
node dist/cli.js my-avisos
node dist/cli.js create A LIM-OSLILI 4040 1 "Contenedor desbordado"          # dry-run
node dist/cli.js create A LIM-OSLILI 4040 1 "Contenedor desbordado" --send   # ENVÍA de verdad
node dist/cli.js from-photo foto.jpg LIM-OSLILI "Cartones en la acera"      # preview desde foto
node dist/cli.js prep-photo foto.jpg [foto-ligera.jpg]   # reduce para el modelo, conserva EXIF/GPS
```

## Servidor HTTP (opcional)

Por stdio cada uno corre su copia con sus credenciales. La entrada **HTTP** sirve para el caso
contrario: exponer el servidor que corre en TU máquina (con TUS credenciales) para que un agente
en OTRA máquina lo use — en ese caso actúa como tú, no como el dueño del agente remoto.
Para uso personal normal no la necesitas.

```bash
export BILBAO_AVISOS_USERNAME=999400 BILBAO_AVISOS_PASSWORD=s7rvq45XJ2
export BILBAO_AVISOS_MCP_SECRET=<un-secreto-largo>            # exige x-mcp-secret o Bearer
export BILBAO_AVISOS_ALLOWED_HOSTS=tu-host.tu-tailnet.ts.net  # anti DNS-rebinding
npm run start:http     # 127.0.0.1:3000/mcp
```

Variables: `BILBAO_AVISOS_HTTP_PORT` (3000), `BILBAO_AVISOS_HTTP_HOST` (127.0.0.1),
`BILBAO_AVISOS_HTTP_PATH` (/mcp). Expón solo en red privada (p.ej. `tailscale serve`,
nunca `funnel`): quien llegue a la URL actúa como tu usuario. Para persistencia,
`launchd`/`pm2`/`tmux` o similar.

## Arquitectura

- `src/client.ts` — HTTP: token Keycloak (grant password, auto-renovación ante 401) + Bearer, callejero sin auth.
- `src/identity.ts` — perfil del comunicante en JSON local (0600), con las reglas del formulario.
- `src/avisos.ts` — **núcleo** de negocio (reutilizado por MCP y CLI): versión, categorías, callejero, mis avisos, creación en 2 POST (persona + comunicación), foto.
- `src/photo.ts` — foto: EXIF/GPS, subida a tmp, token de preview.
- `src/types.ts` — esquemas zod de entrada + payload de creación.
- `src/mcp.ts` — `buildServer()`: registra las 12 tools (compartido por stdio y HTTP).
- `src/server.ts` — entrada stdio · `src/http.ts` — entrada HTTP (`/mcp` + `PUT /upload`) · `src/cli.ts` — CLI.

## Notas

- Ingeniería inversa del APK "Mejora Bilbao - Bilbo Hobetuz" v4.0.0 + verificación
  en vivo de los endpoints de lectura y del dry-run (sin crear avisos reales).
- Si el Ayuntamiento rota la cuenta de servicio, actualiza las variables de entorno.

## Licencia

AGPLv3. Ver [LICENSE](LICENSE).
