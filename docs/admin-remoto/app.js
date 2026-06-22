const API_BASE = window.JETSON_API_BASE || "";
const APP_ID = "admin-remoto";
const SESSION_TOKEN_KEY = "agent_hub_session_token";
const DATA_KEY = "agent_hub_admin_remoto_state_v1";
const allowedCommands = ["uptime", "df -h", "free -h", "docker ps", "systemctl status cloudflared", "ps aux", "ss -tulpn"];
const serviceSeeds = [
    { id: "fastapi", name: "FastAPI", detail: "Backend principal /api" },
    { id: "cloudflared", name: "Cloudflare Tunnel", detail: "Entrada publica api.juanpablogc.com" },
    { id: "picoclaw", name: "PicoClaw", detail: "Orquestador y agentes" }
];
const defaultState = { incidents: [], audit: [], preferences: { view: "estado" }, lastHealth: null };
let sessionToken = localStorage.getItem(SESSION_TOKEN_KEY) || "";
let authenticated = false;
let state = loadLocalState();
let latestLogs = "";

function loadLocalState() {
    try { return { ...defaultState, ...JSON.parse(localStorage.getItem(DATA_KEY) || "{}") }; }
    catch (_) { return JSON.parse(JSON.stringify(defaultState)); }
}

async function apiFetch(path, options = {}) {
    if (!API_BASE) throw new Error("API no configurada");
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(sessionToken ? { "X-Session-Token": sessionToken } : {}),
            ...(options.headers || {})
        },
        credentials: "include"
    });
    if (!response.ok) {
        const error = new Error(response.status === 404 ? "pendiente de backend" : "error de API");
        error.status = response.status;
        throw error;
    }
    return response.json();
}

async function handleLogin(event) {
    event.preventDefault();
    const error = document.getElementById("login-error");
    error.classList.add("hidden");
    try {
        const result = await apiFetch("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({
                username: document.getElementById("login-user").value.trim(),
                password: document.getElementById("login-pass").value
            })
        });
        sessionToken = result.session_token || result.token || "";
        if (sessionToken) localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
        authenticated = true;
        document.getElementById("login-overlay").classList.add("hidden");
        await loadState();
        await refreshAll();
    } catch (err) {
        error.textContent = err.status === 401 ? "Credenciales incorrectas." : `No se pudo conectar con Jetson (${API_BASE || "sin URL"}).`;
        error.classList.remove("hidden");
    }
}

async function checkSession() {
    if (!sessionToken) return;
    try {
        const status = await apiFetch("/api/auth/status");
        if (status.authenticated) {
            authenticated = true;
            document.getElementById("login-overlay").classList.add("hidden");
            await loadState();
            await refreshAll();
        }
    } catch (_) {
        authenticated = false;
    }
}

async function logout() {
    try { await apiFetch("/api/auth/logout", { method: "POST", body: "{}" }); } catch (_) { }
    sessionToken = "";
    authenticated = false;
    localStorage.removeItem(SESSION_TOKEN_KEY);
    document.getElementById("login-pass").value = "";
    document.getElementById("login-overlay").classList.remove("hidden");
}

async function loadState() {
    state = loadLocalState();
    try {
        const remote = await apiFetch(`/api/state/${APP_ID}`);
        if (remote.state) state = { ...defaultState, ...remote.state };
        localStorage.setItem(DATA_KEY, JSON.stringify(state));
    } catch (_) {
        setApiStatus("Estado local", false);
    }
    renderAudit();
}

async function saveState() {
    localStorage.setItem(DATA_KEY, JSON.stringify(state));
    if (!authenticated) return;
    try { await apiFetch(`/api/state/${APP_ID}`, { method: "PUT", body: JSON.stringify({ state }) }); }
    catch (_) { setApiStatus("Guardado local", false); }
}

async function refreshAll() {
    await refreshHealth();
    await probeAdminHealth();
    renderServices();
    renderCommands();
    renderAudit();
}

