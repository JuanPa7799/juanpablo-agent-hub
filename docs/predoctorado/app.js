// --- CONFIGURACIÓN API JETSON ---
const API_BASE = window.JETSON_API_BASE || "";
const APP_ID = "predoctorado";
const AUTH_KEY = 'phd_is_logged_in';
const SESSION_TOKEN_KEY = 'agent_hub_session_token';

// --- SISTEMA DE MEMORIA (LOCALSTORAGE) ---
const DATA_KEY = 'phd_workspace_data';

const defaultState = {
    xp: 0,
    plan: [
        { id: "s1", semana: "Semana 1: Estructura Base", dias: [{ id: "d1", dia: "Miércoles", tarea: "Planteamiento del Problema.", completada: false }, { id: "d2", dia: "Jueves", tarea: "Justificación.", completada: false }, { id: "d3", dia: "Viernes", tarea: "Objetivos e Hipótesis.", completada: false }, { id: "d4", dia: "Domingo", tarea: "Antecedentes.", completada: false }] },
        { id: "s2", semana: "Semana 2: Estado del Arte", dias: [{ id: "d5", dia: "Miércoles", tarea: "Marco Teórico.", completada: false }, { id: "d6", dia: "Jueves", tarea: "Tabla Comparativa.", completada: false }, { id: "d7", dia: "Viernes", tarea: "Narrativa del Gap.", completada: false }, { id: "d8", dia: "Domingo", tarea: "Citas IEEE.", completada: false }] },
        { id: "s3", semana: "Semana 3: Metodología", dias: [{ id: "d9", dia: "Miércoles", tarea: "Fase 1 y 2.", completada: false }, { id: "d10", dia: "Jueves", tarea: "Fase 3 y 4.", completada: false }, { id: "d11", dia: "Viernes", tarea: "Diagrama de Bloques.", completada: false }, { id: "d12", dia: "Domingo", tarea: "Verificación Cruzada.", completada: false }] }
    ],
    checklistState: {},
    textos: {},
    tareas: [],
    bitacoraActual: "",
    historialBitacoras: []
};

const plantillaEstructura = [
    { id: "intro", titulo: "1. Introducción", placeholder: "Explica cómo cambia la red, las nuevas perturbaciones y tu solución..." },
    { id: "antecedentes", titulo: "2. Antecedentes", placeholder: "Logros de la maestría (BeagleBone, Wavelet) y el puente al doctorado..." },
    { id: "marco", titulo: "3. Marco Teórico", placeholder: "Conceptos sobre PQD múltiples, Edge Computing..." },
    { id: "estado", titulo: "4. Estado del Arte", placeholder: "Discusión de papers recientes. Destaca hardware en borde..." },
    { id: "problema", titulo: "5. Planteamiento del Problema", placeholder: "La falta de métodos precisos y ligeros en entornos reales..." },
    { id: "justificacion", titulo: "6. Justificación", placeholder: "Impacto tecnológico y económico..." },
    { id: "hipotesis", titulo: "7. Hipótesis", placeholder: "Mediante IA optimizada en SBC es posible..." },
    { id: "objetivos", titulo: "8. Objetivos", placeholder: "Objetivo General y Específicos..." },
    { id: "metodologia", titulo: "9. Metodología", placeholder: "Fases 1 a 4..." }
];

const checklistEstructura = [
    "1. Problema Abordado: ¿Qué tipo de perturbaciones (PQD) analiza?",
    "2. Origen de Datos: ¿Usa señales sintéticas o reales de campo?",
    "3. Técnica IA: ¿Usa enfoques tradicionales o Deep Learning optimizado?",
    "4. Hardware: ¿Se ejecuta en PC o en Edge/SBC?",
    "5. Métricas: ¿Reportan latencia, memoria y consumo?",
    "6. Brecha: ¿Mencionan limitaciones que tu doctorado resolverá?"
];

let estado = null;

