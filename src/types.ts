/**
 * Esquemas (zod) de entrada de las herramientas.
 * serviceCode = "SERVICIO-TEMA" (p.ej. "LIM-OSLILI"), como lo parte la app por "-".
 */
import { z } from "zod";

/** Identidad del comunicante para una llamada concreta (por defecto, la guardada). */
export const IdentityOverride = z
  .object({
    name: z.string().optional(),
    apellido1: z.string().optional(),
    apellido2: z.string().optional(),
    userPhone: z.string().optional(),
    userEmail: z.string().optional(),
    lang: z.enum(["es", "eu"]).optional(),
  })
  .describe("Sobrescribe la identidad guardada solo para esta llamada");

/** Entrada de create_aviso. */
export const CreateAvisoInput = z.object({
  /** "A" aviso (incidencia) o "S" sugerencia. */
  kind: z.enum(["A", "S"]).describe("'A' aviso/incidencia, 'S' sugerencia"),
  serviceCode: z.string().describe("SERVICIO-TEMA de list_categories (p.ej. LIM-OSLILI)"),
  description: z.string().describe("descripción del problema (texto que se publicará)"),
  streetCode: z.string().describe("TECA_COD_CALLE del callejero (search_street)"),
  portal: z.string().optional().describe("número de portal (por defecto '00')"),
  portalBis: z.boolean().optional().describe("true si el portal es 'bis' (rama con dirBisComunicacion)"),
  /** Coordenadas del portal (las da search_street: GDO_GEOMETRY_XLO/YLO). */
  x: z.number().optional(),
  y: z.number().optional(),
  districtCode: z.string().optional().describe("TTRE_COD_DISEST del portal"),
  neighbourhoodCode: z.string().optional().describe("TTRE_COD_BARRIO del portal"),
  /** Solo sugerencias de toda la ciudad (la app usa calle 3850 / portal 1). */
  allCity: z.boolean().optional(),
  identity: IdentityOverride.optional(),
  confirm: z.boolean().optional().describe("DEBE ser true para ENVIAR de verdad. Por defecto false = dry-run."),
});
export type CreateAvisoInput = z.infer<typeof CreateAvisoInput>;

/** Entrada de create_aviso_from_photo (dos fases con confirmación humana). */
export const CreateAvisoFromPhotoInput = z.object({
  image_base64: z.string().optional().describe("foto como base64 (puro o data URL). Solo fotos pequeñas ya visibles"),
  image_path: z.string().optional().describe("ruta local a la foto. Solo stdio/CLI en la máquina del servidor"),
  file_id: z.string().optional().describe("VÍA PREFERIDA en remoto: id de PUT /upload"),
  kind: z.enum(["A", "S"]).optional().describe("por defecto 'A'"),
  serviceCode: z.string().optional().describe("SERVICIO-TEMA. Si falta, devuelve sugerencias y no crea nada"),
  category_hint: z.string().optional().describe("lo que se ve en la foto ('cartones apilados en acera')"),
  description: z.string().optional().describe("si falta, se pre-rellena y se marca para revisión"),
  lat: z.number().optional().describe("sobrescribe el GPS EXIF de la foto"),
  lng: z.number().optional().describe("sobrescribe el GPS EXIF de la foto"),
  streetCode: z.string().optional(),
  portal: z.string().optional(),
  portalBis: z.boolean().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  districtCode: z.string().optional(),
  neighbourhoodCode: z.string().optional(),
  allCity: z.boolean().optional(),
  identity: IdentityOverride.optional(),
  confirm: z.boolean().optional().describe("true = ENVIAR de verdad (requiere preview_token + human_confirmed)"),
  preview_token: z.string().optional(),
  human_confirmed: z.boolean().optional().describe("el humano vio el preview y dijo 'sí'"),
});
export type CreateAvisoFromPhotoInput = z.infer<typeof CreateAvisoFromPhotoInput>;

/** Cuerpo JSON del POST createMejoraBilbaoWS (campos de la app). */
export interface CreatePayload {
  tipoComunicacion: "A" | "S";
  codServicio: string;
  codTema: string;
  codCalleComunicacion: string;
  codPortalComunicacion: string;
  desComunicacion: string;
  codDistritoComunicacion?: string;
  codBarrioComunicacion?: string;
  dirBisComunicacion?: boolean | string;
  coordenadaX?: number | null;
  coordenadaY?: number | null;
  codCanal: "M";
  appVersion: string;
  avisos: {
    codEntidad: number;
    ideComunicacion: number;
    nbrInfor: string;
    datContac: string;
    codDictame: string;
  };
  personas: {
    idenif: string;
    nbrnombre: string;
    nbrape1: string;
    nbrape2: string;
    dattelef1: string;
    datemail: string;
    codidioma: "C" | "E";
    valabsper?: string;
  };
}