async function refreshHealth() {
    try {
        const health = await apiFetch("/api/health");
        state.lastHealth = { ...health, checked_at: new Date().toISOString() };
        document.getElementById("metric-api").textContent = health.status === "ok" ? "OK" : "Revisar";
        document.getElementById("metric-api-detail").textContent = `DB: ${health.database || "no reportada"}`;
        document.getElementById("metric-ai").textContent = health.openrouter_configured ? "Configurado" : "Sin llave";
        document.getElementById("metric-model").textContent = health.model || "Modelo no reportado";
        document.getElementById("metric-updated").textContent = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
        document.getElementById("health-output").textContent = JSON.stringify(safeHealth(health), null, 2);
        setApiStatus("Jetson conectada", true);
        await saveState();
    } catch (err) {
        setApiStatus("API no disponible", false);
        document.getElementById("metric-api").textContent = "Error";
        document.getElementById("health-output").textContent = `No se pudo leer /api/health: ${err.message}`;
    }
}

async function probeAdminHealth() {
    try {
        const data = await apiFetch("/api/admin/health");
        document.getElementById("metric-admin").textContent = data.status || "OK";
        document.getElementById("metric-admin").className = "mt-3 text-2xl font-black text-emerald-200";
    } catch (_) {
        document.getElementById("metric-admin").textContent = "Pendiente";
        document.getElementById("metric-admin").className = "mt-3 text-2xl font-black text-amber-200";
    }
}

function safeHealth(health) {
    return {
        status: health.status,
        openrouter_configured: Boolean(health.openrouter_configured),
        model: health.model || null,
        database_reported: Boolean(health.database)
    };
}

function renderServices() {
    const root = document.getElementById("services-grid");
    root.innerHTML = serviceSeeds.map(service => `
        <article class="glass rounded-2xl p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">${escapeHtml(service.id)}</p>
              <h3 class="mt-2 text-xl font-black text-white">${escapeHtml(service.name)}</h3>
              <p class="mt-2 text-sm leading-6 text-slate-400">${escapeHtml(service.detail)}</p>
            </div>
            <span class="rounded-full border border-amber-800 bg-amber-950/50 px-3 py-1 text-xs font-bold text-amber-200">pendiente</span>
          </div>
          <div class="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <button class="rounded-xl border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 hover:border-blue-400" onclick="checkService('${service.id}')">Revisar</button>
            <button class="rounded-xl border border-red-900/70 px-3 py-2 text-sm font-bold text-red-200 hover:border-red-400" onclick="restartService('${service.id}')">Reinicio guiado</button>
          </div>
        </article>
      `).join("");
}

function renderCommands() {
    document.getElementById("command-list").innerHTML = allowedCommands.map(cmd => `
        <button class="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-slate-200 hover:border-emerald-400" onclick="runSafeCommand('${escapeAttr(cmd)}')">${escapeHtml(cmd)}</button>
      `).join("");
}

async function checkService(serviceId) {
    try {
        const data = await apiFetch(`/api/admin/services`);
        logAudit("Servicios", `Revision ${serviceId}`, "OK");
        toast("Servicios recibidos");
        console.info(data);
    } catch (err) {
        logAudit("Servicios", `Revision ${serviceId}`, "pendiente de backend");
        toast("Endpoint /api/admin/services pendiente de backend");
    }
}

async function restartService(serviceId) {
    if (!confirm(`Confirmar solicitud de reinicio guiado para ${serviceId}. No se ejecutara si el backend no existe.`)) return;
    try {
        await apiFetch(`/api/admin/services/${serviceId}/restart`, { method: "POST", body: JSON.stringify({ confirm: true }) });
        logAudit("Servicios", `Restart ${serviceId}`, "Solicitado");
        toast("Solicitud enviada");
    } catch (_) {
        logAudit("Servicios", `Restart ${serviceId}`, "pendiente de backend");
        toast("Reinicio pendiente de backend");
    }
}

async function sendPicoClaw() {
    const prompt = document.getElementById("picoclaw-prompt").value.trim();
    if (!prompt) return toast("Escribe un mensaje");
    setOutput("picoclaw-output", "Enviando a /api/admin/picoclaw/message...");
    try {
        const data = await apiFetch("/api/admin/picoclaw/message", { method: "POST", body: JSON.stringify({ prompt, app_id: APP_ID }) });
        setOutput("picoclaw-output", data.response || data.message || JSON.stringify(data, null, 2));
        logAudit("PicoClaw", "Mensaje enviado", "OK");
    } catch (_) {
        setOutput("picoclaw-output", "pendiente de backend: /api/admin/picoclaw/message");
        logAudit("PicoClaw", "Mensaje enviado", "pendiente de backend");
    }
}

