/**
 * Núcleo: funciones de alto nivel sobre el API de Mejora Bilbao.
 * Reutilizadas por el servidor MCP y por el CLI.
 */
import { BilbaoClient } from "./client.js";
import { APP_VERSION, ENDPOINTS } from "./config.js";
import {
  langCode,
  loadIdentity,
  saveIdentity,
  validateIdentity,
  type CitizenIdentity,
} from "./identity.js";
import type { CreateAvisoFromPhotoInput, CreateAvisoInput, CreatePayload } from "./types.js";
import {
  downscaleForVision,
  loadPhotoBuffer,
  parsePhoto,
  previewToken,
  resolveUpload,
  saveUpload,
  type PhotoInfo,
} from "./photo.js";

// ---------------------------------------------------------------------------
// Auth / versión
// ---------------------------------------------------------------------------

/** Comprueba la cuenta de servicio: pide token y llama a comprobarVersion. */
export async function checkAuth(client: BilbaoClient): Promise<unknown> {
  await client.fetchToken();
  return client.postApi(ENDPOINTS.comprobarVersion, { nVersion: APP_VERSION });
}

// ---------------------------------------------------------------------------
// Identidad del comunicante
// ---------------------------------------------------------------------------

export async function getIdentity(): Promise<CitizenIdentity | null> {
  return loadIdentity();
}

export async function setIdentity(identity: CitizenIdentity): Promise<{ saved: boolean }> {
  await saveIdentity(identity);
  return { saved: true };
}