// --- SISTEMA DE LOGIN ---
async function apiFetch(path, options = {}) {
    const sessionToken = sessionStorage.getItem(SESSION_TOKEN_KEY) || localStorage.getItem(SESSION_TOKEN_KEY);
    let response;
    try {
        response = await fetch(`${API_BASE}${path}`, {
            credentials: 'include',
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(sessionToken ? { 'X-Session-Token': sessionToken } : {}),
                ...(options.headers || {})
            }
        });
    } catch (networkError) {
        networkError.isNetworkError = true;
        throw networkError;
    }
    if (!response.ok) {
        const text = await response.text();
        let detail = text;
        try {
            const parsed = JSON.parse(text);
            detail = parsed.detail || parsed.message || text;
        } catch (_) { }
        const error = new Error(detail || `HTTP ${response.status}`);
        error.status = response.status;
        throw error;
    }
    return response.json();
}

function loginErrorMessage(error) {
    if (error?.isNetworkError || error instanceof TypeError) {
        return `No se puede conectar con la API Jetson (${API_BASE || 'misma URL'}). Revisa que Cloudflare este activo o espera a que GitHub Pages actualice la URL.`;
    }
    if (error?.status === 401) {
        return 'Credenciales incorrectas. Revisa usuario y contrasena.';
    }
    if (error?.status) {
        return `La API respondio con error ${error.status}. Intenta de nuevo en un momento.`;
    }
    return 'No se pudo iniciar sesion. Intenta de nuevo.';
}

async function checkLoginStatus() {
    const overlay = document.getElementById('login-overlay');

    let authenticated = sessionStorage.getItem(AUTH_KEY) === 'true';
    try {
        const status = await apiFetch('/api/auth/status');
        authenticated = authenticated || status.authenticated;
    } catch (e) {
        authenticated = false;
    }

    if (authenticated) {
        sessionStorage.setItem(AUTH_KEY, 'true');
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.classList.add('hidden');
            initApp();
        }, 500);
    } else {
        sessionStorage.removeItem(AUTH_KEY);
        overlay.classList.remove('hidden');
        overlay.style.opacity = '1';
        aplicarTemaPrevio();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('login-user').value;
    const p = document.getElementById('login-pass').value;
    const errorDiv = document.getElementById('login-error');

    try {
        const loginResult = await apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username: u, password: p })
        });
        if (loginResult.session_token) {
            sessionStorage.setItem(SESSION_TOKEN_KEY, loginResult.session_token);
            localStorage.setItem(SESSION_TOKEN_KEY, loginResult.session_token);
        }
        sessionStorage.setItem(AUTH_KEY, 'true');
        errorDiv.classList.add('hidden');
        checkLoginStatus();
    } catch (e) {
        errorDiv.textContent = loginErrorMessage(e);
        errorDiv.classList.remove('hidden');
    }
}

async function logout() {
    try { await apiFetch('/api/auth/logout', { method: 'POST', body: '{}' }); } catch (e) { }
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_TOKEN_KEY);
    location.reload();
}

function aplicarTemaPrevio() {
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        document.getElementById('theme-text').innerText = 'Modo Claro';
        document.getElementById('theme-icon').className = 'ph-fill ph-sun text-xl text-yellow-400';
    } else {
        document.documentElement.classList.remove('dark');
    }
}

// --- INICIALIZACIÓN DE APP PRINCIPAL ---
async function cargarEstadoRemoto() {
    try {
        const data = await apiFetch(`/api/state/${APP_ID}`);
        if (data.state) {
            estado = { ...JSON.parse(JSON.stringify(defaultState)), ...data.state };
            localStorage.setItem(DATA_KEY, JSON.stringify(estado));
        }
    } catch (e) {
        alertMensaje("Modo local: API no disponible para cargar memoria.");
    }
}

async function initApp() {
    const savedData = localStorage.getItem(DATA_KEY);
    if (savedData) {
        try {
            estado = JSON.parse(savedData);
        } catch (e) {
            estado = JSON.parse(JSON.stringify(defaultState));
        }
    } else {
        estado = JSON.parse(JSON.stringify(defaultState));
    }

    await cargarEstadoRemoto();
    aplicarTemaPrevio();

    document.getElementById('fecha-bitacora').innerText = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const bInput = document.getElementById('bitacora-input');
    if (estado.bitacoraActual) bInput.value = estado.bitacoraActual;

    bInput.addEventListener('input', () => {
        estado.bitacoraActual = bInput.value;
        triggerSave();
    });

    document.getElementById('chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('chat-submit').click(); }
    });

    actualizarXPUI();
    renderTodos();
}