let adminSessionId = sessionStorage.getItem('admin_chat_session');
if (!adminSessionId) {
    adminSessionId = 'admin_web_' + Math.random().toString(36).substring(2, 11);
    sessionStorage.setItem('admin_chat_session', adminSessionId);
}

async function askAI() {
    const prompt = document.getElementById("picoclaw-prompt").value.trim();
    if (!prompt) return toast("Escribe un mensaje");
    setOutput("picoclaw-output", "Consultando /api/orchestrator/chat bajo demanda...");
    try {
        const data = await apiFetch("/api/orchestrator/chat", {
            method: "POST",
            body: JSON.stringify({
                prompt,
                app_id: "admin-remoto",
                session_id: adminSessionId
            })
        });
        setOutput("picoclaw-output", data.text || data.response || data.message || "");
        logAudit("IA", "Fallback admin", "OK");
    } catch (err) {
        setOutput("picoclaw-output", `Error IA: ${err.message}`);
    }
}

async function runSafeCommand(command) {
    if (!allowedCommands.includes(command)) return;
    const out = document.getElementById("terminal-output");
    out.textContent = `jetson:~$ ${command}\nEsperando backend seguro...`;
    try {
        const data = await apiFetch("/api/admin/terminal/run", { method: "POST", body: JSON.stringify({ command }) });
        out.textContent = `jetson:~$ ${command}\n${data.output || data.summary || JSON.stringify(data, null, 2)}`;
        logAudit("Terminal", command, "OK");
    } catch (_) {
        out.textContent = `jetson:~$ ${command}\npendiente de backend: /api/admin/terminal/run\nNo se ejecuto ningun comando desde el navegador.`;
        logAudit("Terminal", command, "pendiente de backend");
    }
}

async function fetchLogs() {
    const service = document.getElementById("log-service").value;
    const out = document.getElementById("log-output");
    out.textContent = `Cargando logs sanitizados de ${service}...`;
    try {
        const data = await apiFetch(`/api/admin/logs/${service}`);
        latestLogs = data.logs || data.summary || JSON.stringify(data, null, 2);
        out.textContent = latestLogs;
        logAudit("Logs", service, "OK");
    } catch (_) {
        latestLogs = `pendiente de backend: /api/admin/logs/${service}\nLos logs reales deben venir sanitizados y limitados desde FastAPI.`;
        out.textContent = latestLogs;
        logAudit("Logs", service, "pendiente de backend");
    }
}

async function analyzeLogs() {
    const content = latestLogs || document.getElementById("log-output").textContent;
    if (!content || content.includes("Selecciona un servicio")) return toast("Carga logs primero");
    document.getElementById("log-output").textContent = `${content}\n\n[IA] Analizando bajo demanda...`;
    try {
        const data = await apiFetch("/api/orchestrator/chat", {
            method: "POST",
            body: JSON.stringify({
                prompt: `Analiza estos logs o estado pendiente sin inventar datos. Si el backend esta pendiente, dilo claro:\n\n${content}`,
                app_id: "admin-remoto",
                session_id: adminSessionId
            })
        });
        document.getElementById("log-output").textContent = `${content}\n\nAnalisis IA:\n${data.text || data.response || data.message || ""}`;
        logAudit("IA Logs", "Analisis", "OK");
    } catch (err) {
        document.getElementById("log-output").textContent = `${content}\n\nError IA: ${err.message}`;
    }
}

async function requestBackup() {
    if (!confirm("Solicitar respaldo seguro. El backend debe excluir secretos. Continuar?")) return;
    try {
        const data = await apiFetch("/api/admin/backups", { method: "POST", body: JSON.stringify({ safe: true }) });
        document.getElementById("backup-output").textContent = data.summary || JSON.stringify(data, null, 2);
        logAudit("Backups", "Solicitud", "OK");
    } catch (_) {
        document.getElementById("backup-output").textContent = "pendiente de backend: /api/admin/backups";
        logAudit("Backups", "Solicitud", "pendiente de backend");
    }
}