/** Fusiona la identidad guardada con la de la llamada (la llamada manda). */
export async function resolveIdentity(override?: {
  name?: string;
  apellido1?: string;
  apellido2?: string;
  userPhone?: string;
  userEmail?: string;
  lang?: "es" | "eu";
}): Promise<CitizenIdentity> {
  const stored = await loadIdentity();
  const merged: CitizenIdentity = {
    name: override?.name ?? stored?.name ?? "",
    apellido1: override?.apellido1 ?? stored?.apellido1 ?? "",
    apellido2: override?.apellido2 ?? stored?.apellido2 ?? "",
    userPhone: override?.userPhone ?? stored?.userPhone ?? "",
    userEmail: override?.userEmail ?? stored?.userEmail ?? "",
    lang: override?.lang ?? stored?.lang ?? "es",
  };
  const errors = validateIdentity(merged);
  if (errors.length) {
    throw new Error(
      `Falta identidad válida (${errors.join(" ")}). ` +
        "Pídela al humano una vez y guárdala con set_identity.",
    );
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Categorías (categories.json público)
// ---------------------------------------------------------------------------

export interface Theme {
  code: string;
  name_es: string;
  name_eu: string;
}
export interface Service {
  code: string;
  name_es: string;
  name_eu: string;
  icon?: string;
  issue_themes: Theme[];
  suggestion_themes: Theme[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function asThemes(node: any): Theme[] {
  const t = node?.tema;
  if (!t) return [];
  const list = Array.isArray(t) ? t : typeof t === "object" && "temacodigo" in t ? [t] : Object.values(t);
  return (list as any[]).map((x) => ({
    code: String(x.temacodigo ?? ""),
    name_es: String(x.temanombrecastellano ?? ""),
    name_eu: String(x.temanombreeuskera ?? ""),
  }));
}

export async function listCategories(): Promise<Service[]> {
  const res = await fetch(ENDPOINTS.categories);
  if (!res.ok) throw new Error(`categories.json: HTTP ${res.status}`);
  const data = (await res.json()) as any;
  const servicios = data?.servicios?.servicio;
  const list = Array.isArray(servicios) ? servicios : Object.values(servicios ?? {});
  return (list as any[]).map((s) => ({
    code: String(s.serviciocodigo ?? ""),
    name_es: String(s.servicionombrecastellano ?? ""),
    name_eu: String(s.servicionombreeuskera ?? ""),
    icon: s.servicioicono ? String(s.servicioicono) : undefined,
    issue_themes: asThemes(s.temasincidencias),
    suggestion_themes: asThemes(s.temassugerencias),
  }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Detalle de un serviceCode "SERVICIO-TEMA" (p.ej. "LIM-OSLILI"). */
export async function getCategory(serviceCode: string): Promise<{
  service: Service;
  kind: "A" | "S";
  theme: Theme;
  serviceCode: string;
}> {
  const [svc, tema, ...rest] = serviceCode.split("-");
  if (!svc || !tema || rest.length) throw new Error(`serviceCode inválido: usa "SERVICIO-TEMA" (p.ej. LIM-OSLILI).`);
  const services = await listCategories();
  const service = services.find((s) => s.code === svc);
  if (!service) throw new Error(`Servicio desconocido: ${svc}. Mira list_categories.`);
  const issue = service.issue_themes.find((t) => t.code === tema);
  if (issue) return { service, kind: "A", theme: issue, serviceCode };
  const sugg = service.suggestion_themes.find((t) => t.code === tema);
  if (sugg) return { service, kind: "S", theme: sugg, serviceCode };
  throw new Error(`Tema desconocido: ${tema} en servicio ${svc}. Mira list_categories.`);
}

const HINT_STOPWORDS = new Set(
  "el la los las un una unos unas en de del al y o con por para que se hay son es esta este esto eso esa ese aqui hay muy mas".split(" "),
);

export interface CategorySuggestion {
  serviceCode: string;
  kind: "A" | "S";
  visible_name: string;
  score: number;
}

/** Sugiere serviceCodes por coincidencia de palabras del hint. */
export async function suggestCategories(hint?: string, limit = 5): Promise<CategorySuggestion[]> {
  const services = await listCategories();
  const all: CategorySuggestion[] = [];
  for (const s of services) {
    for (const t of s.issue_themes) {
      all.push({ serviceCode: `${s.code}-${t.code}`, kind: "A", visible_name: `${s.name_es} — ${t.name_es}`, score: 0 });
    }
    for (const t of s.suggestion_themes) {
      all.push({ serviceCode: `${s.code}-${t.code}`, kind: "S", visible_name: `${s.name_es} — ${t.name_es}`, score: 0 });
    }
  }
  if (!hint?.trim()) return all.slice(0, limit);
  const words = hint
    .toLowerCase()
    .split(/[^a-záéíóúñü0-9]+/u)
    .filter((w) => w.length > 2 && !HINT_STOPWORDS.has(w));
  for (const c of all) {
    const name = c.visible_name.toLowerCase();
    for (const w of words) if (name.includes(w)) c.score += 3;
  }
  all.sort((a, b) => b.score - a.score);
  return all.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Callejero (WebServicesBilbao, sin auth)
// ---------------------------------------------------------------------------

function streetSearchParams(query: string): string {
  return (
    `?s=SEARCHER&u=BUZONC&r=JSON&p0=search&p1=CALLES` +
    `&p2=${encodeURIComponent(query)}*&p6=PORTALES&p7=ID1,TECA_COD_CALLE,TECA_DES_NOMBRE,TECA_TIP_VIA,SCORE,GDO_GEOMETRY`
  );
}

/** Busca una calle por nombre. Devuelve candidatos con portales y coordenadas. */
export async function searchStreet(client: BilbaoClient, query: string): Promise<unknown> {
  return client.postStreetSearch(streetSearchParams(query));
}

/** Geocodificación inversa: lon/lat (WGS84) -> calle y portal cercanos. */
export async function reverseGeocode(client: BilbaoClient, lon: number, lat: number): Promise<unknown> {
  const url =
    `${ENDPOINTS.streetFinderHost}/WebServicesBilbao/WSBilbao` +
    `?s=WSPROXIM&u=BUZONC&r=JSON&p0=C&p1=${lon}&p2=${lat}`;
  return client.getStreet(url);
}

// ---------------------------------------------------------------------------
// Mis avisos
// ---------------------------------------------------------------------------

/** Lista las comunicaciones del comunicante (por defecto, identidad guardada). */
export async function myAvisos(
  client: BilbaoClient,
  identity?: { userPhone?: string; userEmail?: string },
): Promise<unknown> {
  const stored = await loadIdentity();
  const dattelef1 = identity?.userPhone ?? stored?.userPhone ?? undefined;
  const datemail = identity?.userEmail ?? stored?.userEmail ?? undefined;
  if (!dattelef1 && !datemail) {
    throw new Error("Sin teléfono ni email: pide la identidad al humano y guárdala con set_identity.");
  }
  const personas: Record<string, string> = {};
  if (dattelef1) personas.dattelef1 = dattelef1;
  if (datemail) personas.datemail = datemail;
  return client.postApi(ENDPOINTS.search, { personas });
}

// ---------------------------------------------------------------------------
// Creación
// ---------------------------------------------------------------------------

export interface ResolvedCreate {
  payload: CreatePayload;
  identity: CitizenIdentity;
}

/**
 * Construye el payload de createMejoraBilbaoWS con la forma exacta de la app.
 * Rama bis: como sendIssue/sendSuggestion (dirBisComunicacion + idenif según rama).
 */
export async function buildCreatePayload(input: CreateAvisoInput): Promise<ResolvedCreate> {
  const idn = await resolveIdentity(input.identity);
  const [codServicio, codTema, ...rest] = input.serviceCode.split("-");
  if (!codServicio || !codTema || rest.length) {
    throw new Error(`serviceCode inválido: usa "SERVICIO-TEMA" (p.ej. LIM-OSLILI).`);
  }
  const fullName = `${idn.name} ${idn.apellido1} ${idn.apellido2 ?? ""}`.replace(/\s+/g, " ").trim();
  const email = (idn.userEmail ?? "").trim();
  const phone = (idn.userPhone ?? "").trim();

  let codCalleComunicacion: string;
  let codPortalComunicacion: string;
  let coordenadaX: number | null = null;
  let coordenadaY: number | null = null;
  let codDistritoComunicacion: string | undefined;
  let codBarrioComunicacion: string | undefined;
  let dirBisComunicacion: boolean | string | undefined;
  let idenif: string;

  if (input.kind === "S" && input.allCity) {
    // Sugerencia de toda la ciudad (coordenadas fijas de la app).
    codCalleComunicacion = "3850";
    codPortalComunicacion = "1";
    coordenadaX = 506339.026;
    coordenadaY = 4790359.692;
    idenif = "";
  } else {
    if (!input.streetCode) throw new Error("Falta streetCode: elige calle y portal con search_street.");
    codCalleComunicacion = input.streetCode;
    codPortalComunicacion = input.portal ?? "00";
    coordenadaX = input.x ?? null;
    coordenadaY = input.y ?? null;
    codDistritoComunicacion = input.districtCode;
    codBarrioComunicacion = input.neighbourhoodCode;
    if (input.portalBis) {
      idenif = "";
    } else {
      dirBisComunicacion = false;
      // NIF genérico que la propia app manda en esta rama.
      idenif = "79038992Q";
    }
  }

  const payload: CreatePayload = {
    tipoComunicacion: input.kind,
    codServicio,
    codTema,
    codCalleComunicacion,
    codPortalComunicacion,
    desComunicacion: input.description,
    codDistritoComunicacion,
    codBarrioComunicacion,
    dirBisComunicacion,
    coordenadaX,
    coordenadaY,
    codCanal: "M",
    appVersion: APP_VERSION,
    avisos: { codEntidad: 0, ideComunicacion: 0, nbrInfor: fullName, datContac: email, codDictame: "" },
    personas: {
      idenif,
      nbrnombre: idn.name,
      nbrape1: idn.apellido1,
      nbrape2: idn.apellido2 ?? "",
      dattelef1: phone,
      datemail: email,
      codidioma: langCode(idn.lang),
    },
  };
  return { payload, identity: idn };
}

export interface CreateResult {
  dry_run: boolean;
  payload: CreatePayload;
  endpoint: string;
  person_check?: unknown;
  response?: unknown;
}

/**
 * Crea un aviso. Por defecto DRY-RUN (no envía nada). Solo con confirm=true:
 * 1) POST buscarPersonasWS (exige valabsper, si no 401) y 2) POST create.
 */
export async function createAviso(client: BilbaoClient, input: CreateAvisoInput): Promise<CreateResult> {
  const { payload } = await buildCreatePayload(input);
  const endpoint = ENDPOINTS.create;
  if (!input.confirm) return { dry_run: true, payload, endpoint };
  const check = (await client.postApi(ENDPOINTS.buscarPersonas, payload.personas)) as Array<{ valabsper?: string }>;
  const valabsper = check?.[0]?.valabsper;
  if (!valabsper?.length) {
    throw new BilbaoClientError401();
  }
  payload.personas.valabsper = valabsper;
  const response = await client.postApi(endpoint, payload);
  return { dry_run: false, payload, endpoint, person_check: check, response };
}

class BilbaoClientError401 extends Error {
  constructor() {
    super("El servidor no validó a la persona (sin valabsper; la app muestra 401). Revisa nombre/apellidos/contacto.");
    this.name = "BilbaoClientError401";
  }
}

/** Fecha de alta con formato YYYY-MM-DD. */
function today(): string {
  const v = new Date();
  const m = String(v.getMonth() + 1).padStart(2, "0");
  const d = String(v.getDate()).padStart(2, "0");
  return `${v.getFullYear()}-${m}-${d}`;
}

/**
 * Adjunta una foto a una comunicación ya creada. Dry-run por defecto.
 * El cuerpo es un array JSON [meta, base64] como lo manda la app.
 */
export async function attachPhoto(
  client: BilbaoClient,
  ideComunicacion: number,
  image: { image_path?: string; image_base64?: string; file_id?: string },
  confirm = false,
  mime = "image/jpeg",
): Promise<{ dry_run: boolean; endpoint: string; saved_image_path: string; response?: unknown }> {
  const endpoint = ENDPOINTS.attachMedia;
  const buf = await loadPhotoBuffer(image.image_base64, image.image_path, image.file_id);
  const name = `foto-${ideComunicacion}.jpg`;
  if (!confirm) {
    return { dry_run: true, endpoint, saved_image_path: image.image_path ?? "(se guarda en tmp al confirmar)" };
  }
  const saved_image_path =
    image.image_path ?? (image.file_id ? resolveUpload(image.file_id) : await saveUpload(buf));
  const base64 = buf.toString("base64");
  const meta = JSON.stringify({
    codEntidad: 20,
    desDocuO: name,
    desDocumE: name,
    desRuta: "",
    desRutaO: "",
    fechaAlta: today(),
    ideAlfresco: "",
    ideAqsDoc: 0,
    ideComunicacion,
    numActuacion: 0,
    terAlta: 200159,
    terBaja: "",
    tipoDoc: mime,
    tipoOrigen: "",
  });
  const response = await client.postApi(endpoint, [meta, base64]);
  return { dry_run: false, endpoint, saved_image_path, response };
}

// ---------------------------------------------------------------------------
// Aviso desde foto (tres fases: categoría, calle, preview; luego envío)
// ---------------------------------------------------------------------------

export type FromPhotoResult =
  | {
      phase: "need_category";
      photo: PhotoInfo;
      gps: { lat: number; lng: number; from: "exif" | "manual" } | null;
      saved_image_path: string;
      suggestions: CategorySuggestion[];
      next: string;
    }
  | {
      phase: "need_street";
      photo: PhotoInfo;
      gps: { lat: number; lng: number; from: "exif" | "manual" } | null;
      saved_image_path: string;
      serviceCode: string;
      reverse: unknown;
      next: string;
    }
  | {
      phase: "preview";
      preview_token: string;
      photo: PhotoInfo;
      gps: { lat: number; lng: number; from: "exif" | "manual" } | null;
      saved_image_path: string;
      category: unknown;
      payload: CreatePayload;
      description_drafted: boolean;
      image_resized: boolean;
      preview_image_base64: string;
      how_to_confirm: string;
    }
  | {
      phase: "sent";
      payload: CreatePayload;
      response: unknown;
      person_check: unknown;
      saved_image_path: string;
      next: string;
    };

export async function createAvisoFromPhoto(
  client: BilbaoClient,
  input: CreateAvisoFromPhotoInput,
): Promise<FromPhotoResult> {
  const buf = await loadPhotoBuffer(input.image_base64, input.image_path, input.file_id);
  const small = downscaleForVision(buf);
  const photo = parsePhoto(small.resized ? small.buffer : buf);
  const saved_image_path =
    input.image_path ?? (input.file_id ? resolveUpload(input.file_id) : await saveUpload(buf));
  const preview_image_base64 = `data:image/jpeg;base64,${small.buffer.toString("base64")}`;

  const lat = input.lat ?? photo.gps?.lat;
  const lng = input.lng ?? photo.gps?.lng;
  const gps = lat !== undefined && lng !== undefined ? { lat, lng, from: (input.lat !== undefined ? "manual" : "exif") as "manual" | "exif" } : null;

  if (!input.serviceCode) {
    const suggestions = await suggestCategories(input.category_hint ?? input.description);
    return {
      phase: "need_category",
      photo,
      gps,
      saved_image_path,
      suggestions,
      next: "Elige un serviceCode de suggestions y repite la llamada con serviceCode. Nada se ha enviado.",
    };
  }
  const category = await getCategory(input.serviceCode);

  if (!input.streetCode && !input.allCity) {
    let reverse: unknown = null;
    if (gps) {
      try {
        reverse = await reverseGeocode(client, gps.lng, gps.lat);
      } catch {
        reverse = null;
      }
    }
    return {
      phase: "need_street",
      photo,
      gps,
      saved_image_path,
      serviceCode: input.serviceCode,
      reverse,
      next: "Elige calle y portal con search_street (ayuda: reverse con el GPS de la foto) y repite con streetCode + portal (+ x/y/districtCode/neighbourhoodCode del portal). Nada se ha enviado.",
    };
  }

  let description_drafted = false;
  let description = input.description?.trim();
  if (!description) {
    description_drafted = true;
    const when = photo.taken_at ? ` (foto del ${photo.taken_at})` : "";
    const what = input.category_hint?.trim() ? ` ${input.category_hint.trim()}` : "";
    description = `Incidencia reportada con foto${when}.${what} Revisar descripción antes de enviar.`.trim();
  }

  const { payload } = await buildCreatePayload({
    kind: input.kind ?? category.kind,
    serviceCode: input.serviceCode,
    description,
    streetCode: input.streetCode ?? "",
    portal: input.portal,
    portalBis: input.portalBis,
    x: input.x,
    y: input.y,
    districtCode: input.districtCode,
    neighbourhoodCode: input.neighbourhoodCode,
    allCity: input.allCity,
    identity: input.identity,
  });
  const token = previewToken(payload);

  if (!input.confirm) {
    return {
      phase: "preview",
      preview_token: token,
      photo,
      gps,
      saved_image_path,
      category,
      payload,
      description_drafted,
      image_resized: small.resized,
      preview_image_base64,
      how_to_confirm:
        "MUESTRA este preview al humano y espera su 'sí'. Solo entonces repite la llamada con los MISMOS campos + confirm:true + human_confirmed:true + este preview_token. Si cambias cualquier campo, pide un preview nuevo.",
    };
  }
  if (input.human_confirmed !== true) {
    throw new Error("Envío bloqueado: falta la confirmación humana. Muestra el preview y repite con human_confirmed:true + preview_token.");
  }
  if (input.preview_token !== token) {
    throw new Error("preview_token inválido o desactualizado (algún campo cambió). Repite el preview. Nada se ha enviado.");
  }
  const sent = await createAviso(client, {
    kind: input.kind ?? category.kind,
    serviceCode: input.serviceCode,
    description,
    streetCode: input.streetCode ?? "",
    portal: input.portal,
    portalBis: input.portalBis,
    x: input.x,
    y: input.y,
    districtCode: input.districtCode,
    neighbourhoodCode: input.neighbourhoodCode,
    allCity: input.allCity,
    identity: input.identity,
    confirm: true,
  });
  return {
    phase: "sent",
    payload,
    response: sent.response,
    person_check: sent.person_check,
    saved_image_path,
    next: `Aviso creado. Para adjuntar la foto: attach_photo con ide_comunicacion de 'response' e image_path=${saved_image_path} + confirm:true (tras OK humano).`,
  };
}
