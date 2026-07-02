import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt, randomUUID } from "node:crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4178);
const sessions = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const schemaExample = {
  name: "Use the user's real approved public name",
  summary: "Use a warm, specific, public-safe summary of who the user is, what they build, and what they care about.",
  interests: ["real approved interest, recurring theme, or public-safe obsession"],
  projects: ["real approved project"],
  skills: ["real approved skill, superpower, or unusually specific competence"],
  taste: ["real approved taste note, preference, anti-preference, or house style"],
  traits: ["real approved trait", "real approved trait", "real approved trait"],
  photos: [
    {
      url: "https://example.com/public-photo.jpg",
      alt: "Approved public photo of the user",
      caption: "Optional public-safe caption"
    }
  ],
  testimonials: [
    { quote: "Warm, specific quote about the user's personality, values, or work.", signed: "my AI" },
    { quote: "Warm quote about the user's taste, habits, or recurring themes.", signed: "my AI" },
    { quote: "Public-safe quote that sounds like it came from an AI agent that knows the user well.", signed: "my AI" }
  ]
};

function createSession(id = makeSessionId()) {
  if (!sessions.has(id)) {
    sessions.set(id, {
      id,
      createdAt: new Date().toISOString(),
      context: null,
      status: {
        stage: "issued",
        message: "Waiting for agent.",
        progress: 12
      },
      clients: new Set(),
      events: []
    });
  }
  return sessions.get(id);
}

function createNewSession() {
  let id = makeSessionId();
  while (sessions.has(id)) id = makeSessionId();
  return createSession(id);
}

function makeSessionId() {
  return String(randomInt(100000, 1000000));
}

function sessionIdFromApiPath(pathname, suffix = "") {
  const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = pathname.match(new RegExp(`^/api/build-(?:session|room)/([a-zA-Z0-9-]{4,80})${escapedSuffix}$`));
  return match?.[1] || null;
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendEvent(session, type, payload) {
  const event = {
    id: randomUUID(),
    type,
    payload,
    createdAt: new Date().toISOString()
  };
  session.events.push(event);
  session.events = session.events.slice(-50);
  const wire = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of session.clients) {
    client.write(wire);
  }
}

function updateSessionStatus(session, input) {
  const status = {
    stage: input.stage || session.status.stage || "working",
    message: input.message,
    progress: Number.isFinite(input.progress) ? Math.max(0, Math.min(100, input.progress)) : session.status.progress,
    detail: input.detail || null
  };
  session.status = status;
  sendEvent(session, "status", status);
  return status;
}

function validateStatus(input) {
  const allowedStages = new Set([
    "issued",
    "copied",
    "agent-started",
    "analyzing",
    "gathering",
    "drafting",
    "reviewing",
    "approval-needed",
    "approved",
    "publishing",
    "validating",
    "generating",
    "complete",
    "error"
  ]);
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["Payload must be a JSON object."] };
  }
  if (typeof input.message !== "string" || input.message.trim().length < 3 || input.message.trim().length > 240) {
    errors.push("message must be a string between 3 and 240 characters.");
  }
  if (input.stage !== undefined && (!allowedStages.has(input.stage))) {
    errors.push(`stage must be one of: ${Array.from(allowedStages).join(", ")}.`);
  }
  if (input.progress !== undefined && (!Number.isFinite(Number(input.progress)) || Number(input.progress) < 0 || Number(input.progress) > 100)) {
    errors.push("progress must be a number from 0 to 100.");
  }
  if (input.detail !== undefined && typeof input.detail !== "string") {
    errors.push("detail must be a string when provided.");
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      message: input.message.trim(),
      stage: input.stage,
      progress: input.progress === undefined ? undefined : Number(input.progress),
      detail: input.detail ? input.detail.trim() : undefined
    }
  };
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 65536) {
      const error = new Error("Payload is too large. Keep it under 64KB.");
      error.status = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("Body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

function validateContext(input) {
  const errors = [];
  const allowed = new Set([
    "name",
    "summary",
    "interests",
    "projects",
    "skills",
    "taste",
    "traits",
    "photos",
    "testimonials",
    "links",
    "contact"
  ]);

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["Payload must be a JSON object."] };
  }

  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) errors.push(`Unknown field "${key}".`);
  }

  requireString(input, "name", errors, 2, 120);
  requireString(input, "summary", errors, 24, 900);
  requireStringArray(input, "interests", errors, 1, 12);
  requireStringArray(input, "projects", errors, 0, 10);
  requireStringArray(input, "skills", errors, 0, 12);
  requireStringArray(input, "taste", errors, 1, 12);
  requireStringArray(input, "traits", errors, 3, 5);
  validatePhotos(input.photos, errors);
  validateTestimonials(input.testimonials, errors);

  if (input.links !== undefined && !isPlainObject(input.links) && !isStringArray(input.links)) {
    errors.push("links must be an object or an array of strings.");
  }
  if (input.contact !== undefined && !isPlainObject(input.contact) && typeof input.contact !== "string") {
    errors.push("contact must be an object or a string.");
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    data: {
      name: input.name.trim(),
      summary: input.summary.trim(),
      interests: cleanArray(input.interests),
      projects: cleanArray(input.projects || []),
      skills: cleanArray(input.skills || []),
      taste: cleanArray(input.taste),
      traits: cleanArray(input.traits),
      photos: cleanPhotos(input.photos),
      testimonials: input.testimonials.map((item) => ({
        quote: item.quote.trim(),
        signed: "my AI"
      })),
      links: input.links || null,
      contact: input.contact || null
    }
  };
}

