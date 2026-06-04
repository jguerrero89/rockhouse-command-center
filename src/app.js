const PILLARS = [
  { id: "money", label: "Money & Wealth", short: "MW", color: "#c8a96e", bg: "#161207" },
  { id: "health", label: "Health & Strength", short: "HS", color: "#d26f92", bg: "#170910" },
  { id: "family", label: "Family & Relationships", short: "FR", color: "#74d896", bg: "#07140d" },
  { id: "spiritual", label: "Spiritual & Personal Growth", short: "SP", color: "#97a2ee", bg: "#090b18" },
  { id: "legacy", label: "Legacy & Influence", short: "LI", color: "#75c4d7", bg: "#071418" },
];

const PRIORITY_ORDER = { now: 0, high: 1, normal: 2, low: 3 };
const STORAGE_KEY = "rockhouse.os.simple.v1";
const API_BASE = window.location.protocol === "file:" ? null : "";

const CHECKLISTS = [
  {
    id: "leaving-house",
    title: "Leaving House Gear Check",
    pillar: "money",
    source: "Checklist",
    priority: "high",
    dueLabel: "Before shoot",
    items: ["Camera", "Drone", "Mics", "Batteries", "SD cards", "Tripod", "Gimbal", "Lights", "Address confirmed", "Phone charged"],
  },
  {
    id: "leaving-listing",
    title: "Leaving Listing Check",
    pillar: "money",
    source: "Checklist",
    priority: "high",
    dueLabel: "After shoot",
    items: ["Camera packed", "Drone packed", "SD cards removed", "Lights off", "Doors locked", "Lockbox returned", "Client updated"],
  },
  {
    id: "gear-reset",
    title: "End of Day Gear Reset",
    pillar: "money",
    source: "Checklist",
    priority: "normal",
    dueLabel: "Evening",
    items: ["Charge batteries", "Dump footage", "Back up files", "Pack bag", "Confirm tomorrow"],
  },
  {
    id: "weekly-reset",
    title: "Sunday Weekly Reset",
    pillar: "spiritual",
    source: "Reset",
    priority: "normal",
    dueLabel: "Sunday",
    items: ["Review calendar", "Review family commitments", "Review pipeline", "Plan workouts", "Plan date time", "Choose top 3", "Reset gear"],
  },
];

const DEFAULT_REMINDERS = [
  { id: "lead-gen", title: "Review lead generation and sales production", pillar: "money", source: "Reminder", priority: "high", due: "09:15", minutes: 20 },
  { id: "health-block", title: "Strength, rehab, and recovery block", pillar: "health", source: "Reminder", priority: "normal", due: "15:00", minutes: 30 },
  { id: "family-touch", title: "Choose one connection move for Tanya or the kids", pillar: "family", source: "Reminder", priority: "normal", due: "17:30", minutes: 15 },
  { id: "prayer", title: "Prayer, scripture, and character check-in", pillar: "spiritual", source: "Reminder", priority: "normal", due: "18:00", minutes: 20 },
  { id: "legacy-capture", title: "Capture one lesson or story from today", pillar: "legacy", source: "Reminder", priority: "low", due: "18:30", minutes: 20 },
];

const DEFAULT_STATE = {
  view: "feed",
  pillar: "all",
  tasks: DEFAULT_REMINDERS,
  events: [],
  completed: [],
  checklistDone: {},
  connection: {
    calendar: "not-connected",
    notion: "not-connected",
    googleStatus: null,
  },
  syncStatus: "idle",
  syncError: "",
  notificationsEnabled: false,
  focus: null,
  alarm: null,
};

const app = document.querySelector("#app");
let state = loadState();
let timerId = null;
let syncStarted = false;
let audioCtx = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...structuredClone(DEFAULT_STATE), ...saved };
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
}

function pillar(id) {
  return PILLARS.find((item) => item.id === id) || PILLARS[0];
}

