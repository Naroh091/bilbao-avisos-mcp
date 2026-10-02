/**
 * Construcción del servidor MCP y registro de tools.
 * Compartido por la entrada stdio (server.ts) y la HTTP (http.ts).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createRequire } from "node:module";
import { z } from "zod";
import { BilbaoClient, BilbaoApiError } from "./client.js";
import {
  attachPhoto,
  checkAuth,
  createAviso,
  createAvisoFromPhoto,
  getCategory,
  getIdentity,
  listCategories,
  myAvisos,
  reverseGeocode,
  searchStreet,
  setIdentity,
  suggestCategories,
} from "./avisos.js";
import { CreateAvisoFromPhotoInput, CreateAvisoInput, IdentityOverride } from "./types.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function fail(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}
async function run<T>(fn: () => Promise<T>) {
  try {
    return json(await fn());
  } catch (e) {
    if (e instanceof BilbaoApiError) return fail(`Error ${e.status}: ${JSON.stringify(e.body)}`);
    return fail(String(e));
  }
}

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PKG_VERSION: string = (require("../package.json") as { version?: string }).version ?? "0.0.0";

/**
 * Crea una instancia del servidor MCP con todas las tools registradas.
 * Se puede pasar un cliente propio (útil por sesión HTTP); por defecto uno nuevo.
 */
export function buildServer(client: BilbaoClient = new BilbaoClient()): McpServer {
  const server = new McpServer({ name: "bilbao-avisos", version: PKG_VERSION });

  server.tool(
    "check_auth",
    "Comprueba la cuenta de servicio: pide token Keycloak y llama a comprobarVersion. Úsalo para verificar la instalación.",
    {},
    () => run(() => checkAuth(client)),
  );

  server.tool(
    "get_identity",
    "Devuelve la identidad del comunicante guardada (nombre, apellidos, contacto, idioma) o null si aún no se preguntó.",
    {},
    () => run(() => getIdentity()),
  );

  server.tool(
    "set_identity",
    "Guarda la identidad del comunicante (se pregunta UNA vez tras la instalación y se reutiliza). Valida: nombre y primer apellido obligatorios; teléfono o email obligatorios.",
    {
      name: z.string().describe("nombre"),
      apellido1: z.string().describe("primer apellido"),
      apellido2: z.string().optional().describe("segundo apellido (opcional)"),
      userPhone: z.string().optional().describe("teléfono de 9 dígitos (obligatorio si no hay email)"),
      userEmail: z.string().optional().describe("email (obligatorio si no hay teléfono)"),
      lang: z.enum(["es", "eu"]).describe("idioma de las comunicaciones"),
    },
    (input) => run(() => setIdentity(input)),
  );

  server.tool(
    "list_categories",
    "Servicios y temas de avisos (categorías municipales). Cada tema trae su serviceCode 'SERVICIO-TEMA' para crear avisos.",
    {},
    () => run(() => listCategories()),
  );

  server.tool(
    "get_category",
    "Detalle de un serviceCode 'SERVICIO-TEMA': servicio, tipo (A aviso / S sugerencia) y tema.",
    { service_code: z.string() },
    ({ service_code }) => run(() => getCategory(service_code)),
  );

  server.tool(
    "suggest_categories",
    "Sugiere serviceCodes por palabras (p.ej. 'cartones apilados en acera').",
    { hint: z.string().optional() },
    ({ hint }) => run(() => suggestCategories(hint)),
  );

  server.tool(
    "search_street",
    "Busca una calle en el callejero municipal. Devuelve candidatos con TECA_COD_CALLE, portales (TEPO_DIR_PORTAL), barrio/distrito y coordenadas X/Y del portal.",
    { query: z.string().describe("nombre de la calle (p.ej. 'Gran Via')") },
    ({ query }) => run(() => searchStreet(client, query)),
  );

  server.tool(
    "reverse_geocode",
    "Calle y portal cercanos a unas coordenadas WGS84 (lon/lat, p.ej. del GPS de la foto).",
    { lon: z.number(), lat: z.number() },
    ({ lon, lat }) => run(() => reverseGeocode(client, lon, lat)),
  );

  server.tool(
    "my_avisos",
    "Comunicaciones del comunicante (filtra por su teléfono/email guardados; se pueden sobrescribir para la llamada).",
    { userPhone: z.string().optional(), userEmail: z.string().optional() },
    ({ userPhone, userEmail }) => run(() => myAvisos(client, { userPhone, userEmail })),
  );

  server.tool(
    "create_aviso",
    "Crea un aviso/sugerencia. IMPORTANTE: por defecto es DRY-RUN (confirm=false) y solo devuelve el payload que se enviaría, SIN crear nada. Para crear de verdad hay que pasar confirm=true. Usa la identidad guardada salvo que se pase 'identity'.",
    CreateAvisoInput.shape,
    (input) => run(() => createAviso(client, input as CreateAvisoInput)),
  );

  server.tool(
    "create_aviso_from_photo",
    "Aviso desde una FOTO en fases. VÍA PREFERIDA: sube la foto con PUT /upload (curl) y pasa file_id; por stdio usa image_path local. Fase 1: sin service_code → sugiere categorías (need_category). Fase 2: sin calle → pide calle/portal (need_street, con reversa del GPS). Fase 3 (confirm=false): preview + preview_token SIN enviar. Fase 4: MISMOS campos + confirm:true + human_confirmed:true + preview_token (tras 'sí' humano). Sin las tres NO se envía.",
    CreateAvisoFromPhotoInput.shape,
    (input) => run(() => createAvisoFromPhoto(client, input as CreateAvisoFromPhotoInput)),
  );

  server.tool(
    "attach_photo",
    "Adjunta una foto a una comunicación ya creada (ide_comunicacion de la respuesta del envío). Foto por file_id (PUT /upload), image_path local o image_base64. Dry-run por defecto; confirm=true para subirla.",
    {
      ide_comunicacion: z.number(),
      image_path: z.string().optional(),
      image_base64: z.string().optional(),
      file_id: z.string().optional(),
      confirm: z.boolean().optional(),
    },
    ({ ide_comunicacion, image_path, image_base64, file_id, confirm }) =>
      run(() => attachPhoto(client, ide_comunicacion, { image_path, image_base64, file_id }, confirm ?? false)),
  );

  return server;
}

export { IdentityOverride };
