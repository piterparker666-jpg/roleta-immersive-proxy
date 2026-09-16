import express from "express";
const app = express();

/* CORS */
function setCors(req, res) {
  const allow = (process.env.ALLOW_ORIGIN || "*").trim() || "*";
  res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function pickSlug(input) {
  return (input == null ? "" : String(input)).trim();
}

// aceita {slug} OU ${slug}
function buildUpstreamUrl(slug) {
  const tpl = (process.env.UPSTREAM_TEMPLATE || "").trim();
  const base = (process.env.UPSTREAM_BASE || "").trim();

  if (tpl) {
    return tpl
      .replace("{slug}", encodeURIComponent(slug))
      .replace("${slug}", encodeURIComponent(slug));
  }
  if (base) {
    const b = base.endsWith("/") ? base.slice(0, -1) : base;
    return `${b}/${encodeURIComponent(slug)}/result.json`;
  }
  return "";
}

// debug seguro (não vaza senha)
function getAuthInfo() {
  const u = String(process.env.BASIC_USER ?? "").trim();
  const p = String(process.env.BASIC_PASS ?? "").trim();
  return { hasUser: !!u, hasPass: !!p, userLen: u.length, passLen: p.length, userHead: u.slice(0, 2) };
}

function makeBasicAuthHeader() {
  const u = String(process.env.BASIC_USER ?? "").trim();
  const p = String(process.env.BASIC_PASS ?? "").trim();
  if (!u || !p) return null;
  const token = Buffer.from(`${u}:${p}`).toString("base64");
  return `Basic ${token}`;
}

async function fetchUpstream(url, withAuth) {
  const auth = withAuth ? makeBasicAuthHeader() : null;

  // Headers “browser-like”
  const headers = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Referer": "http://189.1.172.114/",
    "Connection": "keep-alive",
  };
  if (auth) headers["Authorization"] = auth;

  const r = await fetch(url, { method: "GET", headers, redirect: "follow" });
  const text = await r.text();

  let json = null;
  try { json = JSON.parse(text); } catch {}

  return { status: r.status, text, json };
}

function normalizeItems(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)) return parsed.items;
  return [];
}

/* OPTIONS */
app.options("*", (req, res) => {
  setCors(req, res);
  res.status(204).send("");
});

/* DEBUG */
app.get("/debug", async (req, res) => {
  setCors(req, res);

  // ✅ DEFAULT COM 2M
  const slug = pickSlug(req.query.slug) || "Roleta-Immersiva";
  const upstreamUrl = buildUpstreamUrl(slug);

  const env = {
    hasTemplate: !!String(process.env.UPSTREAM_TEMPLATE ?? "").trim(),
    hasBase: !!String(process.env.UPSTREAM_BASE ?? "").trim(),
    upstreamUrl,
    auth: getAuthInfo(),
  };

  if (!upstreamUrl) {
    return res.status(500).json({ ok: false, hint: "Sem UPSTREAM_TEMPLATE/UPSTREAM_BASE", env });
  }

  try {
    const noAuth = await fetchUpstream(upstreamUrl, false);
    const withAuth = await fetchUpstream(upstreamUrl, true);

    return res.json({
      ok: true,
      env,
      test_noAuth: { status: noAuth.status, body_head: String(noAuth.text || "").slice(0, 140) },
      test_withAuth: { status: withAuth.status, body_head: String(withAuth.text || "").slice(0, 140) },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, env, error: String(e?.message || e) });
  }
});

/* MAIN */
app.get("/", async (req, res) => {
  setCors(req, res);

  // ✅ DEFAULT COM 2M
  const slug = pickSlug(req.query.slug) || "Roleta-Immersiva";
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

  try {
    const out = await fetchUpstream(upstreamUrl, true);

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

const port = process.env.PORT || 10000;
app.listen(port, () => console.log("Proxy on port", port));
