import express from "express";
const app = express();

function setCors(req, res) {
  const allow = (process.env.ALLOW_ORIGIN || "*").trim() || "*";
  res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

const DEFAULT_UPSTREAM =
  "http://189.1.172.114:8080/api-evolution/loby/result.json";

const DEFAULT_MESA = "Immersive Roulette";

function makeBasicAuthHeader() {
  const u = String(process.env.BASIC_USER ?? "").trim();
  const p = String(process.env.BASIC_PASS ?? "").trim();

  if (!u || !p) return null;

  return `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`;
}

async function fetchUpstream(url) {
  const auth = makeBasicAuthHeader();

  const headers = {
    Accept: "application/json, text/plain, */*",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "User-Agent": "Mozilla/5.0"
  };

  if (auth) headers.Authorization = auth;

  const r = await fetch(url, {
    method: "GET",
    headers,
    redirect: "follow"
  });

  const text = await r.text();

  let json = null;

  try {
    json = JSON.parse(text);
  } catch {}

  return {
    status: r.status,
    text,
    json
  };
}

/* procura a mesa sem diferenciar maiúsculas/minúsculas */
function encontrarMesa(dados, nomeDesejado) {
  if (!dados || typeof dados !== "object") return null;

  const desejado = String(nomeDesejado || "")
    .trim()
    .toLowerCase();

  /* primeiro tenta nome exato */
  for (const [nome, resultados] of Object.entries(dados)) {
    if (nome.toLowerCase() === desejado) {
      return {
        nome,
        resultados
      };
    }
  }

  /* depois tenta nome parcial */
  for (const [nome, resultados] of Object.entries(dados)) {
    if (nome.toLowerCase().includes(desejado)) {
      return {
        nome,
        resultados
      };
    }
  }

  return null;
}

app.options("*", (req, res) => {
  setCors(req, res);
  res.status(204).send("");
});

/* diagnóstico */
app.get("/debug", async (req, res) => {
  setCors(req, res);

  const upstream =
    String(process.env.UPSTREAM || "").trim() ||
    DEFAULT_UPSTREAM;

  const mesa =
    String(process.env.ROULETTE_TABLE || "").trim() ||
    DEFAULT_MESA;

  try {
    const out = await fetchUpstream(upstream);

    if (out.status < 200 || out.status >= 300) {
      return res.status(502).json({
        ok: false,
        upstream_status: out.status,
        body_head: String(out.text || "").slice(0, 300)
      });
    }

    const encontrada = encontrarMesa(out.json, mesa);

    return res.json({
      ok: true,
      upstream_status: out.status,
      mesa_procurada: mesa,
      mesa_encontrada: encontrada?.nome || null,
      quantidade:
        Array.isArray(encontrada?.resultados)
          ? encontrada.resultados.length
          : 0,
      primeiros:
        Array.isArray(encontrada?.resultados)
          ? encontrada.resultados.slice(0, 10)
          : [],
      mesas_disponiveis:
        out.json && typeof out.json === "object"
          ? Object.keys(out.json)
          : []
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err)
    });
  }
});

/* ROBÔ */
app.get("/", async (req, res) => {
  setCors(req, res);

  const upstream =
    String(process.env.UPSTREAM || "").trim() ||
    DEFAULT_UPSTREAM;

  /*
    Mantém compatibilidade com seu GAS:
    ?slug=Roleta-Immersiva pode continuar existindo.
    Ele NÃO será usado para montar a URL da API.
  */
  const slug =
    String(req.query.slug || "").trim() ||
    "Roleta-Immersiva";

  const mesa =
    String(process.env.ROULETTE_TABLE || "").trim() ||
    DEFAULT_MESA;

  try {
    const out = await fetchUpstream(upstream);

    if (out.status < 200 || out.status >= 300) {
      return res.status(502).json({
        ok: false,
        status: 502,
        hint: `API retornou HTTP ${out.status}`,
        items: [],
        slug
      });
    }

    const encontrada = encontrarMesa(out.json, mesa);

    if (!encontrada) {
      return res.status(404).json({
        ok: false,
        status: 404,
        hint: `Mesa "${mesa}" não encontrada`,
        items: [],
        mesas_disponiveis:
          out.json && typeof out.json === "object"
            ? Object.keys(out.json)
            : [],
        slug
      });
    }

    const items =
      Array.isArray(encontrada.resultados)
        ? encontrada.resultados
        : [];

    return res.json({
      ok: true,
      items,
      table: encontrada.nome,
      source: upstream,
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

app.listen(port, () => {
  console.log(`Proxy on port ${port}`);
});
