/**
 * Cliente HTTP de bajo nivel para el API de Mejora Bilbao.
 *
 * Auth: Keycloak grant_type=password con la cuenta de servicio (env). El token
 * dura ~1h; ante un 401 se pide uno nuevo y se reintenta una vez (single-flight).
 * El callejero (WebServicesBilbao) y categories.json NO llevan auth.
 */
import {
  API_BASE,
  CLIENT_ID,
  CLIENT_SECRET,
  ENDPOINTS,
  SERVICE_PASSWORD,
  SERVICE_USERNAME,
} from "./config.js";

export class BilbaoApiError extends Error {
  constructor(
    public status: number,
    public url: string,
    public body: unknown,
  ) {
    super(`Bilbao API ${status} en ${url}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
    this.name = "BilbaoApiError";
  }
}

interface TokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  token_type?: string;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

export class BilbaoClient {
  private accessToken: string | undefined;
  private fetching: Promise<string> | null = null;

  /** Pide un token nuevo con el grant password (form-urlencoded, como la app). */
  async fetchToken(): Promise<string> {
    if (this.fetching) return this.fetching;
    this.fetching = (async () => {
      if (!SERVICE_USERNAME || !SERVICE_PASSWORD) {
        throw new Error(
          "Faltan BILBAO_AVISOS_USERNAME / BILBAO_AVISOS_PASSWORD. " +
            "Lee tu copia del APK (grep 'token_credentials' en assets/public/main.*.js) " +
            "o pide credenciales propias al Ayuntamiento de Bilbao.",
        );
      }
      const body = new URLSearchParams({
        username: SERVICE_USERNAME,
        password: SERVICE_PASSWORD,
        grant_type: "password",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      });
      const res = await fetch(ENDPOINTS.token, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const parsed = (await parseBody(res)) as TokenResponse;
      if (!res.ok || !parsed?.access_token) {
        throw new BilbaoApiError(res.status, ENDPOINTS.token, parsed);
      }
      this.accessToken = parsed.access_token;
      return parsed.access_token;
    })();
    try {
      return await this.fetching;
    } finally {
      this.fetching = null;
    }
  }

  hasServiceCredentials(): boolean {
    return Boolean(SERVICE_USERNAME && SERVICE_PASSWORD);
  }

  private async request(makeReq: (token?: string) => Promise<Response>, url: string): Promise<unknown> {
    let token = this.accessToken ?? (this.hasServiceCredentials() ? await this.fetchToken() : undefined);
    let res = await makeReq(token);
    if (res.status === 401 && this.hasServiceCredentials()) {
      token = await this.fetchToken();
      res = await makeReq(token);
      if (res.status === 401) {
        throw new BilbaoApiError(401, url, "No autorizado: la cuenta de servicio fue rechazada.");
      }
    }
    const body = await parseBody(res);
    if (!res.ok) throw new BilbaoApiError(res.status, url, body);
    return body;
  }

  private apiUrl(path: string): string {
    return new URL(path, API_BASE).toString();
  }

  private authHeaders(token?: string): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json; charset=UTF-8" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }

  /** POST JSON al API municipal (con Bearer). */
  async postApi<T = unknown>(path: string, payload: unknown): Promise<T> {
    const url = this.apiUrl(path);
    return this.request(
      (token) => fetch(url, { method: "POST", headers: this.authHeaders(token), body: JSON.stringify(payload) }),
      url,
    ) as Promise<T>;
  }

  /** GET al callejero (sin auth). */
  async getStreet<T = unknown>(url: string): Promise<T> {
    const res = await fetch(url, { method: "GET" });
    const body = await parseBody(res);
    if (!res.ok) throw new BilbaoApiError(res.status, url, body);
    return body as T;
  }

  /**
   * POST al buscador de calles (sin auth). La app lo hace así en escritorio y
   * decodifica la respuesta como Latin-1 (los nombres traen tildes).
   */
  async postStreetSearch(params: string): Promise<unknown> {
    const url = `${ENDPOINTS.streetFinderHost}/WebServicesBilbao/WSBilbao${params}`;
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok) throw new BilbaoApiError(res.status, url, buf.toString("latin1").slice(0, 500));
    try {
      return JSON.parse(buf.toString("latin1"));
    } catch {
      return buf.toString("latin1");
    }
  }
}
