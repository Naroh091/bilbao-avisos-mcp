#!/usr/bin/env node
/**
 * CLI fino sobre el mismo núcleo, para pruebas manuales.
 * Uso: bilbao-avisos <comando> [args]
 *   check-auth
 *   identity                                   (muestra la guardada)
 *   identity-set <nombre> <apellido1> [apellido2] [teléfono] [email] [es|eu]
 *   categories
 *   category <SERVICE-TEMA>                    (p.ej. LIM-OSLILI)
 *   street <nombre-calle>
 *   reverse <lon> <lat>
 *   my-avisos
 *   create A|S <SERVICE-TEMA> <cod-calle> <portal> <descripción>   (SIEMPRE dry-run; añade --send para enviar)
 *   from-photo <image_path> [SERVICE-TEMA] [descripción]   (preview; con --send --token <tok> --yes envía tras revisión humana)
 *   prep-photo <in.jpg> [out.jpg] [--max 2048] [--quality 82]
 */
import { readFile, writeFile, stat } from "node:fs/promises";
import { BilbaoClient } from "./client.js";
import {
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
} from "./avisos.js";

import { downscaleForVision, parsePhoto } from "./photo.js";

const client = new BilbaoClient();

function out(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

function numOpt(args: string[], name: string, def: number): number {
  const i = args.indexOf(name);
  if (i < 0) {
    const eq = args.find((a) => a.startsWith(name + "="));
    if (!eq) return def;
    const v = Number(eq.slice(name.length + 1));
    return Number.isFinite(v) ? v : def;
  }
  const v = Number(args[i + 1]);
  return Number.isFinite(v) ? v : def;
}

/** Reduce una foto en TS (sin Pillow): conserva EXIF/GPS e informa por JSON. */
async function prepPhoto(passthru: string[]): Promise<void> {
  const positional = passthru.filter((a, i) => {
    if (a.startsWith("--")) return false;
    const prev = passthru[i - 1];
    if (prev === "--max" || prev === "--quality") return false;
    return true;
  });
  const [input, output] = positional;
  if (!input) {
    console.error("Uso: prep-photo <in.jpg> [out.jpg] [--max 2048] [--quality 82]");
    process.exit(1);
  }
  const max = numOpt(passthru, "--max", 2048);
  const quality = numOpt(passthru, "--quality", 80);
  const buf = await readFile(input);
  const before = parsePhoto(buf);
  const small = downscaleForVision(buf, max, quality);
  const dst = output ?? input.replace(/(\.[a-zA-Z0-9]+)?$/, "-ligera$1");
  if (small.resized || dst !== input) await writeFile(dst, small.buffer);
  const info = parsePhoto(small.buffer);
  const stIn = await stat(input);
  const stOut = await stat(dst);
  out({
    ok: true,
    input,
    output: dst,
    orig: { width: before.width, height: before.height, bytes: stIn.size },
    out: { width: small.width || info.width, height: small.height || info.height, bytes: stOut.size },
    resized: small.resized,
    gps: before.gps,
    gps_preserved: JSON.stringify(before.gps) === JSON.stringify(info.gps),
  });
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const send = args.includes("--send");
  const rest = args.filter((a) => a !== "--send");

  switch (cmd) {
    case "check-auth":
      return out(await checkAuth(client));
    case "identity":
      return out((await getIdentity()) ?? { saved: false });
    case "identity-set":
      return out(
        await setIdentity({
          name: rest[0] ?? "",
          apellido1: rest[1] ?? "",
          apellido2: rest[2] && !rest[2].includes("@") && !/^[0-9]+$/.test(rest[2]) ? rest[2] : "",
          userPhone: rest.find((a) => /^[0-9]{9}$/.test(a)),
          userEmail: rest.find((a) => a.includes("@")),
          lang: (rest.includes("eu") ? "eu" : "es") as "es" | "eu",
        }),
      );
    case "categories":
      return out(await listCategories());
    case "category":
      return out(await getCategory(rest[0]));
    case "street":
      return out(await searchStreet(client, rest.join(" ")));
    case "reverse":
      return out(await reverseGeocode(client, Number(rest[0]), Number(rest[1])));
    case "my-avisos":
      return out(await myAvisos(client));
    case "create":
      return out(
        await createAviso(client, {
          kind: rest[0] as "A" | "S",
          serviceCode: rest[1],
          streetCode: rest[2],
          portal: rest[3],
          description: rest.slice(4).join(" "),
          confirm: send, // sin --send => dry-run
        }),
      );
    case "from-photo": {
      // from-photo <path> [serviceCode] [descripción] [--send --token <tok> --yes]
      const tokIdx = rest.indexOf("--token");
      const token = tokIdx >= 0 ? rest[tokIdx + 1] : undefined;
      const yes = rest.includes("--yes");
      const positional = rest.filter((a, i) => {
        if (a === "--send" || a === "--yes" || a === "--token") return false;
        if (tokIdx >= 0 && i === tokIdx + 1) return false;
        return true;
      });
      return out(
        await createAvisoFromPhoto(client, {
          image_path: positional[0],
          serviceCode: positional[1],
          description: positional[2],
          confirm: send, // sin --send => preview; con --send exige --token + --yes
          preview_token: token,
          human_confirmed: yes,
        }),
      );
    }
    case "prep-photo":
      return prepPhoto(process.argv.slice(3));
    default:
      console.error(
        "Comandos: check-auth | identity | identity-set <nombre> <apellido1> [apellido2] [teléfono] [email] [es|eu] | categories | category <SERVICE-TEMA> | street <calle> | reverse <lon> <lat> | my-avisos | create A|S <SERVICE-TEMA> <calle> <portal> <desc> [--send] | from-photo <path> [SERVICE-TEMA] [desc] [--send --token <tok> --yes] | prep-photo <in> [out]",
      );
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