let saveTimeout;
let remoteSaveTimeout;
function triggerSave() {
    if (!estado) return; // Por si acaso se dispara antes del login
    const status = document.getElementById('save-status');
    status.style.opacity = '1';
    clearTimeout(saveTimeout);
    clearTimeout(remoteSaveTimeout);

    localStorage.setItem(DATA_KEY, JSON.stringify(estado));
    remoteSaveTimeout = setTimeout(async () => {
        try {
            await apiFetch(`/api/state/${APP_ID}`, {
                method: 'PUT',
                body: JSON.stringify({ state: estado })
            });
        } catch (e) {
            console.warn('No se pudo guardar en Jetson API; se conserva localStorage.', e);
        }
    }, 600);

    saveTimeout = setTimeout(() => {
        status.style.opacity = '0';
    }, 1000);
}

function ganarXP(cantidad) {
    estado.xp += cantidad;
    actualizarXPUI();
    triggerSave();

    const xpText = document.getElementById('user-xp');
    xpText.classList.remove('xp-gain');
    void xpText.offsetWidth;
    xpText.classList.add('xp-gain');
}

function actualizarXPUI() {
    const nivel = Math.floor(estado.xp / 100) + 1;
    const xpActual = estado.xp % 100;

    document.getElementById('user-level').innerText = nivel;
    document.getElementById('user-xp').innerText = `${xpActual}/100 XP`;
    document.getElementById('xp-bar').style.width = `${xpActual}%`;
}

// --- RENDERIZADORES ---
function renderTodos() {
    renderPlan();
    renderChecklist();
    renderPlantilla();
    renderTasks();
    renderHistorialBitacoras();
}

function renderPlan() {
    const container = document.getElementById('plan-container');
    container.innerHTML = estado.plan.map((sem, sIndex) => `
                <div class="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div class="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                        <h3 class="font-bold text-slate-800 dark:text-slate-200">${sem.semana}</h3>
                    </div>
                    <div class="divide-y divide-slate-100 dark:divide-slate-700">
                        ${sem.dias.map((dia, dIndex) => `
                            <label class="flex items-start gap-4 p-5 hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors group">
                                <input type="checkbox" onchange="togglePlan('${sIndex}', '${dIndex}')" ${dia.completada ? 'checked' : ''} class="mt-1 w-5 h-5 text-blue-600 rounded border-slate-300 dark:border-slate-600 focus:ring-blue-500 bg-transparent">
                                <div>
                                    <span class="block font-bold ${dia.completada ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-200'} text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">${dia.dia}</span>
                                    <span class="block ${dia.completada ? 'text-slate-300' : 'text-slate-600 dark:text-slate-400'} text-sm mt-1 leading-relaxed">${dia.tarea}</span>
                                </div>
                            </label>
                        `).join('')}
                    </div>
                </div>
            `).join('');
}

function togglePlan(sIdx, dIdx) {
    estado.plan[sIdx].dias[dIdx].completada = !estado.plan[sIdx].dias[dIdx].completada;
    if (estado.plan[sIdx].dias[dIdx].completada) ganarXP(5);
    triggerSave();
    renderPlan();
}

function renderChecklist() {
    const container = document.getElementById('checklist-container');
    container.innerHTML = checklistEstructura.map((item, idx) => `
                <label class="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-600 transition-all">
                    <input type="checkbox" onchange="toggleChecklist('${idx}')" ${estado.checklistState[idx] ? 'checked' : ''} class="mt-1 w-4 h-4 text-purple-600 rounded border-slate-300 dark:border-slate-600 focus:ring-purple-500 bg-transparent">
                    <span class="text-slate-700 dark:text-slate-300 font-medium text-xs leading-relaxed pt-0.5">${item}</span>
                </label>
            `).join('');
}

function toggleChecklist(idx) {
    estado.checklistState[idx] = !estado.checklistState[idx];
    triggerSave();
}

