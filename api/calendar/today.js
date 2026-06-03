const { events, sendJson, isConfigured } = require("../_shared/data");

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars";

function localDayRange() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    timeMin: `${date}T00:00:00-07:00`,
    timeMax: `${date}T23:59:59-07:00`,
  };
}

function timeOnly(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roleFromSummary(summary = "") {
  const text = summary.toLowerCase();
  if (text.includes("workout") || text.includes("training") || text.includes("rehab") || text.includes("run")) return "health";
  if (text.includes("family") || text.includes("tanya") || text.includes("kid")) return "family";
  if (text.includes("prayer") || text.includes("scripture") || text.includes("devotional")) return "spiritual";
  if (text.includes("content") || text.includes("music") || text.includes("mentor")) return "legacy";
  if (text.includes("home") || text.includes("yard") || text.includes("clean")) return "home";
  return "money";
}

async function getGoogleAccessToken() {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google token refresh failed: ${body}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function fetchGoogleEvents() {
  const accessToken = await getGoogleAccessToken();
  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID || "primary");
  const { timeMin, timeMax } = localDayRange();
  const url = new URL(`${GOOGLE_CALENDAR_API}/${calendarId}/events`);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("maxResults", "25");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Calendar fetch failed: ${body}`);
  }

  const data = await response.json();
  return (data.items || [])
    .filter((event) => event.status !== "cancelled")
    .map((event) => ({
      id: event.id,
      title: event.summary || "Calendar block",
      role: roleFromSummary(event.summary || ""),
      start: timeOnly(event.start?.dateTime || event.start?.date),
      end: timeOnly(event.end?.dateTime || event.end?.date),
      type: event.eventType || "calendar",
      url: event.htmlLink || "",
    }))
    .filter((event) => event.start && event.end);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, { error: "Method not allowed" }, 405);
    return;
  }

  const googleReady = isConfigured("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN");
  if (!googleReady) {
    sendJson(res, {
      status: "demo",
      events,
    });
    return;
  }

  try {
    const liveEvents = await fetchGoogleEvents();
    sendJson(res, {
      status: "connected",
      events: liveEvents.length ? liveEvents : events,
    });
  } catch (error) {
    sendJson(res, {
      status: "calendar-error",
      error: error.message,
      events,
    }, 500);
  }
};
