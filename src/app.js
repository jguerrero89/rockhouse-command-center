const ROLES = [
  { id: "money", label: "Money & Wealth", short: "MW", color: "#c8a96e", bg: "#181307", description: "Income, stewardship, investing, business ownership, cash flow, sales production, systems, and long term wealth." },
  { id: "health", label: "Health & Strength", short: "HS", color: "#c86e8e", bg: "#17080f", description: "Strength, rehab, endurance, nutrition, sleep, body composition, resilience, and longevity." },
  { id: "family", label: "Family & Relationships", short: "FR", color: "#6ec88a", bg: "#07140f", description: "Marriage, parenting, emotional regulation, family systems, quality time, and household leadership." },
  { id: "spiritual", label: "Spiritual & Personal Growth", short: "SP", color: "#8b95d6", bg: "#090b18", description: "Prayer, scripture, character, emotional maturity, discipline, identity, purpose, and leadership." },
  { id: "legacy", label: "Legacy & Influence", short: "LI", color: "#6eb5c8", bg: "#071418", description: "Content, music, teaching, mentoring, community, personal brand, impact, and inheritable systems." },
  { id: "home", label: "Home Updates & Environment", short: "HE", color: "#c8846e", bg: "#170d08", description: "Renovations, organization, backyard vision, cleaning systems, design, maintenance, and peace at home." },
];

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_LABELS = { urgent: "NOW", high: "TODAY", medium: "SOON", low: "LATER" };
const PRIORITY_COLORS = { urgent: "#ff5555", high: "#c8a96e", medium: "#6eb5c8", low: "#6d7480" };
const STORAGE_KEY = "rockhouse.command-center.v5";
const API_BASE = window.location.protocol === "file:" ? null : window.location.pathname.replace(/\/[^/]*$/, "") || "";

const DEFAULT_STATE = {
  activeRole: "all",
  view: "focus",
  focusId: null,
  timerSec: 0,
  timerTotal: 0,
  timerRunning: false,
  alarmActive: false,
  alarmTitle: "",
  alarmMessage: "",
  snoozedUntil: null,
  notificationsEnabled: false,
  alertedKeys: [],
  connected: {
    calendar: "demo",
    notion: "demo",
    alarms: true,
    automations: "draft",
  },
  syncStatus: "idle",
  syncError: "",
  tasks: [
    { id: 3, role: "money", source: "Notion", text: "Review today's lead generation and sales production targets", priority: "high", done: false, minutes: 20, due: "09:15", action: "Draft money pillar execution list" },
    { id: 4, role: "health", source: "Notion", text: "Block strength, knee/back/core rehab, and recovery window", priority: "medium", done: false, minutes: 30, due: "15:00", action: "Create health block plan" },
    { id: 5, role: "family", source: "Notion", text: "Choose one concrete connection move for Tanya and the kids", priority: "medium", done: false, minutes: 15, due: "17:30", action: "Draft family leadership move" },
    { id: 6, role: "spiritual", source: "Notion", text: "Prayer, scripture, and character check-in", priority: "medium", done: false, minutes: 20, due: "18:00", action: "Open devotional reflection" },
    { id: 7, role: "legacy", source: "Notion", text: "Capture one lesson from today's listing walk-through", priority: "low", done: false, minutes: 20, due: "18:30", action: "Build legacy content outline" },
    { id: 8, role: "home", source: "Notion", text: "Pick the next small home update that creates peace and function", priority: "low", done: false, minutes: 15, due: "19:00", action: "Draft home environment next step" },
  ],
  events: [],
  automations: [],
};

const app = document.querySelector("#app");
let state = loadState();
let audioCtx = null;
let timerHandle = null;
let alarmHandle = null;
let alertHandle = null;
let lastMinuteTick = 0;
let syncStarted = false;