function renderPlantilla() {
    const container = document.getElementById('plantilla-container');
    container.innerHTML = plantillaEstructura.map(sec => `
                <div class="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 transition-all focus-within:shadow-md focus-within:border-blue-400 dark:focus-within:border-blue-500 relative group">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-bold text-slate-800 dark:text-slate-200">${sec.titulo}</h3>
                        <button onclick="aiPulirSeccion('${sec.id}')" id="btn-pulir-${sec.id}" class="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1 opacity-0 group-hover:opacity-100">
                            <i class="ph-fill ph-sparkle"></i> ✨ Pulir Redacción
                        </button>
                    </div>
                    <textarea 
                        id="input-${sec.id}"
                        class="w-full h-40 p-5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:bg-slate-800 transition-colors resize-y text-sm text-slate-700 dark:text-slate-300 leading-relaxed outline-none"
                        placeholder="${sec.placeholder}"
                        oninput="guardarTexto('${sec.id}', this.value)"
                    >${estado.textos[sec.id] || ''}</textarea>
                </div>
            `).join('');
}

function guardarTexto(id, valor) {
    estado.textos[id] = valor;
    triggerSave();
}

// --- PRODUCTIVIDAD: TAREAS ---
function renderTasks() {
    const container = document.getElementById('tasks-container');
    const dashContainer = document.getElementById('dashboard-tasks');

    const tasksHtml = estado.tareas.length === 0
        ? `<div class="text-center text-slate-400 py-8 text-sm"><i class="ph-fill ph-check-circle text-4xl mb-3 opacity-50"></i><br>Sin tareas. ¡Planea tu día!</div>`
        : estado.tareas.map(t => `
                    <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-700 group hover:border-blue-200 dark:hover:border-blue-800 transition-all">
                        <label class="flex items-center gap-3 cursor-pointer flex-1">
                            <input type="checkbox" ${t.completada ? 'checked' : ''} onchange="toggleTask(${t.id})" class="w-5 h-5 text-blue-600 rounded border-slate-300 dark:border-slate-600 focus:ring-blue-500 bg-transparent">
                            <span class="text-sm font-medium ${t.completada ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-700 dark:text-slate-300'} transition-all">${t.text}</span>
                        </label>
                        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button onclick="aiDesglosarTarea(${t.id})" class="text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 p-1" title="✨ Desglosar con IA">
                                <i class="ph-fill ph-sparkle"></i>
                            </button>
                            <button onclick="deleteTask(${t.id})" class="text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 p-1" title="Eliminar">
                                <i class="ph-bold ph-trash"></i>
                            </button>
                        </div>
                    </div>
                `).join('');

    container.innerHTML = tasksHtml;

    // Dashboard
    const pendingTasks = estado.tareas.filter(t => !t.completada).slice(0, 3);
    if (pendingTasks.length > 0) {
        dashContainer.innerHTML = pendingTasks.map(t => `
                    <div class="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                        <input type="checkbox" onchange="toggleTask(${t.id})" class="w-5 h-5 text-blue-600 rounded border-slate-300 dark:border-slate-600 focus:ring-blue-500 bg-transparent">
                        <span class="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">${t.text}</span>
                    </div>
                `).join('');
    } else {
        dashContainer.innerHTML = `<div class="p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-xl text-sm font-medium text-center border border-blue-100 dark:border-blue-800/30">Día libre de pendientes.</div>`;
    }
}

function addTask(e) {
    e.preventDefault();
    const input = document.getElementById('task-input');
    const text = input.value.trim();
    if (text) {
        estado.tareas.push({ id: Date.now(), text, completada: false });
        input.value = '';
        triggerSave();
        renderTasks();
    }
}

function toggleTask(id) {
    const task = estado.tareas.find(t => t.id === id);
    if (task) {
        task.completada = !task.completada;
        if (task.completada) {
            ganarXP(10);
            alertMensaje("¡Tarea completada! +10 XP");
        }
        triggerSave();
        renderTasks();
    }
}

function deleteTask(id) {
    estado.tareas = estado.tareas.filter(t => t.id !== id);
    triggerSave();
    renderTasks();
}

// --- PRODUCTIVIDAD: POMODORO ---
let pomodoro = { time: 25 * 60, initialTime: 25 * 60, interval: null, running: false };

function updateTimerDisplay() {
    const m = Math.floor(pomodoro.time / 60).toString().padStart(2, '0');
    const s = (pomodoro.time % 60).toString().padStart(2, '0');
    document.getElementById('timer-display').innerText = `${m}:${s}`;

    const progress = ((pomodoro.initialTime - pomodoro.time) / pomodoro.initialTime) * 100;
    document.getElementById('pomodoro-progress').style.width = `${progress}%`;
}

