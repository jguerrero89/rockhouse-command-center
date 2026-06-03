const { tasks, sendJson, isConfigured } = require("../_shared/data");

const NOTION_VERSION = "2022-06-28";

function prop(properties, names) {
  return names.map((name) => properties[name]).find(Boolean);
}

function plainText(value) {
  if (!value) return "";
  if (value.type === "title") return (value.title || []).map((item) => item.plain_text).join("");
  if (value.type === "rich_text") return (value.rich_text || []).map((item) => item.plain_text).join("");
  if (value.type === "select") return value.select?.name || "";
  if (value.type === "status") return value.status?.name || "";
  if (value.type === "formula") return value.formula?.string || String(value.formula?.number || "");
  return "";
}

function checkbox(value) {
  return value?.type === "checkbox" ? Boolean(value.checkbox) : false;
}

function numberValue(value, fallback) {
  return value?.type === "number" && typeof value.number === "number" ? value.number : fallback;
}

function dueTime(value) {
  if (!value || value.type !== "date" || !value.date?.start) return "11:00";
  const date = new Date(value.date.start);
  if (Number.isNaN(date.getTime())) return "11:00";
  return date.toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizePillar(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("health") || text.includes("strength")) return "health";
  if (text.includes("family") || text.includes("relationship")) return "family";
  if (text.includes("spiritual") || text.includes("growth") || text.includes("god")) return "spiritual";
  if (text.includes("legacy") || text.includes("influence") || text.includes("content")) return "legacy";
  if (text.includes("home") || text.includes("environment")) return "home";
  return "money";
}

function normalizePriority(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("urgent") || text.includes("now")) return "urgent";
  if (text.includes("high") || text.includes("today")) return "high";
  if (text.includes("low") || text.includes("later")) return "low";
  return "medium";
}

function pageToTask(page, index) {
  const properties = page.properties || {};
  const title = plainText(prop(properties, ["Task", "Name", "Title", "Action", "Next Action"])) || "Untitled task";
  const pillar = plainText(prop(properties, ["Pillar", "Role", "Area", "Category"]));
  const priority = plainText(prop(properties, ["Priority", "Urgency", "Status"]));
  const done = checkbox(prop(properties, ["Done", "Complete", "Completed"]));
  const minutes = numberValue(prop(properties, ["Minutes", "Duration", "Estimate"]), 20);
  const due = dueTime(prop(properties, ["Due", "Due Date", "Date", "Time"]));
  const action = plainText(prop(properties, ["Automation", "Action", "Do For Me", "Next Step"])) || "Draft next step";

  return {
    id: page.id || `notion-${index}`,
    role: normalizePillar(pillar),
    source: "Notion",
    text: title,
    priority: normalizePriority(priority),
    done,
    minutes,
    due,
    action,
  };
}

async function fetchNotionTasks() {
  const response = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_ID}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
    },
    body: JSON.stringify({
      page_size: 50,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Notion task fetch failed: ${body}`);
  }

  const data = await response.json();
  return (data.results || []).map(pageToTask).filter((task) => !task.done);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, { error: "Method not allowed" }, 405);
    return;
  }

  const notionReady = isConfigured("NOTION_TOKEN", "NOTION_DATABASE_ID");
  if (!notionReady) {
    sendJson(res, {
      status: "demo",
      tasks,
    });
    return;
  }

  try {
    const liveTasks = await fetchNotionTasks();
    sendJson(res, {
      status: "connected",
      tasks: liveTasks.length ? liveTasks : tasks,
    });
  } catch (error) {
    sendJson(res, {
      status: "notion-error",
      error: error.message,
      tasks,
    }, 500);
  }
};
