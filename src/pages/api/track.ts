import type { APIRoute } from "astro";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const prerender = false;

// Registro propio de visitas (ver /privacidad). No se guarda la IP ni se usa
// ninguna cookie de seguimiento: solo la pagina, el origen, el tipo de
// dispositivo y la provincia aproximada (que Vercel deduce de la IP en el
// momento, sin que la IP llegue a guardarse).

const EVENTS = new Set(["page_view", "whatsapp_click", "form_submit"]);
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

function deviceOf(ua: string): "mobile" | "tablet" | "desktop" {
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return "mobile";
  return "desktop";
}

function sourceOf(utmSource: string | null, referrerHost: string | null): string {
  const u = (utmSource ?? "").toLowerCase();
  if (u) {
    if (/^(facebook|fb)$/.test(u)) return "facebook";
    if (/^(instagram|ig)$/.test(u)) return "instagram";
    if (u === "google") return "google";
    if (/^(whatsapp|wa)$/.test(u)) return "whatsapp";
    return "other";
  }
  const h = (referrerHost ?? "").toLowerCase();
  if (!h) return "direct";
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(h)) return "facebook";
  if (/(^|\.)instagram\.com$/.test(h)) return "instagram";
  if (/(^|\.)google\.[a-z.]+$/.test(h)) return "google";
  if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(h)) return "whatsapp";
  return "other";
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

    const event = typeof b.event === "string" ? b.event : "";
    const sid = typeof b.sid === "string" ? b.sid : "";
    const path = clip(b.path, 200);
    if (!EVENTS.has(event) || !SID_RE.test(sid) || !path || !path.startsWith("/")) return noContent();

    const propertyId = typeof b.propertyId === "string" && UUID_RE.test(b.propertyId) ? b.propertyId : null;
    const utmSource = clip(b.utm_source);
    const referrerHost = clip(b.referrer_host);

    const row = {
      session_id: sid,
      event,
      path,
      property_id: propertyId,
      source: sourceOf(utmSource, referrerHost),
      utm_source: utmSource,
      utm_medium: clip(b.utm_medium),
      utm_campaign: clip(b.utm_campaign),
      utm_content: clip(b.utm_content),
      referrer_host: referrerHost,
      device: deviceOf(ua),
      country: clip(request.headers.get("x-vercel-ip-country"), 2),
      region: clip(request.headers.get("x-vercel-ip-country-region"), 8),
      lang: clip(b.lang, 5),
    };

    const supabase = db();
    if (!supabase) {
      console.error("[track] Falta SUPABASE_SERVICE_ROLE_KEY");
      return noContent();
    }
    let { error } = await supabase.from("site_events").insert(row);
    // Propiedad que ya no existe (llave foranea): se guarda igual, sin propiedad.
    if (error?.code === "23503" && row.property_id) {
      ({ error } = await supabase.from("site_events").insert({ ...row, property_id: null }));
    }
    if (error) console.error("[track] No se pudo guardar:", error.message);
  } catch (err) {
    console.error("[track] Error:", err instanceof Error ? err.message : err);
  }
  return noContent();
};