function minutesNow() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function timeToMinutes(time = "23:59") {
  const [h, m] = String(time).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function todayDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function eventTime(event) {
  if (event.startsAt) return new Date(event.startsAt).getTime();
  return Date.now() + Math.max(0, timeToMinutes(event.start) - minutesNow()) * 60000;
}

function taskTime(task) {
  return Date.now() + Math.max(0, timeToMinutes(task.due) - minutesNow()) * 60000;
}

function fmtTimer(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function syncExternalData() {
  if (!API_BASE) return;
  state = { ...state, syncStatus: "syncing", syncError: "" };
  saveState();
  render();

  Promise.allSettled([
    fetch("/api/calendar/today", { credentials: "same-origin" }).then((res) => res.json()),
    fetch("/api/notion/tasks").then((res) => res.json()),
    fetch("/api/google/status", { credentials: "same-origin" }).then((res) => res.json()),
  ]).then(([calendar, notion, google]) => {
    const next = {
      events: state.events,
      tasks: state.tasks,
      connection: { ...state.connection },
      syncStatus: "synced",
      syncError: "",
    };

    if (calendar.status === "fulfilled") {
      next.events = Array.isArray(calendar.value.events) ? calendar.value.events : [];
      next.connection.calendar = calendar.value.status || "connected";
    } else {
      next.events = [];
      next.connection.calendar = "calendar-error";
      next.syncStatus = "error";
      next.syncError = "Calendar did not respond.";
    }

    if (notion.status === "fulfilled") {
      const liveTasks = Array.isArray(notion.value.tasks) ? notion.value.tasks : [];
      next.tasks = liveTasks.length ? liveTasks : DEFAULT_REMINDERS;
      next.connection.notion = notion.value.status || "connected";
    } else {
      next.connection.notion = "notion-error";
    }

    if (google.status === "fulfilled") {
      next.connection.googleStatus = google.value;
    }

    setState(next);
  });
}

function feedItems() {
  const calendarItems = state.events.map((event) => ({
    id: `event:${event.id}`,
    kind: "event",
    title: event.title,
    pillar: event.role || "money",
    source: "Calendar",
    priority: "now",
    meta: `${event.date || "Upcoming"} at ${event.start}${event.end ? `-${event.end}` : ""}`,
    sortAt: eventTime(event),
    raw: event,
  }));

  const taskItems = state.tasks.map((task) => ({
    id: `task:${task.id}`,
    kind: "task",
    title: task.text || task.title,
    pillar: task.role || task.pillar || "money",
    source: task.source || "Task",
    priority: normalizePriority(task.priority),
    meta: `${task.minutes || 20} min${task.due ? ` at ${task.due}` : ""}`,
    sortAt: taskTime(task),
    raw: task,
  }));

  const checklistItems = CHECKLISTS.map((list, index) => ({
    id: `checklist:${list.id}`,
    kind: "checklist",
    title: list.title,
    pillar: list.pillar,
    source: list.source,
    priority: list.priority,
    meta: list.dueLabel,
    sortAt: Date.now() + (index + 2) * 60 * 60000,
    raw: list,
  }));

  return [...calendarItems, ...taskItems, ...checklistItems]
    .filter((item) => !state.completed.includes(item.id))
    .filter((item) => state.pillar === "all" || item.pillar === state.pillar)
    .sort((a, b) => a.sortAt - b.sortAt || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

function normalizePriority(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("urgent") || text.includes("now")) return "now";
  if (text.includes("high") || text.includes("today")) return "high";
  if (text.includes("low") || text.includes("later")) return "low";
  return "normal";
}

function completeItem(id) {
  setState({ completed: [...new Set([...state.completed, id])] });
}

function startFocus(item) {
  const minutes = item.raw?.minutes || 20;
  setState({
    focus: {
      id: item.id,
      title: item.title,
      pillar: item.pillar,
      seconds: minutes * 60,
      total: minutes * 60,
      running: true,
    },
  });
}

function syncTimer() {
  clearInterval(timerId);
  if (!state.focus?.running) return;
  timerId = setInterval(() => {
    const next = Math.max(0, state.focus.seconds - 1);
    if (next === 0) {
      soundAlarm();
      setState({
        focus: { ...state.focus, seconds: 0, running: false },
        alarm: { title: "Time", message: state.focus.title },
      });
      return;
    }
    state = { ...state, focus: { ...state.focus, seconds: next } };
    saveState();
    renderTimerOnly();
  }, 1000);
}

function renderTimerOnly() {
  const node = document.querySelector("[data-focus-timer]");
  if (node && state.focus) node.textContent = fmtTimer(state.focus.seconds);
}

function beep(freq = 660, dur = 0.14) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = freq;
    osc.type = "square";
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch {
    // Audio may be blocked until user interaction.
  }
}

function soundAlarm() {
  [0, 220, 440].forEach((delay) => setTimeout(() => beep(), delay));
}

async function enableNotifications() {
  if (!("Notification" in window)) return;
  const permission = await Notification.requestPermission();
  setState({ notificationsEnabled: permission === "granted" });
}

function toggleChecklist(listId, item) {
  const key = `${listId}:${item}`;
  const current = state.checklistDone[key];
  setState({ checklistDone: { ...state.checklistDone, [key]: !current } });
}

function render() {
  if (!syncStarted) {
    syncStarted = true;
    setTimeout(syncExternalData, 0);
  }

  const items = feedItems();
  const next = items[0];

  app.innerHTML = `
    ${state.alarm ? renderAlarm() : ""}
    <header class="app-header">
      <div>
        <strong>Rockhouse</strong>
        <span>Command Center</span>
      </div>
      <button data-action="sync">${state.syncStatus === "syncing" ? "Syncing" : "Sync"}</button>
    </header>

    <main class="app-shell">
      <section class="hero-feed">
        <div class="pillar-strip">
          <button class="${state.pillar === "all" ? "active" : ""}" data-action="pillar" data-pillar="all">All</button>
          ${PILLARS.map((item) => `
            <button class="${state.pillar === item.id ? "active" : ""}" style="--pillar:${item.color}" data-action="pillar" data-pillar="${item.id}">${item.short}</button>
          `).join("")}
        </div>

        ${state.focus ? renderFocusBar() : ""}
        ${next ? renderNowCard(next) : renderEmpty()}

        <nav class="view-tabs">
          <button class="${state.view === "feed" ? "active" : ""}" data-action="view" data-view="feed">Feed</button>
          <button class="${state.view === "checklists" ? "active" : ""}" data-action="view" data-view="checklists">Checklists</button>
          <button class="${state.view === "reset" ? "active" : ""}" data-action="view" data-view="reset">Reset</button>
          <button class="${state.view === "settings" ? "active" : ""}" data-action="view" data-view="settings">Settings</button>
        </nav>

        ${state.view === "feed" ? renderFeed(items.slice(1)) : ""}
        ${state.view === "checklists" ? renderChecklistView() : ""}
        ${state.view === "reset" ? renderResetView() : ""}
        ${state.view === "settings" ? renderSettings() : ""}
      </section>
    </main>
  `;
}

function renderAlarm() {
  return `
    <section class="alarm">
      <div>
        <span>${escapeHtml(state.alarm.title)}</span>
        <strong>${escapeHtml(state.alarm.message)}</strong>
      </div>
      <button data-action="dismiss-alarm">Dismiss</button>
    </section>
  `;
}

function renderFocusBar() {
  const itemPillar = pillar(state.focus.pillar);
  return `
    <section class="focus-bar" style="--pillar:${itemPillar.color}">
      <span>${escapeHtml(state.focus.title)}</span>
      <strong data-focus-timer>${fmtTimer(state.focus.seconds)}</strong>
      <button data-action="toggle-focus">${state.focus.running ? "Pause" : "Resume"}</button>
      <button data-action="clear-focus">Stop</button>
    </section>
  `;
}

function renderNowCard(item) {
  const itemPillar = pillar(item.pillar);
  return `
    <article class="now-card" style="--pillar:${itemPillar.color}; --pillar-bg:${itemPillar.bg}">
      <div class="card-kicker">
        <span>Do this next</span>
        <em>${escapeHtml(itemPillar.label)} / ${escapeHtml(item.source)} / ${escapeHtml(item.meta)}</em>
      </div>
      <h1>${escapeHtml(item.title)}</h1>
      ${item.kind === "checklist" ? renderChecklistItems(item.raw) : ""}
      <div class="card-actions">
        <button class="primary" data-action="start" data-id="${item.id}">Start Focus</button>
        <button data-action="done" data-id="${item.id}">Done</button>
      </div>
    </article>
  `;
}

function renderFeed(items) {
  return `
    <section class="feed">
      ${items.map(renderFeedCard).join("")}
    </section>
  `;
}

function renderFeedCard(item) {
  const itemPillar = pillar(item.pillar);
  return `
    <article class="feed-card" style="--pillar:${itemPillar.color}; --pillar-bg:${itemPillar.bg}">
      <div class="feed-line"></div>
      <div class="feed-meta">${escapeHtml(itemPillar.label)} / ${escapeHtml(item.source)} / ${escapeHtml(item.meta)}</div>
      <h2>${escapeHtml(item.title)}</h2>
      ${item.kind === "checklist" ? renderChecklistItems(item.raw) : ""}
      <div class="feed-actions">
        <button data-action="start" data-id="${item.id}">Start</button>
        <button data-action="done" data-id="${item.id}">Done</button>
      </div>
    </article>
  `;
}

function renderChecklistItems(list) {
  return `
    <div class="mini-checklist">
      ${list.items.map((item) => {
        const key = `${list.id}:${item}`;
        return `
          <label>
            <input type="checkbox" data-action="check" data-list="${list.id}" data-item="${escapeHtml(item)}" ${state.checklistDone[key] ? "checked" : ""} />
            <span>${escapeHtml(item)}</span>
          </label>
        `;
      }).join("")}
    </div>
  `;
}

function renderChecklistView() {
  return `
    <section class="feed">
      ${CHECKLISTS.map((list) => renderFeedCard({
        id: `checklist:${list.id}`,
        kind: "checklist",
        title: list.title,
        pillar: list.pillar,
        source: list.source,
        meta: list.dueLabel,
        raw: list,
      })).join("")}
    </section>
  `;
}

function renderResetView() {
  const reset = CHECKLISTS.find((item) => item.id === "weekly-reset");
  return `
    <section class="single-panel">
      <h2>Weekly Reset</h2>
      <p>Review the week, reduce loose ends, and set the next few moves.</p>
      ${renderChecklistItems(reset)}
    </section>
  `;
}

function renderSettings() {
  const google = state.connection.googleStatus;
  return `
    <section class="settings-grid">
      ${renderStatusCard("Google Calendar", state.connection.calendar)}
      ${renderStatusCard("Notion", state.connection.notion)}
      ${renderStatusCard("Notifications", state.notificationsEnabled ? "on" : "off")}
      <div class="settings-actions">
        <a class="button-link" href="/api/google/auth">Connect Google Calendar</a>
        <button data-action="notifications">Enable Notifications</button>
        <button data-action="reset-local">Reset Local Data</button>
      </div>
      ${google ? `
        <div class="diagnostics">
          <span>Google env: ${google.googleClientConfigured ? "ready" : "missing"}</span>
          <span>Token: ${google.hasRefreshCookie || google.hasRefreshEnv ? "present" : "missing"}</span>
          <span>Calendar: ${escapeHtml(google.calendarId || "primary")}</span>
        </div>
      ` : ""}
    </section>
  `;
}

function renderStatusCard(label, status) {
  return `
    <article class="status-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(status || "not-connected").replaceAll("-", " "))}</strong>
    </article>
  `;
}

function renderEmpty() {
  return `
    <section class="empty-state">
      <h1>No next moves loaded.</h1>
      <p>Connect Google Calendar, sync, or use the checklists while the outside systems load.</p>
    </section>
  `;
}

app.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "sync") syncExternalData();
  if (action === "pillar") setState({ pillar: button.dataset.pillar });
  if (action === "view") setState({ view: button.dataset.view });
  if (action === "done") completeItem(button.dataset.id);
  if (action === "start") {
    const item = feedItems().find((entry) => entry.id === button.dataset.id);
    if (item) startFocus(item);
  }
  if (action === "toggle-focus" && state.focus) setState({ focus: { ...state.focus, running: !state.focus.running } });
  if (action === "clear-focus") setState({ focus: null });
  if (action === "dismiss-alarm") setState({ alarm: null });
  if (action === "notifications") enableNotifications();
  if (action === "reset-local") {
    localStorage.removeItem(STORAGE_KEY);
    state = structuredClone(DEFAULT_STATE);
    render();
    syncExternalData();
  }
});

app.addEventListener("change", (event) => {
  const input = event.target.closest("input[data-action='check']");
  if (!input) return;
  toggleChecklist(input.dataset.list, input.dataset.item);
});

if (new URLSearchParams(window.location.search).get("google") === "connected") {
  state.view = "settings";
  state.syncStatus = "google-connected";
  saveState();
}

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

render();
syncTimer();
