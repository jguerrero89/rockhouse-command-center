const { tasks, sendJson, isConfigured } = require("../_shared/data");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, { error: "Method not allowed" }, 405);
    return;
  }

  const notionReady = isConfigured("NOTION_TOKEN", "NOTION_DATABASE_ID");

  sendJson(res, {
    status: notionReady ? "ready-for-notion-sync" : "demo",
    tasks,
  });
};
