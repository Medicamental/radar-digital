// Porteiro dos sites da Medicamental (2026-10-29): e-mail @medicamental.com.br + codigo do dia.
// Mesma conta do Radar Devolucoes: codigo = HMAC-SHA256(RADAR_SEGREDO, "codigo:AAAA-MM-DD"),
// entao o codigo do dia e o mesmo em todos os sites (sai nos e-mails das 8h).
// O segredo fica como secret do worker (wrangler secret put RADAR_SEGREDO), nunca no codigo.
// Uso: import app from "./app.mjs"; export default comPortao(app, "Radar SAP");
//      sem app (so arquivos estaticos): export default comPortao(null, "Radar Comercial");

const ALFA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const COOKIE = "md_portao";
const SEG = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow, noarchive",
  "referrer-policy": "no-referrer", "x-frame-options": "DENY", "x-content-type-options": "nosniff" };

function hoje() { return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); }
async function hmac(segredo, msg) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}
async function codigoDoDia(segredo) { const d = await hmac(segredo, "codigo:" + hoje()); let c = ""; for (let i = 0; i < 8; i++) c += ALFA[d[i] % 32]; return c; }
// mesma sessao do Radar Devolucoes ("sessao:" + dia) -- os robos da VM calculam o cookie com codigo_acesso.py
async function sessaoDoDia(segredo) { return Array.from(await hmac(segredo, "sessao:" + hoje())).map(b => b.toString(16).padStart(2, "0")).join(""); }
function igual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
function fimDoDia() { return new Date(hoje() + "T23:59:59-03:00").toUTCString(); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function destinoSeguro(v) { return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : "/"; }

function telaLogin(nome, erro, volta) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><title>${esc(nome)} — Acesso</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#08090d;--surface:#12141c;--line:#23262f;--text:#eef0f4;--dim:#8b8f9c;--accent:#4d8dff;--glow:rgba(77,141,255,.35);--danger:hsl(356 78% 66%)}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;color:var(--text);font:14px/1.5 Inter,system-ui,sans-serif;
background:radial-gradient(1400px 700px at 10% -15%,#0d3a4a70,transparent 60%),radial-gradient(1100px 600px at 85% -10%,#16234f60,transparent 60%),var(--bg)}
.box{width:100%;max-width:380px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:32px 28px;box-shadow:0 24px 60px -16px rgba(0,0,0,.7)}
.selo{width:56px;height:56px;margin:0 auto 14px;border-radius:14px;display:grid;place-items:center;background:hsl(219 100% 65% / .14);border:1px solid rgba(77,141,255,.45);box-shadow:0 0 22px -6px var(--glow)}
h1{font-family:'Space Grotesk',sans-serif;font-size:20px;text-align:center;margin:0}
p.s{color:var(--dim);text-align:center;margin:6px 0 24px;font-size:13px}
label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);margin:14px 0 6px}
input{width:100%;height:42px;border-radius:10px;border:1px solid #2f3543;background:#171a24;color:var(--text);padding:0 12px;font:inherit;outline:none}
input:focus{border-color:var(--accent);box-shadow:0 0 0 4px hsl(219 100% 65% / .14)}
#codigo{font-family:ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase;font-size:16px}
button{width:100%;height:42px;margin-top:20px;border-radius:10px;border:1px solid rgba(77,141,255,.55);background:hsl(219 100% 65% / .16);color:#8fb6ff;font:600 14px Inter,sans-serif;cursor:pointer}
button:hover{background:hsl(219 100% 65% / .24);box-shadow:0 0 18px -4px var(--glow)}
.err{background:hsl(356 78% 66% / .12);color:var(--danger);border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:6px}
.dica{color:var(--dim);font-size:12px;text-align:center;margin-top:18px}
</style></head><body><form class="box" method="post" action="/__acesso">
<div class="selo"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#8fb6ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div>
<h1>${esc(nome)}</h1><p class="s">Acesso restrito a colaboradores Medicamental</p>
${erro ? `<div class="err">${esc(erro)}</div>` : ""}
<input type="hidden" name="volta" value="${esc(volta)}">
<label for="email">E-mail corporativo</label><input id="email" name="email" type="email" placeholder="nome.sobrenome@medicamental.com.br" required autocomplete="email">
<label for="codigo">Código de acesso do dia</label><input id="codigo" name="codigo" placeholder="XXXX-XXXX" required autocomplete="off" maxlength="9">
<button type="submit">Entrar</button>
<p class="dica">O código do dia está nos e-mails dos radares enviados às 8h.</p>
</form></body></html>`;
}

export function comPortao(app, nome) {
  return {
    ...(app || {}),
    async fetch(req, env, ctx) {
      const url = new URL(req.url);
      if (!env.RADAR_SEGREDO) return new Response("Configuração pendente", { status: 503 });
      if (url.pathname === "/__sair") return new Response(null, { status: 302, headers: { location: "/", "set-cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
      if (url.pathname === "/__acesso" && req.method === "POST") {
        const f = await req.formData();
        const email = String(f.get("email") || "").trim().toLowerCase();
        const cod = String(f.get("codigo") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const volta = destinoSeguro(String(f.get("volta") || "/"));
        if (!/^[a-z0-9._-]+@medicamental\.com\.br$/.test(email)) return new Response(telaLogin(nome, "Use o seu e-mail @medicamental.com.br.", volta), { status: 401, headers: SEG });
        if (!igual(cod, await codigoDoDia(env.RADAR_SEGREDO))) return new Response(telaLogin(nome, "Código inválido ou de outro dia. Use o código do e-mail de hoje.", volta), { status: 401, headers: SEG });
        return new Response(null, { status: 303, headers: { location: volta, "set-cookie": `${COOKIE}=${await sessaoDoDia(env.RADAR_SEGREDO)}; Path=/; Expires=${fimDoDia()}; HttpOnly; Secure; SameSite=Lax` } });
      }
      const ck = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]+)`));
      if (ck && igual(ck[1], await sessaoDoDia(env.RADAR_SEGREDO))) {
        if (app && app.fetch) return app.fetch(req, env, ctx);
        return env.ASSETS.fetch(req);
      }
      return new Response(telaLogin(nome, "", url.pathname + url.search), { status: 401, headers: SEG });
    },
  };
}
