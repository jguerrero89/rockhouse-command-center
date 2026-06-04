const { sendJson } = require("../_shared/data");

const REFRESH_COOKIE = "rockhouse_google_refresh";

function readCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, { error: "Method not allowed" }, 405);
    return;
  }

  sendJson(res, {
    googleClientConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
    hasRefreshCookie: Boolean(readCookies(req)[REFRESH_COOKIE]),
    hasRefreshEnv: Boolean(process.env.GOOGLE_REFRESH_TOKEN),
    hasIcalFallback: Boolean(process.env.GOOGLE_ICAL_URL),
  });
};
