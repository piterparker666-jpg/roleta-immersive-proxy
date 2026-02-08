import express from "express";

const app = express();

/**
 * ENV esperadas:
 * - UPSTREAM_BASE   (ex: "https://api-exemplo.com")  OU
 * - UPSTREAM_TEMPLATE (ex: "https://api-exemplo.com/{slug}/result.json")
 * - BASIC_USER
 * - BASIC_PASS
 * - ALLOW_ORIGINS (opcional) "*" ou lista separada por vírgula
 * - PORT (Render injeta)
 */

function pickSlug(input) {
  if (!input) return null;
  // mantém só chars seguros básicos
  return String(input).trim();
}

function getAllowedOrigin(reqOrigin) {
  const raw = (process.env.ALLOW_ORIGINS || "*").trim();
  if (raw === "*") return "*";
  const list = raw.split(",").map(s => s.trim()).filter(Boolean);
  if (!reqOrigin) return list[0] || "*";
  return list.includes(reqOrigin) ? reqOrigin : (list[0] || "*");
}

function setCors(req, res) {
  const origin = req.headers.origin;
  const allow = getAllowedOrigin(origin);
  res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function buildUpstreamUrl(slug) {
  const tpl = (process.env.UPSTREAM_TEMPLATE || "").trim();
  const base = (process.env.UPSTREAM_BASE || "").trim();

  // prioridade: template
  if (tpl) {
    return tpl.replace("{slug}", encodeURIComponent(slug));
  }

  // fallback: base + /{slug}/result.json
  if (base) {
    const b = base.endsWith("/") ? base.slice(0, -1) : base;
    return `${b}/${encodeURIComponent(slug)}/result.json`;
  }

  return "";
}

function makeBasicAuthHeader() {
  const u = (process.env.BASIC_USER || "").trim();
  const p = (process.env.BASIC_PASS || "").trim();
  if (!u || !p) return null;
  const token = Buffer.from(`${u}:${p}`).toString("base64");
  return `Basic ${token}`;
}

async function fetchUpstream(url) {
  const auth = makeBasicAuthHeader();

  const headers = {
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0"
  };
  if (auth) headers["Authorization"] = auth;

  const r = await fetch(url, { method: "GET", headers });
  const text = await r.text();

  // tenta parse JSON, mas não quebra se vier texto
  let json = null;
  try { json = JSON.parse(text); } catch {}

  return { status: r.status, text, json };
}

function normalizeItems(parsed) {
  // upstream pode vir: array, {items:[]}, ou qualquer outra estrutura
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)) return parsed.items;
  return [];
}

app.get("/", async (req, res) => {
  setCors(req, res);

  try {
    // slug pode vir por query (?slug=...) ou por path (/Roleta-Imersiva)
    const qSlug = pickSlug(req.query.slug);
    const pSlug = pickSlug(req.path?.replace("/", ""));
    const slug = qSlug || (pSlug && pSlug.length > 0 ? pSlug : "Roleta-Imersiva");

    const upstreamUrl = buildUpstreamUrl(slug);

    if (!upstreamUrl) {
      return res.status(500).json({
        ok: false,
        status: 500,
        hint: "UPSTREAM env var vazio (defina UPSTREAM_BASE ou UPSTREAM_TEMPLATE)",
        items: [],
        slug
      });
    }

    const out = await fetchUpstream(upstreamUrl);

    // Se upstream não for 200, devolve diagnóstico
    if (out.status < 200 || out.status >= 300) {
      return res.status(502).json({
        ok: false,
        status: 502,
        hint: `Upstream retornou HTTP ${out.status}`,
        upstream: upstreamUrl,
        items: [],
        slug,
        upstream_body_head: String(out.text || "").slice(0, 300)
      });
    }

    const items = normalizeItems(out.json);

    return res.json({
      ok: true,
      items,
      source: upstreamUrl,
      ts: new Date().toISOString(),
      slug
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      status: 500,
      hint: "Erro interno no proxy",
      error: String(err?.message || err),
      items: []
    });
  }
});

// suporte: /Roleta-Imersiva ou /Immersive-Roulette etc
app.get("/:slug", async (req, res) => {
  // reaproveita a lógica chamando /
  req.query.slug = req.params.slug;
  return app._router.handle(req, res, () => {});
});

app.options("*", (req, res) => {
  setCors(req, res);
  res.status(204).send("");
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log("Proxy on port", port);
});
