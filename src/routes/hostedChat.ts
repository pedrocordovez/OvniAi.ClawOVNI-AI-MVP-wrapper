import type { FastifyInstance } from "fastify";

/**
 * Hosted Chat — public chat page for each tenant at /chat/:slug
 * No API key needed to view the page. The page uses a server-side
 * proxy endpoint so the tenant's API key is never exposed to the browser.
 */
export default async function hostedChatRoutes(app: FastifyInstance) {

  // POST /chat/:slug/message — proxy chat (no API key in browser)
  app.post<{ Params: { slug: string } }>("/chat/:slug/message", async (request, reply) => {
    const { slug } = request.params;
    const body = request.body as { messages: Array<{ role: string; content: string }> };

    if (!body.messages?.length) {
      return reply.status(400).send({ error: "messages required" });
    }

    // Find tenant and their API key
    const tenant = await app.pg.query(
      `SELECT t.id, t.anthropic_api_key, t.default_model, t.system_prompt, t.credit_balance_cents, t.suspended
       FROM tenants t WHERE t.slug = $1 AND t.active = true`,
      [slug],
    );

    if (!tenant.rowCount) return reply.status(404).send({ error: "not_found" });

    const t = tenant.rows[0];

    if (t.suspended || t.credit_balance_cents <= 0) {
      return reply.status(503).send({ error: "Este servicio no esta disponible en este momento." });
    }

    // Find an active API key for this tenant
    const keyResult = await app.pg.query(
      `SELECT key_hash FROM api_keys WHERE tenant_id = $1 AND active = true LIMIT 1`,
      [t.id],
    );

    if (!keyResult.rowCount) {
      return reply.status(503).send({ error: "Servicio no configurado." });
    }

    // Use internal chat - call the Anthropic API directly
    const { getAnthropicClient } = await import("../services/anthropic.js");
    const { calculateCost } = await import("../services/tokenCounter.js");
    const { recordUsage } = await import("../services/usageEmitter.js");
    const { deductUsageCredit, processAutoRecharge } = await import("../services/creditManager.js");

    const client = getAnthropicClient(t.id, t.anthropic_api_key);
    const startTime = Date.now();

    try {
      const response = await client.messages.create({
        model: t.default_model,
        max_tokens: 1024,
        system: t.system_prompt ?? undefined,
        messages: body.messages.slice(-20).map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      });

      const latencyMs = Date.now() - startTime;
      const cost = calculateCost(t.default_model, response.usage.input_tokens, response.usage.output_tokens);

      // Record usage
      recordUsage(app.pg, app.boss, {
        tenantId: t.id, userId: null, model: t.default_model,
        inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens,
        anthropicCost: cost.anthropicCost, billedCost: cost.billedCost,
        latencyMs, status: "success", channel: "webchat",
      }).catch(() => {});

      // Deduct credit
      const billedCents = Math.ceil(cost.billedCost * 100);
      deductUsageCredit(app.pg, t.id, billedCents, t.default_model,
        response.usage.input_tokens, response.usage.output_tokens,
      ).then(({ needsRecharge }) => {
        if (needsRecharge) processAutoRecharge(app.pg, t.id).catch(() => {});
      }).catch(() => {});

      const text = response.content
        .filter(b => b.type === "text")
        .map(b => b.type === "text" ? b.text : "")
        .join("");

      return { text };
    } catch (err) {
      app.log.error({ err, slug }, "Hosted chat error");
      return reply.status(502).send({ error: "No se pudo obtener respuesta." });
    }
  });

  // GET /chat/:slug — hosted chat HTML page
  app.get<{ Params: { slug: string } }>("/chat/:slug", async (request, reply) => {
    const { slug } = request.params;

    const tenant = await app.pg.query(
      `SELECT name, slug, system_prompt FROM tenants WHERE slug = $1 AND active = true`,
      [slug],
    );

    if (!tenant.rowCount) {
      return reply.status(404).send("Pagina no encontrada");
    }

    const t = tenant.rows[0];
    const agentName = t.name;

    reply.header("Content-Type", "text/html");
    return reply.send(chatPageHTML(agentName, slug));
  });
}

