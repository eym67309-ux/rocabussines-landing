import type { APIRoute } from "astro";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const prerender = false;

// Registro propio de visitas a las paginas publicas. Solo guarda: codigo de visita
// al azar, pagina, propiedad (si la pagina es una), origen y fecha.
// No se guarda la IP, ni el dispositivo, ni la ubicacion.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SID_RE = /^[A-Za-z0-9-]{16,64}$/;
// Ojo: "Instagram" y "FBAN/FBAV" (navegadores internos de Instagram/Facebook)
// son visitas reales, no deben filtrarse. Los robots de vista previa casi nunca
// ejecutan JavaScript, esto es una segunda barrera.
const BOT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|meta-externalagent|\bWhatsApp\/|preview|headless|lighthouse|pagespeed|gtmetrix|uptime|monitor|curl\/|wget|python|go-http|node-fetch|axios/i;
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|192\.168\.|10\.)/;

const noContent = () => new Response(null, { status: 204 });
const clip = (v: unknown, max = 120): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

// Navegadores internos de las apps de Meta: la persona abrió el enlace DENTRO de la app.
// Facebook: FBAN / FBAV / FB_IAB / FBIOS (Messenger usa los mismos). Instagram: "Instagram".
const FB_APP_RE = /FBAN|FBAV|FB_IAB|FBIOS/;
const IG_APP_RE = /Instagram/;

// Orden de decisión (de más a menos confiable):
//  1. Etiqueta explícita en el enlace (?utm_source=...).
//  2. Sitio de donde viene la persona (referrer) si es Facebook, Instagram, Google o WhatsApp.
//  3. Navegador interno de la app de Facebook / Instagram.
//  4. fbclid: Facebook lo agrega solo a los enlaces que salen de Facebook... e Instagram también
//     lo hace, por eso va DESPUÉS de las señales que distinguen una de otra. Y como un enlace con
//     fbclid puede copiarse y pegarse en WhatsApp o en Google, un origen claro de esos gana.
//  5. Cualquier otro sitio ("other") o directo.
function sourceOf(utmSource: string | null, referrerHost: string | null, fbClick: boolean, ua: string): string {
  const u = (utmSource ?? "").toLowerCase();
  if (u) {
    if (/^(facebook|fb)$/.test(u)) return "facebook";
    if (/^(instagram|ig)$/.test(u)) return "instagram";
    if (u === "google") return "google";
    if (/^(whatsapp|wa)$/.test(u)) return "whatsapp";
    return "other";
  }
  const h = (referrerHost ?? "").toLowerCase();
  if (h) {
    if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(h)) return "facebook";
    if (/(^|\.)instagram\.com$/.test(h)) return "instagram";
    if (/(^|\.)google\.[a-z.]+$/.test(h)) return "google";
    if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(h)) return "whatsapp";
  }
  // Instagram primero: algunas versiones de su navegador interno también traen marcas "FB..."
  if (IG_APP_RE.test(ua)) return "instagram";
  if (FB_APP_RE.test(ua)) return "facebook";
  if (fbClick) return "facebook";
  return h ? "other" : "direct";
}

let client: SupabaseClient | null = null;
function db(): SupabaseClient | null {
  if (client) return client;
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return client;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const host = request.headers.get("host") ?? "";
    // En desarrollo local no se registra nada, salvo que se pida (pruebas).
    if (LOCAL_HOST_RE.test(host) && import.meta.env.TRACK_ALLOW_LOCAL !== "1") return noContent();

    const origin = request.headers.get("origin");
    if (origin) {
      try {
        if (new URL(origin).host !== host) return noContent();
      } catch {
        return noContent();
      }
    }

    const ua = request.headers.get("user-agent") ?? "";
    if (!ua || BOT_RE.test(ua)) return noContent();

    const raw = await request.text();
    if (raw.length > 2000) return noContent();
    const b = JSON.parse(raw) as Record<string, unknown>;

    const sid = typeof b.sid === "string" ? b.sid : "";
    const path = clip(b.path, 200);
    if (!SID_RE.test(sid) || !path || !path.startsWith("/")) return noContent();

    const propertyId = typeof b.propertyId === "string" && UUID_RE.test(b.propertyId) ? b.propertyId : null;

    const row = {
      session_id: sid,
      path,
      property_id: propertyId,
      source: sourceOf(clip(b.utm_source), clip(b.referrer_host), b.fb_click === true, ua),
    };

    const supabase = db();
    if (!supabase) {
      console.error("[track] Falta SUPABASE_SERVICE_ROLE_KEY");
      return noContent();
    }
    let { error } = await supabase.from("site_visits").insert(row);
    // Propiedad que ya no existe (llave foranea): se guarda igual, sin propiedad.
    if (error?.code === "23503" && row.property_id) {
      ({ error } = await supabase.from("site_visits").insert({ ...row, property_id: null }));
    }
    if (error) console.error("[track] No se pudo guardar:", error.message);
  } catch (err) {
    console.error("[track] Error:", err instanceof Error ? err.message : err);
  }
  return noContent();
};
