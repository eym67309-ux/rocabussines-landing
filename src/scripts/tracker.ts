// Medicion propia de visitas (ver src/pages/api/track.ts). Solo cuenta paginas vistas.
// - Sin cookies: solo un codigo al azar en sessionStorage que se borra al cerrar la pestana.
// - Respeta "No rastrear" (DNT) y el control global de privacidad (GPC).
// - Equipo interno: abrir cualquier pagina con ?notrack=1 para no contarse (?notrack=0 lo revierte).
// - Solo funciona si PUBLIC_ANALYTICS_ENABLED=true.

const SID_KEY = "roca_sid";
const ATTR_KEY = "roca_attr";
const OPTOUT_KEY = "roca_notrack";
const PROPERTY_PATH_RE = /^\/propiedades\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

type Attribution = {
  utm_source: string | null;
  referrer_host: string | null;
  // Solo "sí/no": Facebook agrega solo ?fbclid=... a los enlaces que salen de Facebook
  // e Instagram. Lo único que nos sirve es saber que venía; el código en sí no se envía ni se guarda.
  fb_click: boolean;
};

function isOptedOut(): boolean {
  try {
    const params = new URLSearchParams(location.search);
    if (params.get("notrack") === "1") localStorage.setItem(OPTOUT_KEY, "1");
    if (params.get("notrack") === "0") localStorage.removeItem(OPTOUT_KEY);
    if (localStorage.getItem(OPTOUT_KEY) === "1") return true;
  } catch {
    /* sin almacenamiento: seguimos, pero sin recordar nada */
  }
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return navigator.doNotTrack === "1" || nav.globalPrivacyControl === true;
}

function sessionId(): string | null {
  try {
    let id = sessionStorage.getItem(SID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SID_KEY, id);
    }
    return id;
  } catch {
    return null; // sin sessionStorage no medimos (no hay forma de agrupar la visita)
  }
}

// El origen se decide en la primera pagina de la visita y se mantiene
// (si alguien llega por Facebook y luego navega, todo cuenta como Facebook).
function attribution(): Attribution {
  try {
    const saved = sessionStorage.getItem(ATTR_KEY);
    if (saved) return JSON.parse(saved) as Attribution;
  } catch {
    /* seguimos y lo calculamos */
  }
  const q = new URLSearchParams(location.search);
  let referrerHost: string | null = null;
  try {
    if (document.referrer) {
      const h = new URL(document.referrer).host;
      referrerHost = h && h !== location.host ? h : null; // navegar dentro del sitio no es un origen
    }
  } catch {
    /* referrer invalido: queda como directo */
  }
  const attr: Attribution = {
    utm_source: q.get("utm_source"),
    referrer_host: referrerHost,
    fb_click: !!q.get("fbclid"),
  };
  try {
    sessionStorage.setItem(ATTR_KEY, JSON.stringify(attr));
  } catch {
    /* no pasa nada */
  }
  return attr;
}

function sendPageView() {
  if (isOptedOut()) return;
  const sid = sessionId();
  if (!sid) return;
  const body = JSON.stringify({
    sid,
    path: location.pathname,
    propertyId: location.pathname.match(PROPERTY_PATH_RE)?.[1] ?? null,
    ...attribution(),
  });
  fetch("/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

if (import.meta.env.PUBLIC_ANALYTICS_ENABLED === "true") {
  // El sitio cambia de pagina sin recargar (transiciones de Astro): hay que
  // contar en cada "astro:page-load", no solo en la primera carga.
  let counted = false;
  document.addEventListener("astro:page-load", () => {
    counted = true;
    sendPageView();
  });
  // Red de seguridad: si "astro:page-load" salio antes de que este script se
  // registrara, la primera carga se cuenta cuando termina de cargar. Si el aviso
  // ya llego, no se cuenta de nuevo.
  const fallback = () => {
    if (counted) return;
    counted = true;
    sendPageView();
  };
  if (document.readyState === "complete") fallback();
  else window.addEventListener("load", fallback, { once: true });
}
