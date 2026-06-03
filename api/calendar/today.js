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

function decodeIcsText(value = "") {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function unfoldIcs(text) {
  return text.replace(/\r?\n[ \t]/g, "");
}

function parseIcsDate(value) {
  if (!value) return null;
  if (/^\d{8}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    return new Date(year, month, day);
  }

  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (value.endsWith("Z")) return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return new Date(year, month - 1, day, hour, minute, second);
}

function localDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function todayKey() {
  return localDateKey(new Date());
}

function parseIcsFeed(text) {
  const today = todayKey();
  const blocks = unfoldIcs(text).match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  return blocks
    .map((block, index) => {
      const lines = block.split(/\r?\n/);
      const data = {};
      lines.forEach((line) => {
        const splitAt = line.indexOf(":");
        if (splitAt === -1) return;
        const key = line.slice(0, splitAt).split(";")[0];
        data[key] = line.slice(splitAt + 1);
      });

      const startDate = parseIcsDate(data.DTSTART);
      const endDate = parseIcsDate(data.DTEND);
      if (!startDate || !endDate || localDateKey(startDate) !== today) return null;
      const title = decodeIcsText(data.SUMMARY || "Calendar block");
      return {
        id: decodeIcsText(data.UID || `ical-${index}`),
        title,
        role: roleFromSummary(title),
        start: timeOnly(startDate.toISOString()),
        end: timeOnly(endDate.toISOString()),
        type: "calendar",
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start.localeCompare(b.start));
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

async function fetchIcalEvents() {
  const response = await fetch(process.env.GOOGLE_ICAL_URL);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google iCal fetch failed: ${body}`);
  }

  return parseIcsFeed(await response.text());
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
  if (process.env.GOOGLE_ICAL_URL) {
    try {
      const liveEvents = await fetchIcalEvents();
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
    return;
  }

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
