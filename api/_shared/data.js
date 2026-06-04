const events = [];

const tasks = [
  { id: 3, role: "money", source: "Notion", text: "Review today's lead generation and sales production targets", priority: "high", done: false, minutes: 20, due: "09:15", action: "Draft money pillar execution list" },
  { id: 4, role: "health", source: "Notion", text: "Block strength, knee/back/core rehab, and recovery window", priority: "medium", done: false, minutes: 30, due: "15:00", action: "Create health block plan" },
  { id: 5, role: "family", source: "Notion", text: "Choose one concrete connection move for Tanya and the kids", priority: "medium", done: false, minutes: 15, due: "17:30", action: "Draft family leadership move" },
  { id: 6, role: "spiritual", source: "Notion", text: "Prayer, scripture, and character check-in", priority: "medium", done: false, minutes: 20, due: "18:00", action: "Open devotional reflection" },
  { id: 7, role: "legacy", source: "Notion", text: "Capture one lesson from today's listing walk-through", priority: "low", done: false, minutes: 20, due: "18:30", action: "Build legacy content outline" },
  { id: 8, role: "home", source: "Notion", text: "Pick the next small home update that creates peace and function", priority: "low", done: false, minutes: 15, due: "19:00", action: "Draft home environment next step" },
];

function sendJson(res, payload, statusCode = 200) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function isConfigured(...names) {
  return names.every((name) => Boolean(process.env[name]));
}

module.exports = {
  events,
  tasks,
  sendJson,
  isConfigured,
};
