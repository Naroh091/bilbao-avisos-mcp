/**
 * Configuración del sistema de avisos de Bilbao (Mejora Bilbao / Bilbo Hobetuz).
 *
 * Valores extraídos por ingeniería inversa del APK "Mejora Bilbao - Bilbo Hobetuz"
 * (com.bilbao.MejoraBilbao v4.0.0, app híbrida Capacitor; lógica en assets/public/main.*.js)
 * y verificados con llamadas reales a los endpoints de lectura.
 *
 * Autenticación: la app NO usa cuenta de ciudadano. Usa una cuenta de servicio
 * vía Keycloak (grant_type=password) y pega un Bearer en cada llamada al API.
 * Las credenciales de servicio viajan por variables de entorno, NUNCA en el código.
 */
import { homedir } from "node:os";
import { join } from "node:path";

/** API municipal (prefijo /aqs + módulo). */
export const API_BASE =
  process.env.BILBAO_AVISOS_API_BASE ?? "https://api.bilbao.eus/aqs/";

export const ENDPOINTS = {
  /** Token Keycloak (realm bilbokoudala, grant password). */
  token:
    process.env.BILBAO_AVISOS_TOKEN_URL ??
    "https://auth.bilbao.eus/auth/realms/bilbokoudala/protocol/openid-connect/token",
  /** Paso previo a crear: valida a la persona; exige valabsper en la respuesta. */
  buscarPersonas: "comunicaciones/buscarPersonasWS",
  /** Crea un aviso (A) o sugerencia (S). */
  create: "comunicaciones/createMejoraBilbaoWS",
  /** "Mis avisos": filtra por teléfono/email del comunicante. */
  search: "vistaConsultasGenerales/filtroMejoraBilbaoWS/",
  /** Adjunta una foto a una comunicación ya creada. */
  attachMedia: "documentosAsociados/createMejoraBilbao/",
  /** Control de versión mínima de la app. */
  comprobarVersion: "comunicaciones/comprobarVersion",
  /** Categorías y temas (JSON público, sin auth). */
  categories:
    process.env.BILBAO_AVISOS_CATEGORIES_URL ??
    "https://www.bilbao.eus/mejorabilbao/assets/categoriesImages/categories.json",
  /** Callejero (búsqueda y reversa, sin auth). */
  streetFinderHost:
    process.env.BILBAO_AVISOS_STREET_HOST ?? "https://www.bilbao.eus",
} as const;

/**
 * client_id / client_secret OAuth de la app (públicos en el APK; la app usa "aqs").
 * Se pueden sobrescribir por entorno si el Ayuntamiento emite otros.
 */
export const CLIENT_ID = process.env.BILBAO_AVISOS_CLIENT_ID ?? "aqs";
export const CLIENT_SECRET = process.env.BILBAO_AVISOS_CLIENT_SECRET ?? "aqs";

/**
 * Cuenta de servicio para el grant password de Keycloak. SIN valor por defecto:
 * lee tu copia del APK (grep 'token_credentials' en assets/public/main.*.js)
 * o pide credenciales propias al Ayuntamiento.
 */
export const SERVICE_USERNAME = process.env.BILBAO_AVISOS_USERNAME ?? "";
export const SERVICE_PASSWORD = process.env.BILBAO_AVISOS_PASSWORD ?? "";

/** Versión que declara este cliente en cada aviso (la app manda la suya). */
export const APP_VERSION = process.env.BILBAO_AVISOS_APP_VERSION ?? "4.0.0";

/**
 * Fichero donde vive el perfil del ciudadano (nombre, apellidos, contacto, idioma).
 * Se pregunta UNA vez tras la instalación (ver skill) y se reutiliza.
 * Modo 0600: son datos personales.
 */
export const IDENTITY_STORE =
  process.env.BILBAO_AVISOS_IDENTITY_STORE ??
  join(homedir(), ".config", "bilbao-avisos", "identity.json");