function requireString(input, field, errors, min, max) {
  if (typeof input[field] !== "string") {
    errors.push(`${field} must be a string.`);
    return;
  }
  const value = input[field].trim();
  if (value.length < min || value.length > max) {
    errors.push(`${field} must be between ${min} and ${max} characters.`);
  }
}

function requireStringArray(input, field, errors, min, max) {
  if (!Array.isArray(input[field])) {
    errors.push(`${field} must be an array of strings.`);
    return;
  }
  const values = cleanArray(input[field]);
  if (values.length < min || values.length > max) {
    errors.push(`${field} must include ${min}-${max} items.`);
  }
  if (values.length !== input[field].length) {
    errors.push(`${field} can only contain non-empty strings.`);
  }
}

function validateTestimonials(value, errors) {
  if (!Array.isArray(value) || value.length !== 3) {
    errors.push("testimonials must include exactly 3 quote objects.");
    return;
  }
  value.forEach((item, index) => {
    if (!isPlainObject(item)) {
      errors.push(`testimonials[${index}] must be an object.`);
      return;
    }
    if (typeof item.quote !== "string" || item.quote.trim().length < 12 || item.quote.trim().length > 240) {
      errors.push(`testimonials[${index}].quote must be 12-240 characters.`);
    }
    if (item.signed !== "my AI") {
      errors.push(`testimonials[${index}].signed must be "my AI".`);
    }
  });
}

function validatePhotos(value, errors) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push("photos must be an array.");
    return;
  }
  if (value.length > 6) {
    errors.push("photos can include at most 6 items.");
    return;
  }

  value.forEach((item, index) => {
    if (!isPlainObject(item)) {
      errors.push(`photos[${index}] must be an object.`);
      return;
    }
    if (!isHttpUrl(item.url)) {
      errors.push(`photos[${index}].url must be an http(s) URL.`);
    }
    if (item.alt !== undefined && (typeof item.alt !== "string" || item.alt.trim().length > 180)) {
      errors.push(`photos[${index}].alt must be a string up to 180 characters.`);
    }
    if (item.caption !== undefined && (typeof item.caption !== "string" || item.caption.trim().length > 180)) {
      errors.push(`photos[${index}].caption must be a string up to 180 characters.`);
    }
    if (item.source !== undefined && (typeof item.source !== "string" || item.source.trim().length > 180)) {
      errors.push(`photos[${index}].source must be a string up to 180 characters.`);
    }
  });
}

function cleanArray(value) {
  return (value || []).map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function cleanPhotos(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => isPlainObject(item) && isHttpUrl(item.url))
    .slice(0, 6)
    .map((item) => ({
      url: item.url.trim(),
      alt: typeof item.alt === "string" && item.alt.trim() ? item.alt.trim() : "Public photo",
      caption: typeof item.caption === "string" ? item.caption.trim() : "",
      source: typeof item.source === "string" ? item.source.trim() : ""
    }));
}