function startTimer() {
    if (pomodoro.running) return;
    pomodoro.running = true;
    document.getElementById('btn-start-timer').classList.add('animate-pulse');
    pomodoro.interval = setInterval(() => {
        if (pomodoro.time > 0) {
            pomodoro.time--;
            updateTimerDisplay();
        } else {
            pauseTimer();
            if (pomodoro.initialTime > 5 * 60) {
                ganarXP(25);
                alertMensaje("¡Sesión completada! +25 XP");
            } else {
                alertMensaje("Descanso terminado. ¡A trabajar!");
            }
        }
    }, 1000);
}

function pauseTimer() {
    pomodoro.running = false;
    clearInterval(pomodoro.interval);
    document.getElementById('btn-start-timer').classList.remove('animate-pulse');
}

function resetTimer() {
    pauseTimer();
    pomodoro.time = pomodoro.initialTime;
    updateTimerDisplay();
}

function setTimerMode(mins) {
    pauseTimer();
    pomodoro.initialTime = mins * 60;
    pomodoro.time = pomodoro.initialTime;
    updateTimerDisplay();
}

// --- BITÁCORA Y ARCHIVO HISTÓRICO ---
function renderHistorialBitacoras() {
    const container = document.getElementById('historial-bitacoras');
    if (!estado.historialBitacoras || estado.historialBitacoras.length === 0) {
        container.innerHTML = `<p class="text-sm text-slate-400 text-center py-4">No hay entradas guardadas en el archivo histórico.</p>`;
        return;
    }

    const reversed = [...estado.historialBitacoras].reverse();
    container.innerHTML = reversed.map((b, index) => `
                <div onclick="abrirModalHistorial(${estado.historialBitacoras.length - 1 - index})" class="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer transition-colors group">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:underline">${b.fecha}</span>
                        <i class="ph-bold ph-caret-right text-slate-300 group-hover:text-blue-500"></i>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">${b.contenido}</p>
                </div>
            `).join('');
}

async function guardarEntradaBitacora() {
    const input = document.getElementById('bitacora-input');
    const texto = input.value.trim();
    if (!texto) {
        alertMensaje("La bitácora actual está vacía.");
        return;
    }

    const hoyStr = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

    try {
        await apiFetch('/api/bitacora', {
            method: 'POST',
            body: JSON.stringify({ fecha: hoyStr, contenido: texto })
        });
    } catch (e) {
        console.warn('No se pudo guardar bitácora en SQLite; se conservará en localStorage.', e);
    }

    estado.historialBitacoras.push({
        fecha: hoyStr,
        contenido: texto
    });

    estado.bitacoraActual = "";
    input.value = "";

    ganarXP(15);
    triggerSave();
    renderHistorialBitacoras();
    alertMensaje("¡Entrada archivada! +15 XP");
}

function abrirModalHistorial(index) {
    const entrada = estado.historialBitacoras[index];
    document.getElementById('modal-fecha').innerText = entrada.fecha;
    document.getElementById('modal-contenido').innerText = entrada.contenido;

    const modal = document.getElementById('modal-historial');
    const box = document.getElementById('modal-content-box');

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
    }, 10);
}

