import type { FastifyInstance } from "fastify";

/**
 * Web Chat routes:
 * - GET /webchat/widget.js — embeddable chat widget script
 * - POST /webchat/message — send message (uses tenant API key from widget config)
 */
export default async function webchatRoutes(app: FastifyInstance) {

  // ── Widget JS — embeddable script for client websites ──────
  app.get("/webchat/widget.js", async (_request, reply) => {
    reply.header("Content-Type", "application/javascript");
    reply.header("Cache-Control", "public, max-age=3600");
    return reply.send(WIDGET_SCRIPT);
  });
}

const WIDGET_SCRIPT = `
(function() {
  'use strict';
  if (window.__ovniChatLoaded) return;
  window.__ovniChatLoaded = true;

  var cfg = window.OvniChat || {};
  var apiKey = cfg.apiKey || '';
  var apiUrl = cfg.apiUrl || 'https://new.ovni.ai';
  var title = cfg.title || 'Chat con IA';
  var subtitle = cfg.subtitle || 'Powered by OVNI AI';
  var color = cfg.color || '#6C5CE7';
  var position = cfg.position || 'right';
  var greeting = cfg.greeting || 'Hola! En que te puedo ayudar?';

  if (!apiKey) { console.error('OvniChat: apiKey is required'); return; }

  // ── Styles ──────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = \`
    #ovni-chat-fab { position:fixed; bottom:20px; \${position}:20px; width:60px; height:60px;
      border-radius:50%; background:\${color}; color:#fff; border:none; cursor:pointer;
      box-shadow:0 4px 12px rgba(0,0,0,0.3); z-index:99999; font-size:24px;
      display:flex; align-items:center; justify-content:center; transition:transform 0.2s; }
    #ovni-chat-fab:hover { transform:scale(1.1); }
    #ovni-chat-window { position:fixed; bottom:90px; \${position}:20px; width:380px; max-height:520px;
      background:#0f0b1e; border:1px solid #2a2545; border-radius:16px; z-index:99999;
      display:none; flex-direction:column; overflow:hidden;
      box-shadow:0 8px 32px rgba(0,0,0,0.5); font-family:-apple-system,system-ui,sans-serif; }
    #ovni-chat-window.open { display:flex; }
    .ovni-header { padding:16px; background:linear-gradient(135deg,#0f0b1e,#1a1535);
      border-bottom:1px solid #2a2545; }
    .ovni-header h3 { margin:0; color:#fff; font-size:16px; }
    .ovni-header p { margin:4px 0 0; color:#8b83a8; font-size:12px; }
    .ovni-messages { flex:1; overflow-y:auto; padding:16px; min-height:300px; }
    .ovni-msg { margin-bottom:12px; max-width:85%; }
    .ovni-msg.user { margin-left:auto; }
    .ovni-msg .bubble { padding:10px 14px; border-radius:12px; font-size:14px;
      line-height:1.5; word-wrap:break-word; }
    .ovni-msg.assistant .bubble { background:#1e1a30; color:#e0dced; border-bottom-left-radius:4px; }
    .ovni-msg.user .bubble { background:\${color}; color:#fff; border-bottom-right-radius:4px; }
    .ovni-msg .time { font-size:10px; color:#5a5478; margin-top:4px;
      text-align:right; }
    .ovni-input-row { display:flex; padding:12px; border-top:1px solid #2a2545;
      background:#141028; }
    .ovni-input-row input { flex:1; background:#1e1a30; border:1px solid #2a2545;
      border-radius:8px; padding:10px 14px; color:#e0dced; font-size:14px;
      outline:none; }
    .ovni-input-row input::placeholder { color:#5a5478; }
    .ovni-input-row input:focus { border-color:\${color}; }
    .ovni-input-row button { margin-left:8px; background:\${color}; color:#fff;
      border:none; border-radius:8px; padding:10px 16px; cursor:pointer;
      font-size:14px; font-weight:600; }
    .ovni-input-row button:disabled { opacity:0.5; cursor:not-allowed; }
    .ovni-typing { display:flex; gap:4px; padding:10px 14px; }
    .ovni-typing span { width:6px; height:6px; background:#5a5478; border-radius:50%;
      animation:ovniBounce 1.4s infinite; }
    .ovni-typing span:nth-child(2) { animation-delay:0.2s; }
    .ovni-typing span:nth-child(3) { animation-delay:0.4s; }
    @keyframes ovniBounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
    @media(max-width:480px) {
      #ovni-chat-window { width:calc(100vw - 24px); bottom:84px;
        \${position}:12px; max-height:70vh; }
    }
  \`;
  document.head.appendChild(style);

  // ── DOM ─────────────────────────────────────────────────
  var fab = document.createElement('button');
  fab.id = 'ovni-chat-fab';
  fab.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
  document.body.appendChild(fab);

  var win = document.createElement('div');
  win.id = 'ovni-chat-window';
  win.innerHTML = '<div class="ovni-header"><h3>' + title + '</h3><p>' + subtitle + '</p></div>'
    + '<div class="ovni-messages" id="ovni-msgs"></div>'
    + '<div class="ovni-input-row"><input id="ovni-input" placeholder="Escribe tu mensaje..." />'
    + '<button id="ovni-send">Enviar</button></div>';
  document.body.appendChild(win);

  var msgs = document.getElementById('ovni-msgs');
  var input = document.getElementById('ovni-input');
  var sendBtn = document.getElementById('ovni-send');
  var history = [];
  var sending = false;

  // Show greeting
  addMessage('assistant', greeting);

  fab.onclick = function() {
    win.classList.toggle('open');
    if (win.classList.contains('open')) input.focus();
  };

  sendBtn.onclick = send;
  input.onkeydown = function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  function addMessage(role, text) {
    var d = document.createElement('div');
    d.className = 'ovni-msg ' + role;
    var now = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    d.innerHTML = '<div class="bubble">' + escapeHtml(text) + '</div><div class="time">' + now + '</div>';
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  function showTyping() {
    var d = document.createElement('div');
    d.className = 'ovni-msg assistant';
    d.id = 'ovni-typing';
    d.innerHTML = '<div class="ovni-typing"><span></span><span></span><span></span></div>';
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function hideTyping() {
    var t = document.getElementById('ovni-typing');
    if (t) t.remove();
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function send() {
    var text = input.value.trim();
    if (!text || sending) return;
    sending = true;
    sendBtn.disabled = true;
    input.value = '';

    addMessage('user', text);
    history.push({ role: 'user', content: text });
    showTyping();

    fetch(apiUrl + '/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ messages: history.slice(-20), stream: false })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      hideTyping();
      var reply = data.content && data.content[0] ? data.content[0].text : 'Sin respuesta';
      addMessage('assistant', reply);
      history.push({ role: 'assistant', content: reply });
    })
    .catch(function(err) {
      hideTyping();
      addMessage('assistant', 'Error de conexion. Intenta de nuevo.');
      console.error('OvniChat error:', err);
    })
    .finally(function() {
      sending = false;
      sendBtn.disabled = false;
      input.focus();
    });
  }
})();
`;
