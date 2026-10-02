/**
 * Perfil del ciudadano que reporta. La app "Mejora Bilbao" no tiene registro:
 * pide estos datos en el formulario de cada aviso y guarda el último uso en
 * local (clave LAST_USER_SENDED) para pre-rellenar el siguiente.
 *
 * Este MCP hace lo mismo en servidor: `set_identity` guarda el perfil en un
 * JSON local (modo 0600) y las tools de creación/búsqueda lo usan por defecto.
 * Pregunta idioma + datos UNA vez tras la instalación (ver skill/SKILL.md).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { IDENTITY_STORE } from "./config.js";

export type Lang = "es" | "eu";

export interface CitizenIdentity {
  /** Nombre. Obligatorio para crear. */
  name: string;
  /** Primer apellido. Obligatorio para crear. */
  apellido1: string;
  /** Segundo apellido. Opcional. */
  apellido2?: string;
  /** Teléfono (9 dígitos). Obligatorio si no hay email. */
  userPhone?: string;
  /** Email. Obligatorio si no hay teléfono. */
  userEmail?: string;
  /** Idioma de las comunicaciones: es (C) o eu (E). */
  lang: Lang;
}

const EMAIL_RE = /^[a-zA-Z0-9.-_]{1,}@[a-zA-Z.-]{2,}[.]{1}[a-zA-Z]{2,}$/;

/** Valida un perfil con las mismas reglas del formulario de la app. */
export function validateIdentity(i: CitizenIdentity): string[] {
  const errors: string[] = [];
  if (!i.name?.trim()) errors.push("name: obligatorio (Introduce un nombre).");
  if (!i.apellido1?.trim()) errors.push("apellido1: obligatorio (Introduce el primer apellido).");
  const phone = i.userPhone?.trim() ?? "";
  const email = i.userEmail?.trim() ?? "";
  if (!phone && !email) errors.push("Rellena mínimo email o teléfono.");
  if (phone && !/^[0-9]{9}$/.test(phone)) errors.push("userPhone: introduce un teléfono válido (9 dígitos).");
  if (email && !EMAIL_RE.test(email)) errors.push("userEmail: introduce un email válido.");
  if (i.lang !== "es" && i.lang !== "eu") errors.push("lang: 'es' o 'eu'.");
  return errors;
}

/** Código de idioma que espera el API (la app manda C/E según SELECTED_LANG). */
export function langCode(lang: Lang): "C" | "E" {
  return lang === "eu" ? "E" : "C";
}

export async function loadIdentity(store = IDENTITY_STORE): Promise<CitizenIdentity | null> {
  try {
    const raw = await readFile(store, "utf8");
    return JSON.parse(raw) as CitizenIdentity;
  } catch {
    return null;
  }
}

export async function saveIdentity(identity: CitizenIdentity, store = IDENTITY_STORE): Promise<void> {
  const errors = validateIdentity(identity);
  if (errors.length) throw new Error(`Identidad inválida: ${errors.join(" ")}`);
  await mkdir(dirname(store), { recursive: true });
  await writeFile(store, JSON.stringify(identity, null, 2), { mode: 0o600 });
}