function loadState() {
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setState(patch) {
  state = { ...state, ...patch };
  saveState();
  render();
  syncTimer();
  syncAlerts();
}

async function syncExternalData() {
  if (!API_BASE) return;

  state = { ...state, syncStatus: "syncing", syncError: "" };
  saveState();

  const next = {
    events: state.events,
    tasks: state.tasks,
    connected: { ...state.connected },
    syncStatus: "synced",
    syncError: "",
  };

  const [calendarResult, notionResult] = await Promise.allSettled([
    fetch(`${API_BASE}/api/calendar/today`, { credentials: "same-origin" }).then((res) => {
      if (!res.ok) throw new Error(`Calendar API returned ${res.status}`);
      return res.json();
    }),
    fetch(`${API_BASE}/api/notion/tasks`).then((res) => {
      if (!res.ok) throw new Error(`Notion API returned ${res.status}`);
      return res.json();
    }),
  ]);

  if (calendarResult.status === "fulfilled") {
    next.events = calendarResult.value.events || next.events;
    next.connected.calendar = calendarResult.value.status || "connected";
  } else {
    next.connected.calendar = "demo";
    next.syncStatus = "error";
    next.syncError = calendarResult.reason?.message || "Calendar API did not respond.";
  }

  if (notionResult.status === "fulfilled") {
    next.tasks = notionResult.value.tasks || next.tasks;
    next.connected.notion = notionResult.value.status || "connected";
  } else {
    next.connected.notion = "demo";
    next.syncStatus = "error";
    next.syncError = [next.syncError, notionResult.reason?.message || "Notion API did not respond."].filter(Boolean).join(" ");
  }

  setState(next);
}

function role(id) {
  return ROLES.find((item) => item.id === id);
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function toMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function dueLabel(minutesUntil) {
  if (minutesUntil === 0) return "now";
  if (minutesUntil === 1) return "in 1 minute";
  return `in ${minutesUntil} minutes`;
}

function notifyLive(title, body) {
  alarmSound();
  if (state.notificationsEnabled && "Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

function triggerLiveAlert(key, title, message, focusId = null) {
  if (state.alertedKeys.includes(key)) return;
  state = {
    ...state,
    focusId: focusId || state.focusId,
    alarmActive: true,
    alarmTitle: title,
    alarmMessage: message,
    alertedKeys: [...state.alertedKeys, key].slice(-80),
  };
  saveState();
  notifyLive(title, message);
  render();
  syncTimer();
}

function checkLiveAlerts() {
  const current = nowMinutes();
  const alertWindows = [15, 5, 0];

  state.events.forEach((event) => {
    const minutesUntil = toMinutes(event.start) - current;
    if (!alertWindows.includes(minutesUntil)) return;
    triggerLiveAlert(
      `event:${event.id}:${minutesUntil}`,
      minutesUntil === 0 ? "Calendar block starts now" : "Calendar block coming up",
      `${event.title} starts ${dueLabel(minutesUntil)} (${event.start}-${event.end}).`
    );
  });

  sortedTasks().forEach((task) => {
    const minutesUntil = toMinutes(task.due) - current;
    if (!alertWindows.includes(minutesUntil)) return;
    triggerLiveAlert(
      `task:${task.id}:${minutesUntil}`,
      minutesUntil === 0 ? "Do this now" : "Next task coming up",
      `${task.text} is due ${dueLabel(minutesUntil)}.`,
      task.id
    );
  });
}

function syncAlerts() {
  clearInterval(alertHandle);
  if (!state.connected.alarms) return;
  alertHandle = setInterval(checkLiveAlerts, 30000);
}

function sortedTasks() {
  const current = nowMinutes();
  return state.tasks
    .filter((task) => !task.done)
    .filter((task) => state.activeRole === "all" || task.role === state.activeRole)
    .sort((a, b) => {
      const dueA = Math.max(0, toMinutes(a.due) - current);
      const dueB = Math.max(0, toMinutes(b.due) - current);
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || dueA - dueB || a.minutes - b.minutes;
    });
}

function getFocusTask() {
  return state.tasks.find((task) => task.id === state.focusId) || null;
}

function fmtSeconds(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function beep(freq = 880, dur = 0.15, vol = 0.3, type = "sine") {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = freq;
    osc.type = type;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch {
    // Browser audio can be blocked until the first user gesture.
  }
}

function alarmSound() {
  [0, 180, 360, 540].forEach((delay) => setTimeout(() => beep(660, 0.12, 0.4, "square"), delay));
}

function doneSound() {
  beep(440, 0.1, 0.3);
  setTimeout(() => beep(660, 0.15, 0.3), 120);
  setTimeout(() => beep(880, 0.25, 0.3), 240);
}

function syncTimer() {
  clearInterval(timerHandle);
  clearInterval(alarmHandle);
  if (state.timerRunning) {
    timerHandle = setInterval(() => {
      const next = Math.max(0, state.timerSec - 1);
      if (Date.now() - lastMinuteTick > 60000) {
        beep(1200, 0.03, 0.08, "square");
        lastMinuteTick = Date.now();
      }
      if (next === 0) {
        state = { ...state, timerSec: 0, timerRunning: false, alarmActive: true };
        saveState();
        alarmSound();
        render();
        syncTimer();
      } else {
        state = { ...state, timerSec: next };
        saveState();
        renderTimerOnly();
      }
    }, 1000);
  }
  if (state.alarmActive) {
    alarmHandle = setInterval(alarmSound, 3000);
  }
}

function startFocus(id) {
  const task = state.tasks.find((item) => item.id === id);
  setState({
    focusId: id,
    timerSec: task.minutes * 60,
    timerTotal: task.minutes * 60,
    timerRunning: true,
    alarmActive: false,
    view: "focus",
  });
}

function completeTask(id) {
  doneSound();
  setState({
    tasks: state.tasks.map((task) => (task.id === id ? { ...task, done: true } : task)),
    focusId: state.focusId === id ? null : state.focusId,
    timerRunning: state.focusId === id ? false : state.timerRunning,
    alarmActive: state.focusId === id ? false : state.alarmActive,
  });
}

function pushDown(id) {
  setState({
    tasks: state.tasks.map((task) => (task.id === id ? { ...task, priority: "low" } : task)),
  });
}

function snooze(minutes) {
  const until = new Date(Date.now() + minutes * 60000);
  setState({
    alarmActive: false,
    timerSec: minutes * 60,
    timerTotal: minutes * 60,
    timerRunning: true,
    snoozedUntil: until.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  });
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    setState({ notificationsEnabled: false });
    return;
  }

  const permission = await Notification.requestPermission();
  setState({ notificationsEnabled: permission === "granted" });
}

function addTask(form) {
  const data = new FormData(form);
  const text = String(data.get("text") || "").trim();
  if (!text) return;
  setState({
    tasks: [
      ...state.tasks,
      {
        id: Date.now(),
        role: data.get("role"),
        source: "Manual",
        text,
        priority: data.get("priority"),
        done: false,
        minutes: Number(data.get("minutes")),
        due: data.get("due"),
        action: "Draft next step",
      },
    ],
  });
}

function runAutomation(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (API_BASE) {
    fetch(`${API_BASE}/api/automations/${taskId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task }),
    }).catch(() => {});
  }

  const automation = {
    id: Date.now(),
    time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    task: task.text,
    result: `${task.action}: drafted. Connect Notion/Calendar APIs to execute externally.`,
  };
  setState({ automations: [automation, ...state.automations].slice(0, 6) });
}

function resetDemo() {
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(DEFAULT_STATE);
  render();
  syncTimer();
  syncExternalData();
}

function renderTimerOnly() {
  const timer = document.querySelector("[data-timer]");
  const ring = document.querySelector("[data-ring]");
  if (!timer) return;
  const pct = state.timerTotal ? (state.timerTotal - state.timerSec) / state.timerTotal : 0;
  timer.textContent = fmtSeconds(state.timerSec);
  timer.classList.toggle("danger", state.timerSec < 60);
  if (ring) ring.style.width = `${pct * 100}%`;
}

function render() {
  if (!syncStarted) {
    syncStarted = true;
    setTimeout(syncExternalData, 0);
  }

  const tasks = sortedTasks();
  const next = tasks[0];
  const focusTask = getFocusTask();
  const focusRole = focusTask ? role(focusTask.role) : null;
  const pct = state.timerTotal ? ((state.timerTotal - state.timerSec) / state.timerTotal) * 100 : 0;

  app.innerHTML = `
    ${state.alarmActive ? renderAlarm(focusTask) : ""}
    <header class="topbar">
      <div class="brand">
        <span class="brand-name">Rockhouse</span>
        <span class="brand-sub">Command Center</span>
      </div>
      <nav class="view-switch">
        <button class="${state.view === "focus" ? "active" : ""}" data-action="view" data-view="focus">Focus</button>
        <button class="${state.view === "board" ? "active" : ""}" data-action="view" data-view="board">Board</button>
        <button class="${state.view === "connect" ? "active" : ""}" data-action="view" data-view="connect">Connect</button>
      </nav>
    </header>

    <main class="shell">
      <aside class="sidebar">
        ${renderRoleFilters()}
        ${focusTask ? renderActiveFocus(focusTask, focusRole, pct) : renderNoFocus()}
        ${renderAgenda()}
        ${renderStats()}
      </aside>
      <section class="main-panel">
        ${state.view === "focus" ? renderFocusView(next, tasks) : ""}
        ${state.view === "board" ? renderBoardView() : ""}
        ${state.view === "connect" ? renderConnectView() : ""}
      </section>
    </main>
  `;
}

function renderAlarm(task) {
  return `
    <section class="alarm-overlay">
      <div class="alarm-title">${escapeHtml(state.alarmTitle || "TIME")}</div>
      <div class="alarm-card">
        <span>${task ? "You were working on" : "Live alert"}</span>
        <strong>${escapeHtml(state.alarmMessage || task?.text || "Focus block")}</strong>
      </div>
      <div class="alarm-actions">
        ${task ? `<button class="primary" data-action="complete" data-id="${task.id}">Mark Done</button>` : ""}
        <button data-action="snooze" data-minutes="5">+5 min</button>
        <button data-action="snooze" data-minutes="15">+15 min</button>
        <button data-action="dismiss">Dismiss</button>
      </div>
    </section>
  `;
}

function renderRoleFilters() {
  const selectedPillar = state.activeRole === "all" ? null : role(state.activeRole);
  return `
    <section class="side-block">
      <h2>Pillar</h2>
      <button class="role-pill ${state.activeRole === "all" ? "active" : ""}" data-action="role" data-role="all">All Pillars</button>
      ${ROLES.map((item) => `
        <button class="role-pill ${state.activeRole === item.id ? "active" : ""}" style="--role:${item.color}" data-action="role" data-role="${item.id}">
          <span></span>${item.label}
        </button>
      `).join("")}
      <p class="pillar-note">${selectedPillar ? selectedPillar.description : "Pillars filter the dashboard when you want to focus one area. Leave All Pillars on for the normal day plan."}</p>
    </section>
  `;
}

function renderActiveFocus(task, itemRole, pct) {
  return `
    <section class="side-block active-focus">
      <h2>Active Focus</h2>
      <span class="role-label" style="color:${itemRole.color}">${itemRole.label}</span>
      <p>${escapeHtml(task.text)}</p>
      <div class="timer-row">
        <strong data-timer class="${state.timerSec < 60 ? "danger" : ""}">${fmtSeconds(state.timerSec)}</strong>
        <div>
          <button data-action="toggle-timer">${state.timerRunning ? "Pause" : "Resume"}</button>
          <button data-action="stop">Stop</button>
        </div>
      </div>
      <div class="progress"><span data-ring style="width:${pct}%"></span></div>
      ${state.snoozedUntil ? `<small>Snoozed until ${state.snoozedUntil}</small>` : ""}
    </section>
  `;
}

function renderNoFocus() {
  return `
    <section class="side-block no-focus">
      <h2>Active Focus</h2>
      <p>No timer running.</p>
    </section>
  `;
}

function renderAgenda() {
  return `
    <section class="side-block">
      <h2>Live Calendar</h2>
      <div class="agenda-list">
        ${state.events.length ? state.events.map((event) => {
          const itemRole = role(event.role);
          return `
            <div class="agenda-item" style="--role:${itemRole.color}">
              <time>${event.start}</time>
              <div>
                <strong>${escapeHtml(event.title)}</strong>
                <span>${event.end} · ${itemRole.short}</span>
              </div>
            </div>
          `;
        }).join("") : `<p class="empty-note">No calendar blocks found for today.</p>`}
      </div>
    </section>
  `;
}

function renderStats() {
  return `
    <section class="side-block stats">
      <h2>Today</h2>
      ${ROLES.map((item) => {
        const total = state.tasks.filter((task) => task.role === item.id).length;
        const done = state.tasks.filter((task) => task.role === item.id && task.done).length;
        return `
          <div class="stat-row">
            <span>${item.short}</span>
            <div><i style="width:${total ? (done / total) * 100 : 0}%; background:${item.color}"></i></div>
            <span>${done}/${total}</span>
          </div>
        `;
      }).join("")}
    </section>
  `;
}

function renderFocusView(next, tasks) {
  return `
    <div class="focus-view">
      ${next ? renderNextTask(next) : `<div class="empty-state">No active tasks. Add one below.</div>`}
      <div class="section-title">
        <span>Up Next - ${Math.max(0, tasks.length - 1)} more</span>
      </div>
      <div class="feed-list">
        ${tasks.slice(1).map(renderFeedTask).join("")}
      </div>
      <details class="add-task-panel">
        <summary>Add a task</summary>
        ${renderAddForm()}
      </details>
    </div>
  `;
}

function renderNextTask(task) {
  const itemRole = role(task.role);
  return `
    <section class="next-card" style="--role:${itemRole.color}; --role-bg:${itemRole.bg}">
      <div class="next-copy">
        <span>Do this now</span>
        <small>${itemRole.label} · ${PRIORITY_LABELS[task.priority]} · ${task.source} · due ${task.due}</small>
        <h1>${escapeHtml(task.text)}</h1>
      </div>
      <div class="minutes">${task.minutes}m</div>
      <div class="next-actions">
        <button class="primary" data-action="start" data-id="${task.id}">${state.focusId === task.id ? "Running" : "Start Focus"}</button>
        <button data-action="complete" data-id="${task.id}">Done</button>
        <button data-action="automate" data-id="${task.id}">Do For Me</button>
        <button data-action="push" data-id="${task.id}">Push Down</button>
      </div>
    </section>
  `;
}

function renderAddForm() {
  return `
    <form class="add-form" data-add-form>
      <input name="text" placeholder="What needs to get done?" autocomplete="off" />
      <select name="role">${ROLES.map((item) => `<option value="${item.id}">${item.label}</option>`).join("")}</select>
      <select name="priority">
        <option value="urgent">Urgent</option>
        <option value="high" selected>High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <input name="minutes" type="number" min="5" max="120" step="5" value="20" aria-label="Minutes" />
      <input name="due" type="time" value="11:00" aria-label="Due time" />
      <button class="primary" type="submit">Add</button>
    </form>
  `;
}

function renderFeedTask(task) {
  const itemRole = role(task.role);
  return `
    <article class="feed-card" style="--role:${itemRole.color}; --role-bg:${itemRole.bg}">
      <i></i>
      <div class="feed-card-copy">
        <span>${itemRole.label} · ${task.minutes}m · ${task.source} · due ${task.due}</span>
        <strong>${escapeHtml(task.text)}</strong>
        <em style="color:${PRIORITY_COLORS[task.priority]}">${PRIORITY_LABELS[task.priority]}</em>
      </div>
      <div class="feed-card-actions">
        <button data-action="start" data-id="${task.id}">Start</button>
        <button data-action="complete" data-id="${task.id}">Done</button>
      </div>
    </article>
  `;
}

function renderBoardView() {
  return `
    <div class="board">
      ${ROLES.map((item) => {
        const active = state.tasks.filter((task) => task.role === item.id && !task.done).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
        const done = state.tasks.filter((task) => task.role === item.id && task.done).length;
        return `
          <section class="role-column" style="--role:${item.color}">
            <header>
              <strong>${item.label}</strong>
              <span>${active.length} active · ${done} done</span>
            </header>
            ${active.map(renderBoardTask).join("") || `<p>Clear.</p>`}
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function renderBoardTask(task) {
  return `
    <article class="board-task">
      <span style="color:${PRIORITY_COLORS[task.priority]}">${PRIORITY_LABELS[task.priority]}</span>
      <strong>${escapeHtml(task.text)}</strong>
      <div>
        <button data-action="start" data-id="${task.id}">Start</button>
        <button data-action="automate" data-id="${task.id}">Do</button>
        <button data-action="complete" data-id="${task.id}">Done</button>
      </div>
    </article>
  `;
}

function renderConnectView() {
  return `
    <div class="connect-view">
      <section class="connect-panel">
        <h1>Connectors</h1>
        <p class="sync-line">Sync: ${escapeHtml(state.syncStatus)}${state.syncError ? ` · ${escapeHtml(state.syncError)}` : ""}</p>
        <div class="connector-grid">
          ${renderConnector("Google Calendar", state.connected.calendar, "Reads meetings and deadline blocks into the live agenda.")}
          ${renderConnector("Notion", state.connected.notion, "Reads task databases and writes completion notes back.")}
          ${renderConnector("Alarms", state.connected.alarms ? "on" : "off", "Browser audio plus visible timeout overlay with snooze.")}
          ${renderConnector("Browser Notifications", state.notificationsEnabled ? "on" : "off", "Sends live system notifications before due times and calendar blocks.")}
          ${renderConnector("Automations", state.connected.automations, "Drafts actions now; API execution belongs behind authenticated endpoints.")}
        </div>
        <div class="connector-actions">
          <a class="button-link" href="${API_BASE}/api/google/auth">Connect Google Calendar</a>
          <button data-action="sync-now">Sync Now</button>
          <button class="primary" data-action="enable-notifications">Enable Live Alerts</button>
          <button data-action="test-alert">Test Alarm</button>
        </div>
      </section>
      <section class="connect-panel">
        <h1>Automation Log</h1>
        <div class="automation-log">
          ${state.automations.map((item) => `
            <article>
              <time>${item.time}</time>
              <strong>${escapeHtml(item.task)}</strong>
              <span>${escapeHtml(item.result)}</span>
            </article>
          `).join("") || `<p>No automations run yet.</p>`}
        </div>
      </section>
      <section class="connect-panel">
        <h1>Implementation Hooks</h1>
        <pre><code>GET  ${API_BASE}/api/calendar/today
GET  ${API_BASE}/api/notion/tasks
POST ${API_BASE}/api/automations/:id/run</code></pre>
        <button data-action="reset">Reset Demo Data</button>
      </section>
    </div>
  `;
}

function renderConnector(name, status, body) {
  const label = status === "demo" ? "DEMO - NOT CONNECTED" : String(status).toUpperCase();
  return `
    <article class="connector">
      <strong>${name}</strong>
      <span>${label}</span>
      <p>${body}</p>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

app.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const { action, id, role: roleId, view, minutes } = button.dataset;
  if (action === "view") setState({ view });
  if (action === "role") setState({ activeRole: roleId });
  if (action === "start") startFocus(Number(id));
  if (action === "complete" && id) completeTask(Number(id));
  if (action === "push") pushDown(Number(id));
  if (action === "automate") runAutomation(Number(id));
  if (action === "snooze") snooze(Number(minutes));
  if (action === "dismiss") setState({ alarmActive: false });
  if (action === "toggle-timer") setState({ timerRunning: !state.timerRunning });
  if (action === "stop") setState({ focusId: null, timerRunning: false, alarmActive: false, timerSec: 0, timerTotal: 0 });
  if (action === "enable-notifications") enableNotifications();
  if (action === "sync-now") syncExternalData();
  if (action === "test-alert") triggerLiveAlert(`test:${Date.now()}`, "Live alert test", "This is what your command center alarm feels like.");
  if (action === "reset") resetDemo();
});

app.addEventListener("submit", (event) => {
  if (!event.target.matches("[data-add-form]")) return;
  event.preventDefault();
  addTask(event.target);
  event.target.reset();
});

if ("Notification" in window && Notification.permission === "granted" && !state.notificationsEnabled) {
  state = { ...state, notificationsEnabled: true };
  saveState();
}

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  navigator.serviceWorker.register(`${API_BASE || "."}/sw.js`).catch(() => {});
}

render();
syncTimer();
syncAlerts();
checkLiveAlerts();