function cerrarModal() {
    const modal = document.getElementById('modal-historial');
    const box = document.getElementById('modal-content-box');

    modal.classList.add('opacity-0');
    box.classList.add('scale-95');

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

// --- SISTEMA DE THEME (Modo Oscuro) ---
function toggleTheme() {
    const htmlTag = document.documentElement;
    const themeText = document.getElementById('theme-text');
    const themeIcon = document.getElementById('theme-icon');

    if (htmlTag.classList.contains('dark')) {
        htmlTag.classList.remove('dark');
        localStorage.theme = 'light';
        themeText.innerText = 'Modo Oscuro';
        themeIcon.className = 'ph-fill ph-moon text-xl text-slate-600';
    } else {
        htmlTag.classList.add('dark');
        localStorage.theme = 'dark';
        themeText.innerText = 'Modo Claro';
        themeIcon.className = 'ph-fill ph-sun text-xl text-yellow-400';
    }
}

// --- SISTEMA DE PESTAÑAS (TABS) ---
function switchTab(tabId) {
    const tabNames = { 'inicio': 'Panel de Inicio', 'plan': 'Plan de Trabajo', 'checklist': 'Análisis de Papers', 'plantilla': 'Editor de Protocolo', 'productividad': 'Enfoque & Tareas', 'bitacora': 'Archivo & Bitácora' };

    ['inicio', 'plan', 'checklist', 'plantilla', 'productividad', 'bitacora'].forEach(id => {
        const btn = document.getElementById(`btn-${id}`);
        if (id === tabId) {
            btn.className = "nav-btn flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left font-medium transition-all bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 text-blue-700 dark:text-blue-300 shadow-sm";
        } else {
            btn.className = "nav-btn flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left font-medium transition-all hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300";
        }
    });

    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    document.getElementById('current-tab-title').innerText = tabNames[tabId];
    const mobileSelect = document.getElementById('mobile-tab-select');
    if (mobileSelect && mobileSelect.value !== tabId) mobileSelect.value = tabId;
    toggleMobileMenu(false);
}

function toggleMobileMenu(open) {
    const sidebar = document.getElementById('mobile-sidebar');
    const overlay = document.getElementById('mobile-menu-overlay');
    if (!sidebar || !overlay) return;
    if (!open && window.innerWidth >= 1024) {
        sidebar.style.transform = '';
        sidebar.style.translate = '';
        overlay.classList.add('hidden');
        return;
    }
    sidebar.classList.toggle('-translate-x-full', !open);
    sidebar.style.transform = open ? 'translateX(0)' : 'translateX(-100%)';
    sidebar.style.translate = open ? '0' : '-100%';
    overlay.classList.toggle('hidden', !open);
}

document.querySelectorAll('[data-mobile-menu-open]').forEach(btn => btn.addEventListener('click', () => toggleMobileMenu(true)));
document.querySelectorAll('[data-mobile-menu-close]').forEach(btn => btn.addEventListener('click', () => toggleMobileMenu(false)));

// --- ASISTENTE COLAPSABLE ---
let assistantOpen = false;
function toggleAssistant() {
    const sidebar = document.getElementById('ai-sidebar');
    assistantOpen = !assistantOpen;
    if (assistantOpen) {
        sidebar.classList.remove('translate-x-full');
    } else {
        sidebar.classList.add('translate-x-full');
    }
}

// --- EXPORTAR ---
function copiarPlantilla() {
    let contenido = "# PROPUESTA DE TEMA DE TESIS DE DOCTORADO\n\n";
    plantillaEstructura.forEach(sec => {
        contenido += `## ${sec.titulo}\n\n${estado.textos[sec.id] || "..."}\n\n`;
    });
    const temp = document.createElement("textarea");
    temp.value = contenido;
    document.body.appendChild(temp);
    temp.select();
    try { document.execCommand('copy'); alertMensaje("Documento copiado al portapapeles"); }
    catch (err) { alertMensaje("Error al copiar."); }
    document.body.removeChild(temp);
}

function alertMensaje(msg) {
    const alertBox = document.getElementById('custom-alert');
    document.getElementById('alert-text').innerText = msg;
    alertBox.classList.remove('opacity-0', 'pointer-events-none');
    setTimeout(() => { alertBox.classList.add('opacity-0', 'pointer-events-none'); }, 3000);
}

// --- SISTEMA IA (JETSON API + OPENROUTER SERVER-SIDE) ---
const systemPrompt = `Eres el asistente experto de Juan Pablo García Chávez para su doctorado ITM. Eres pragmático, evitas formalismos y saludos largos. Ayudas con PQD complejas, Wavelet, y Edge Computing (SBC). Si pide redactar, proporciona texto limpio sin markdown complejo. Responde siempre en español, usa sistema métrico, cita en IEEE si es necesario.`;

// Gestión automática y persistente del hilo de conversación
let predocSessionId = sessionStorage.getItem('predoctorado_chat_session');
if (!predocSessionId) {
    predocSessionId = 'predoc_web_' + Math.random().toString(36).substring(2, 11);
    sessionStorage.setItem('predoctorado_chat_session', predocSessionId);
}

async function callJetsonAI(prompt, isJson = false) {
    const delays = [1000, 2000, 4000, 8000, 16000];
    const payload = { prompt, app_id: 'predoctorado', session_id: predocSessionId };

    for (let i = 0; i < 5; i++) {
        try {
            const data = await apiFetch('/api/orchestrator/chat', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            return data.text;
        } catch (e) {
            if (i === 4) throw e;
            await new Promise(r => setTimeout(r, delays[i]));
        }
    }
}

async function handleChatSubmit(e) {
    e.preventDefault();
    const inputEl = document.getElementById('chat-input');
    const submitBtn = document.getElementById('chat-submit');
    const userText = inputEl.value.trim();
    if (!userText) return;

    if (!assistantOpen) toggleAssistant();

    appendMessage(userText, 'user');
    inputEl.value = '';
    submitBtn.disabled = true;

    const loadingId = appendLoading();
    try {
        const responseText = await callJetsonAI(userText);
        removeElement(loadingId);
        appendMessage(responseText, 'bot');
    } catch (error) {
        removeElement(loadingId);
        appendMessage("Error de conexión. Reintenta.", 'error');
    } finally {
        submitBtn.disabled = false;
        inputEl.focus();
    }
}

// --- NUEVAS HERRAMIENTAS LLM ---
async function aiAnalizarAbstract() {
    const input = document.getElementById('abstract-input');
    const resultDiv = document.getElementById('abstract-result');
    const btn = document.getElementById('btn-analizar-abstract');

    if (!input.value.trim()) {
        alertMensaje("Por favor, pega un texto primero.");
        return;
    }

    btn.innerHTML = '<div class="spinner"></div> Analizando...';
    btn.disabled = true;
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = '<span class="animate-pulse">Consultando a la Jetson...</span>';

    try {
        const prompt = `Analiza el siguiente abstract científico de acuerdo con mis intereses de doctorado (PQD múltiples/complejas, Edge Computing, SBC, Señales Reales). Evalúa punto por punto y dime si me sirve para el estado del arte. Sé conciso y directo.\n\nAbstract: ${input.value}`;
        const respuesta = await callJetsonAI(prompt);
        resultDiv.innerHTML = escapeHtml(respuesta);
    } catch (e) {
        resultDiv.innerHTML = '<span class="text-red-400">Error al analizar el texto.</span>';
    } finally {
        btn.innerHTML = '✨ Analizar Artículo';
        btn.disabled = false;
    }
}

async function aiPulirSeccion(secId) {
    const textarea = document.getElementById(`input-${secId}`);
    const btn = document.getElementById(`btn-pulir-${secId}`);

    if (!textarea.value.trim()) {
        alertMensaje("Escribe un borrador primero para poder pulirlo.");
        return;
    }

    const originalText = btn.innerHTML;
    btn.innerHTML = '<div class="spinner border-indigo-600 border-t-transparent w-4 h-4"></div>';
    btn.disabled = true;

    try {
        const prompt = `Reescribe el siguiente texto para un protocolo de ingreso al doctorado (Tema: PQD y Edge Computing). Mejora la redacción académica, usa vocabulario formal de ingeniería y asegura cohesión en tercera persona o formato impersonal. Solo devuelve el texto mejorado, sin introducciones.\n\nTexto original:\n${textarea.value}`;
        const respuesta = await callJetsonAI(prompt);

        textarea.value = respuesta;
        guardarTexto(secId, respuesta);
        alertMensaje("¡Redacción mejorada con éxito!");
    } catch (e) {
        alertMensaje("Error al contactar con la IA.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function aiDesglosarTarea(taskId) {
    const taskIndex = estado.tareas.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;
    const task = estado.tareas[taskIndex];

    alertMensaje("✨ Desglosando tarea con IA...");

    try {
        const prompt = `Desglosa la siguiente tarea de mi protocolo de doctorado en 3 sub-tareas muy breves (máx 10 palabras cada una) y accionables. Tarea original: "${task.text}"`;
        const jsonStr = await callJetsonAI(prompt, true); // Retorna Array JSON puro
        const subtareas = JSON.parse(jsonStr);

        estado.tareas.splice(taskIndex, 1);
        subtareas.forEach((st, i) => {
            estado.tareas.splice(taskIndex + i, 0, { id: Date.now() + i, text: st, completada: false });
        });

        triggerSave();
        renderTasks();
        alertMensaje("¡Tarea desglosada!");
    } catch (e) {
        alertMensaje("Error al desglosar la tarea.");
    }
}

async function aiPlanearDia() {
    if (!assistantOpen) toggleAssistant();
    appendMessage("Sugiere 3 tareas de investigación para hoy.", 'user');
    const loadingId = appendLoading();
    try {
        const prompt = `Sugiere 3 tareas concisas que deba realizar hoy sobre mi propuesta de PQD en Edge Computing. Formato: lista simple sin saludos.`;
        const respuesta = await callJetsonAI(prompt);
        removeElement(loadingId);
        appendMessage(`Enfoque sugerido:\n${respuesta}`, 'bot');
    } catch (e) {
        removeElement(loadingId);
        appendMessage("Error al procesar la solicitud.", "error");
    }
}

async function aiRedactarBitacora() {
    const input = document.getElementById('bitacora-input');
    const notasManuales = input.value;
    const tareasCompletadas = estado.tareas.filter(t => t.completada).map(t => t.text);

    if (tareasCompletadas.length === 0 && !notasManuales) {
        alertMensaje("Marca alguna tarea como completada o añade notas base.");
        return;
    }

    if (!assistantOpen) toggleAssistant();
    appendMessage("Genera reporte de bitácora diario.", 'user');
    const loadingId = appendLoading();

    try {
        const prompt = `Redacta una entrada de bitácora académica en primera persona para hoy. Tareas: ${tareasCompletadas.length > 0 ? tareasCompletadas.join(', ') : 'Ninguna marcada'}. Apuntes: ${notasManuales || 'Ninguno'}. Máximo 2 párrafos formales. Sin rodeos.`;
        const respuesta = await callJetsonAI(prompt);
        removeElement(loadingId);

        input.value = respuesta;
        estado.bitacoraActual = respuesta;
        triggerSave();

        appendMessage("Bitácora generada en el editor. Recuerda hacer clic en 'Guardar en Archivo' para conservarla.", 'bot');
        switchTab('bitacora');
        alertMensaje("Bitácora redactada");
    } catch (e) {
        removeElement(loadingId);
        appendMessage("Error al redactar.", "error");
    }
}

function appendMessage(text, sender) {
    const container = document.getElementById('chat-messages');
    const isUser = sender === 'user';
    const html = isUser ? `
                <div class="flex gap-3 flex-row-reverse">
                    <div class="w-8 h-8 rounded-full bg-slate-800 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 text-white shadow-sm mt-1 text-xs font-bold">JP</div>
                    <div class="bg-blue-600 text-white p-4 rounded-2xl rounded-tr-none shadow-sm text-sm whitespace-pre-wrap">${escapeHtml(text)}</div>
                </div>` : `
                <div class="flex gap-3">
                    <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0 text-white shadow-sm mt-1"><i class="ph-bold ${sender === 'error' ? 'ph-warning' : 'ph-robot'}"></i></div>
                    <div class="bg-white dark:bg-slate-800 border ${sender === 'error' ? 'border-red-200 dark:border-red-800 text-red-600' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'} p-4 rounded-2xl rounded-tl-none shadow-sm text-sm whitespace-pre-wrap leading-relaxed">${escapeHtml(text)}</div>
                </div>`;
    container.insertAdjacentHTML('beforeend', html);
    container.scrollTop = container.scrollHeight;
}

function appendLoading() {
    const id = 'loading-' + Date.now();
    document.getElementById('chat-messages').insertAdjacentHTML('beforeend', `
                <div id="${id}" class="flex gap-3">
                    <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0 text-white shadow-sm mt-1"><i class="ph-bold ph-robot animate-pulse"></i></div>
                    <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1">
                        <div class="w-2 h-2 bg-slate-300 dark:bg-slate-600 rounded-full animate-bounce"></div>
                        <div class="w-2 h-2 bg-slate-300 dark:bg-slate-600 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                        <div class="w-2 h-2 bg-slate-300 dark:bg-slate-600 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                    </div>
                </div>`);
    return id;
}

function removeElement(id) { const el = document.getElementById(id); if (el) el.remove(); }
function clearChat() { document.getElementById('chat-messages').innerHTML = ''; appendMessage('Historial de sesión borrado. Memoria local sigue intacta.', 'bot'); }
function escapeHtml(unsafe) { return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

// --- INICIO DE APLICACIÓN ---
window.onload = () => {
    // Verificar si debe mostrar el login o la app
    checkLoginStatus();
};