async function loadAdminAudit() {
    try {
        const data = await apiFetch("/api/admin/audit");
        toast("Auditoria backend recibida");
        logAudit("Auditoria", "Consulta backend", "OK");
        console.info(data);
    } catch (_) {
        toast("Auditoria backend pendiente");
        logAudit("Auditoria", "Consulta backend", "pendiente de backend");
    }
}

async function diagnoseWithAI() {
    const healthText = document.getElementById("health-output").textContent;
    document.getElementById("health-output").textContent = `${healthText}\n\n[IA] Diagnosticando...`;
    try {
        const data = await apiFetch("/api/orchestrator/chat", {
            method: "POST",
            body: JSON.stringify({
                prompt: `Diagnostica este estado del Agent Hub sin inventar metricas:\n${healthText}`,
                app_id: "admin-remoto",
                session_id: adminSessionId
            })
        });
        document.getElementById("health-output").textContent = `${healthText}\n\nDiagnostico IA:\n${data.text || data.response || data.message || ""}`;
        logAudit("IA", "Diagnostico estado", "OK");
    } catch (err) {
        document.getElementById("health-output").textContent = `${healthText}\n\nError IA: ${err.message}`;
    }
}

function saveIncident() {
    const text = document.getElementById("incident-text").value.trim();
    if (!text) return toast("Escribe un incidente");
    state.incidents.unshift({ id: crypto.randomUUID(), text, created_at: new Date().toISOString(), status: "abierto" });
    document.getElementById("incident-text").value = "";
    logAudit("Incidente", text.slice(0, 42), "Guardado");
    saveState();
    toast("Incidente guardado");
}

function logAudit(module, action, result) {
    state.audit = state.audit || [];
    state.audit.unshift({ id: crypto.randomUUID(), module, action, result, created_at: new Date().toISOString() });
    state.audit = state.audit.slice(0, 60);
    renderAudit();
    saveState();
}

function renderAudit() {
    const audit = state.audit || [];
    const incidents = state.incidents || [];
    document.getElementById("audit-list").innerHTML = [
        ...incidents.slice(0, 4).map(item => ({ module: "Incidente", action: item.text, result: item.status, created_at: item.created_at })),
        ...audit.slice(0, 12)
    ].map(item => `
        <div class="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p class="font-bold text-white">${escapeHtml(item.module)}</p>
            <span class="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">${new Date(item.created_at).toLocaleString("es-MX")}</span>
          </div>
          <p class="mt-2 text-sm text-slate-300">${escapeHtml(item.action)}</p>
          <p class="mt-1 text-xs font-bold text-blue-300">${escapeHtml(item.result)}</p>
        </div>
      `).join("") || '<p class="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">Sin auditoria local todavia.</p>';
}

function setApiStatus(text, ok) {
    document.getElementById("api-status").textContent = text;
    document.getElementById("api-status").className = `text-sm font-bold ${ok ? "text-emerald-300" : "text-amber-200"}`;
    document.getElementById("status-dot").className = `h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400"}`;
}

function switchView(viewId) {
    document.querySelectorAll(".view").forEach(view => view.classList.toggle("active", view.id === `view-${viewId}`));
    document.querySelectorAll(".nav").forEach(btn => btn.classList.toggle("active", btn.dataset.view === viewId));
    const titles = { estado: "Estado", servicios: "Servicios", picoclaw: "PicoClaw", terminal: "Terminal Segura", logs: "Logs", backups: "Backups", auditoria: "Auditoria" };
    document.getElementById("view-title").textContent = titles[viewId] || "Admin Remoto";
    state.preferences = { ...(state.preferences || {}), view: viewId };
    saveState();
    toggleMenu(false);
}

function toggleMenu(open) {
    document.getElementById("sidebar").classList.toggle("-translate-x-full", !open);
    document.getElementById("mobile-shade").classList.toggle("hidden", !open);
}

function toast(message) {
    const box = document.getElementById("toast");
    box.textContent = message;
    box.classList.remove("hidden");
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => box.classList.add("hidden"), 2600);
}

function setOutput(id, text) {
    document.getElementById(id).textContent = text || "";
}

function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
}

function escapeAttr(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

document.querySelectorAll(".nav").forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));
renderServices();
renderCommands();
renderAudit();
checkSession();