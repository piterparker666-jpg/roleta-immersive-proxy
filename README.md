# roleta-immersive-proxy

Proxy simples (Node) para puxar a API da **Roleta Immersiva** com Basic Auth e devolver num formato estável pro teu GAS/painel.

## Endpoints
- `/` → retorna JSON `{ ok, items, ... }`
- `/health` → healthcheck

## Environment Variables (Render)
Obrigatórias:
- `UPSTREAM` = URL completa do JSON da mesa (ex.: `http://189.1.172.114:8080/api-evolution/Immersiva-Roulette/result.json`)

Se tiver Basic Auth no upstream:
- `BASIC_USER`
- `BASIC_PASS`

CORS:
- `ALLOW_ORIGIN` (default `*`)

## Retorno
- Se upstream retorna array: `[15, 7, 23, ...]`
- Se upstream retorna objeto: `{ "items": [ ... ] }`

O proxy normaliza para `items` como números `0..36`.