function isHttpUrl(value) {
  if (typeof value !== "string" || value.trim().length > 1200) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

async function serveStatic(res, pathname) {
  const filePath = pathname === "/" ? join(__dirname, "index.html") : join(__dirname, pathname);
  if (!filePath.startsWith(__dirname)) {
    sendJson(res, 403, { ok: false, error: "Forbidden" });
    return;
  }
  try {
    const file = await readFile(filePath);
    const type = mimeTypes[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(file);
  } catch {
    sendJson(res, 404, { ok: false, error: "Not found" });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === "POST" && (url.pathname === "/api/build-session" || url.pathname === "/api/build-room")) {
    const session = createNewSession();
    sendJson(res, 201, {
      ok: true,
      sessionId: session.id,
      sessionUrl: `/session/${session.id}`,
      siteUrl: `/site/${session.id}`,
      eventsUrl: `/api/build-session/${session.id}/events`,
      statusUrl: `/api/build-session/${session.id}/status`,
      contextUrl: `/api/build-session/${session.id}/context`
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/healthz") {
    sendJson(res, 200, { ok: true, sessions: sessions.size });
    return;
  }

  const eventsSessionId = sessionIdFromApiPath(url.pathname, "/events");
  if (req.method === "GET" && eventsSessionId) {
    const session = createSession(eventsSessionId);
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "access-control-allow-origin": "*",
      "x-accel-buffering": "no"
    });
    res.write(`event: ready\ndata: ${JSON.stringify({ type: "ready", payload: { sessionId: session.id, createdAt: session.createdAt, status: session.status } })}\n\n`);
    if (session.context) {
      res.write(`event: context\ndata: ${JSON.stringify({ type: "context", payload: session.context })}\n\n`);
    }
    if (session.status) {
      res.write(`event: status\ndata: ${JSON.stringify({ type: "status", payload: session.status })}\n\n`);
    }
    session.clients.add(res);
    req.on("close", () => session.clients.delete(res));
    return;
  }

  const contextSessionId = sessionIdFromApiPath(url.pathname, "/context");
  if (req.method === "GET" && contextSessionId) {
    const session = createSession(contextSessionId);
    sendJson(res, 200, { ok: true, sessionId: session.id, status: session.status, context: session.context, schemaExample });
    return;
  }

  const statusSessionId = sessionIdFromApiPath(url.pathname, "/status");
  if (req.method === "POST" && statusSessionId) {
    const session = createSession(statusSessionId);
    try {
      const body = await readJsonBody(req);
      const validation = validateStatus(body);
      if (!validation.ok) {
        sendJson(res, 422, { ok: false, errors: validation.errors });
        return;
      }
      const status = updateSessionStatus(session, validation.data);
      sendJson(res, 202, { ok: true, sessionId: session.id, status });
    } catch (error) {
      sendJson(res, error.status || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && contextSessionId) {
    const session = createSession(contextSessionId);
    try {
      const body = await readJsonBody(req);
      updateSessionStatus(session, { stage: "validating", message: "Agent payload received. Validating strict schema.", progress: 68 });
      const validation = validateContext(body);
      if (!validation.ok) {
        updateSessionStatus(session, { stage: "error", message: "Agent payload failed schema validation.", progress: 42 });
        sendEvent(session, "error", { message: "Agent payload failed schema validation.", errors: validation.errors });
        sendJson(res, 422, { ok: false, errors: validation.errors, schemaExample });
        return;
      }
      updateSessionStatus(session, { stage: "generating", message: "Schema passed. Generating the personal website preview.", progress: 84 });
      session.context = {
        ...validation.data,
        receivedAt: new Date().toISOString()
      };
      sendEvent(session, "context", session.context);
      updateSessionStatus(session, { stage: "complete", message: `Website generated for ${session.context.name}.`, progress: 100 });
      sendJson(res, 202, { ok: true, sessionId: session.id, accepted: session.context });
    } catch (error) {
      sendJson(res, error.status || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "GET" && /^\/(?:session|room|site)\/[a-zA-Z0-9-]{4,80}$/.test(url.pathname)) {
    await serveStatic(res, "/");
    return;
  }

  if (req.method === "GET") {
    await serveStatic(res, url.pathname);
    return;
  }

  sendJson(res, 405, { ok: false, error: "Method not allowed" });
});

server.listen(port, () => {
  console.log(`Build My Site For Me running at http://localhost:${port}/`);
});
