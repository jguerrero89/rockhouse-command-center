const { events, sendJson, isConfigured } = require("../_shared/data");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, { error: "Method not allowed" }, 405);
    return;
  }

  const googleReady = isConfigured("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN");

  sendJson(res, {
    status: googleReady ? "ready-for-google-sync" : "demo",
    events,
  });
};
