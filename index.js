// index.js — roleta-immersive-proxy (Render)
// Node 18+ (usa fetch nativo)

const http = require("http");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 10000);
const UPSTREAM = (process.env.UPSTREAM || "").trim();
const BASIC_USER = (process.env.BASIC_USER || "").trim();
const BASIC_PASS = (process.env.BASIC_PASS || "").trim();
const ALLOW_ORIGIN = (process.env.ALLOW_ORIGIN || "*").trim();

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  });
  res.end(body);
}

function normalizeItems(raw) {
  // upstream pode vir:
  // 1) array [ "12","7", ... ] ou [12,7,...]
  // 2) objeto { items:[...], ... }
  // 3) qualquer outro -> vazio
  let items = [];

  if (Array.isArray(raw)) items = raw;
  else if (raw && Array.isArray(raw.items)) items = raw.items;

  items = (items || [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 36);

  return items;
}

async function fetchUpstream() {
  if (!UPSTREAM) {
    return { ok: false, status: 500, hint: "UPSTREAM env var vazio", items: [] };
  }

  const headers = {
    Accept: "application/json,text/plain,*/*",
    "User-Agent": "roleta-immersive-proxy/1.0",
  };

  // Basic Auth só se user/pass existirem
  if (BASIC_USER && BASIC_PASS) {
    const token = Buffer.from(`${BASIC_USER}:${BASIC_PASS}`).toString("base64");
    headers.Authorization = `Basic ${token}`;
  }

  const url = new URL(UPSTREAM);
  const res = await fetch(url.toString(), { method: "GET", headers });

  const status = res.status;
  const txt = await res.text();

  let json = null;
  try {
    json = JSON.parse(txt);
  } catch (_) {
    // se não parseou, segue null
  }

  const items = normalizeItems(json);

  return {
    ok: status >= 200 && status < 300 && items.length > 0,
    status,
    items,
    hint: items.length ? "" : (json ? "JSON sem items/array válido" : "Resposta não-JSON do upstream"),
    ts: Date.now(),
    source: "upstream",
    debug: {
      upstream: url.toString(),
      textSample: String(txt || "").slice(0, 180),
    },
  };
}

const server = http.createServer(async (req, res) => {
  try {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": ALLOW_ORIGIN,
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Max-Age": "86400",
      });
      return res.end();
    }

    const u = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (u.pathname === "/health") {
      return send(res, 200, { ok: true, ts: Date.now() });
    }

    // rota principal: /
    const out = await fetchUpstream();
    return send(res, out.ok ? 200 : 502, out);
  } catch (e) {
    return send(res, 500, {
      ok: false,
      status: 500,
      items: [],
      hint: "Erro interno no proxy",
      ts: Date.now(),
      error: String(e && e.message ? e.message : e),
    });
  }
});

server.listen(PORT, () => {
  console.log(`listening on :${PORT}`);
});
