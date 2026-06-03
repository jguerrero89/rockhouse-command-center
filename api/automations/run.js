const { sendJson } = require("../_shared/data");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, { error: "Method not allowed" }, 405);
    return;
  }

  sendJson(res, {
    status: "drafted",
    message: "Automation received. Next step is wiring this to Notion writes, Calendar holds, and outbound drafts.",
    task: req.body?.task || null,
  });
};
