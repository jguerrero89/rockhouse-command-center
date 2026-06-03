const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const REFRESH_COOKIE = "rockhouse_google_refresh";
const STATE_COOKIE = "rockhouse_google_oauth_state";

function getBaseUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || (host?.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

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

function cookie(name, value, maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function sendHtml(res, statusCode, title, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <style>
          body { margin:0; min-height:100vh; display:grid; place-items:center; background:#0a0a0a; color:#e8e8e8; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; }
          main { width:min(560px, calc(100vw - 32px)); border:1px solid #292d35; border-radius:8px; background:#101116; padding:24px; }
          h1 { margin:0 0 12px; font-size:22px; }
          p { color:#9aa2ad; line-height:1.5; }
          a { display:inline-block; margin-top:12px; color:#0a0a0a; background:#c8a96e; padding:10px 14px; border-radius:4px; text-decoration:none; text-transform:uppercase; letter-spacing:.08em; font-size:12px; }
        </style>
      </head>
      <body><main><h1>${title}</h1><p>${body}</p><a href="/">Back to Rockhouse</a></main></body>
    </html>`);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  const url = new URL(req.url, getBaseUrl(req));
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = readCookies(req);

  if (!code || !state || state !== cookies[STATE_COOKIE]) {
    sendHtml(res, 400, "Google connection failed", "The Google sign-in response did not match this session. Go back and try Connect Google Calendar again.");
    return;
  }

  const redirectUri = `${getBaseUrl(req)}/api/google/callback`;
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const token = await response.json();
  if (!response.ok || !token.refresh_token) {
    sendHtml(
      res,
      500,
      "Google token missing",
      "Google did not return a refresh token. In Google Account permissions, remove this app's access, then run Connect Google Calendar again."
    );
    return;
  }

  res.setHeader("Set-Cookie", [
    cookie(REFRESH_COOKIE, token.refresh_token, 60 * 60 * 24 * 365),
    cookie(STATE_COOKIE, "", 0),
  ]);
  sendHtml(res, 200, "Google Calendar connected", "Your calendar token is saved for this Rockhouse app domain. Return to the dashboard and press Sync Now.");
};