function chatPageHTML(agentName: string, slug: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chat — ${agentName}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:#fafafa;color:#111;height:100vh;display:flex;flex-direction:column}
.header{background:#fff;border-bottom:1px solid #e5e5e5;padding:16px 24px;display:flex;align-items:center;gap:12px}
.header .logo{width:28px;height:28px;background:#000;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:900}
.header h1{font-size:16px;font-weight:700}
.header .powered{font-size:11px;color:#aaa;margin-left:auto}
.messages{flex:1;overflow-y:auto;padding:24px;max-width:720px;width:100%;margin:0 auto}
.msg{margin-bottom:16px;display:flex}
.msg.user{justify-content:flex-end}
.msg .bubble{max-width:80%;padding:12px 16px;border-radius:16px;font-size:14px;line-height:1.6;white-space:pre-wrap}
.msg.assistant .bubble{background:#fff;border:1px solid #e5e5e5;border-bottom-left-radius:4px}
.msg.user .bubble{background:#000;color:#fff;border-bottom-right-radius:4px}
.typing{display:flex;gap:4px;padding:12px 16px;background:#fff;border:1px solid #e5e5e5;border-radius:16px;width:fit-content}
.typing span{width:6px;height:6px;background:#ccc;border-radius:50%;animation:bounce 1.4s infinite}
.typing span:nth-child(2){animation-delay:0.2s}
.typing span:nth-child(3){animation-delay:0.4s}
@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
.input-area{background:#fff;border-top:1px solid #e5e5e5;padding:16px 24px}
.input-row{max-width:720px;margin:0 auto;display:flex;gap:8px}
.input-row input{flex:1;border:1px solid #e5e5e5;border-radius:10px;padding:12px 16px;font-size:14px;outline:none;font-family:inherit}
.input-row input:focus{border-color:#999}
.input-row button{background:#000;color:#fff;border:none;border-radius:10px;padding:12px 24px;font-size:14px;font-weight:600;cursor:pointer}
.input-row button:hover{background:#333}
.input-row button:disabled{background:#ddd;cursor:not-allowed}
.welcome{text-align:center;padding:60px 24px}
.welcome h2{font-size:24px;font-weight:800;margin-bottom:8px}
.welcome p{color:#888;font-size:14px}
</style>
</head>
<body>
<div class="header">
  <span class="logo">O</span>
  <h1>${agentName}</h1>
  <span class="powered">Powered by OVNI AI</span>
</div>
<div class="messages" id="msgs">
  <div class="welcome">
    <h2>Hola!</h2>
    <p>Soy el asistente de ${agentName}. En que puedo ayudarte?</p>
  </div>
</div>
<div class="input-area">
  <div class="input-row">
    <input id="input" placeholder="Escribe tu mensaje..." autocomplete="off" />
    <button id="send">Enviar</button>
  </div>
</div>
<script>
var msgs=document.getElementById('msgs'),input=document.getElementById('input'),btn=document.getElementById('send');
var history=[],sending=false;

function addMsg(role,text){
  var welcome=document.querySelector('.welcome');
  if(welcome)welcome.remove();
  var d=document.createElement('div');d.className='msg '+role;
  d.innerHTML='<div class="bubble">'+escapeHtml(text)+'</div>';
  msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;return d;
}
function showTyping(){var d=document.createElement('div');d.className='msg assistant';d.id='typing';
  d.innerHTML='<div class="typing"><span></span><span></span><span></span></div>';
  msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;}
function hideTyping(){var t=document.getElementById('typing');if(t)t.remove();}
function escapeHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function send(){
  var text=input.value.trim();if(!text||sending)return;
  sending=true;btn.disabled=true;input.value='';
  addMsg('user',text);
  history.push({role:'user',content:text});
  showTyping();
  fetch('/chat/${slug}/message',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({messages:history.slice(-20)})})
  .then(function(r){return r.json()})
  .then(function(d){hideTyping();
    var reply=d.text||d.error||'Sin respuesta';
    addMsg('assistant',reply);history.push({role:'assistant',content:reply});})
  .catch(function(){hideTyping();addMsg('assistant','Error de conexion.');})
  .finally(function(){sending=false;btn.disabled=false;input.focus();});
}
btn.onclick=send;
input.onkeydown=function(e){if(e.key==='Enter')send();};
input.focus();
</script>
</body>
</html>`;
}
