const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const calendarToday = require("./api/calendar/today");
const googleAuth = require("./api/google/auth");
const googleCallback = require("./api/google/callback");
const notionTasks = require("./api/notion/tasks");
const automationRun = require("./api/automations/run");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;

function sendStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(ROOT, requested));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".webmanifest": "application/manifest+json",
      ".svg": "image/svg+xml",
    };
    res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/calendar/today") {
    await calendarToday(req, res);
    return;
  }

  if (url.pathname === "/api/google/auth") {
    await googleAuth(req, res);
    return;
  }

  if (url.pathname === "/api/google/callback") {
    await googleCallback(req, res);
    return;
  }

  if (url.pathname === "/api/notion/tasks") {
    await notionTasks(req, res);
    return;
  }

  if (/^\/api\/automations\/[^/]+\/run$/.test(url.pathname)) {
    req.body = await readJson(req);
    await automationRun(req, res);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("error", reject);
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res).catch((err) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  sendStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Rockhouse Command Center running at http://localhost:${PORT}`);
  console.log("Calendar env:", process.env.GOOGLE_ICAL_URL ? "GOOGLE_ICAL_URL set" : "missing GOOGLE_ICAL_URL");
  console.log("Notion env:", process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID ? "set" : "missing");
});
