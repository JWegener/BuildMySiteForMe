import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt, randomUUID } from "node:crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4178);
const rooms = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const schemaExample = {
  name: "Use the user's real approved public name",
  summary: "Use a concise real summary that the user approved for public display.",
  interests: ["real approved interest"],
  projects: ["real approved project"],
  skills: ["real approved skill"],
  taste: ["real approved taste note"],
  traits: ["real approved trait", "real approved trait", "real approved trait"],
  testimonials: [
    { quote: "Real humorous approved quote about the user.", signed: "my AI" },
    { quote: "Real humorous approved quote about the user.", signed: "my AI" },
    { quote: "Real humorous approved quote about the user.", signed: "my AI" }
  ]
};

function createRoom(id = makeRoomId()) {
  if (!rooms.has(id)) {
    rooms.set(id, {
      id,
      createdAt: new Date().toISOString(),
      context: null,
      status: {
        stage: "issued",
        message: "Room number issued. Waiting for the agent prompt to be copied.",
        progress: 12
      },
      clients: new Set(),
      events: []
    });
  }
  return rooms.get(id);
}

function createNewRoom() {
  let id = makeRoomId();
  while (rooms.has(id)) id = makeRoomId();
  return createRoom(id);
}

function makeRoomId() {
  return String(randomInt(100000, 1000000));
}

function roomIdFromPath(pathname, suffix = "") {
  const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = pathname.match(new RegExp(`^/api/build-room/([a-zA-Z0-9-]{4,80})${escapedSuffix}$`));
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

function sendEvent(room, type, payload) {
  const event = {
    id: randomUUID(),
    type,
    payload,
    createdAt: new Date().toISOString()
  };
  room.events.push(event);
  room.events = room.events.slice(-50);
  const wire = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of room.clients) {
    client.write(wire);
  }
}

function updateRoomStatus(room, input) {
  const status = {
    stage: input.stage || room.status.stage || "working",
    message: input.message,
    progress: Number.isFinite(input.progress) ? Math.max(0, Math.min(100, input.progress)) : room.status.progress,
    detail: input.detail || null
  };
  room.status = status;
  sendEvent(room, "status", status);
  return status;
}

function validateStatus(input) {
  const allowedStages = new Set([
    "issued",
    "copied",
    "agent-started",
    "gathering",
    "approval-needed",
    "approved",
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

function cleanArray(value) {
  return (value || []).map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
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

  if (req.method === "POST" && url.pathname === "/api/build-room") {
    const room = createNewRoom();
    sendJson(res, 201, {
      ok: true,
      roomId: room.id,
      roomUrl: `/room/${room.id}`,
      eventsUrl: `/api/build-room/${room.id}/events`,
      statusUrl: `/api/build-room/${room.id}/status`,
      contextUrl: `/api/build-room/${room.id}/context`
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/healthz") {
    sendJson(res, 200, { ok: true, rooms: rooms.size });
    return;
  }

  const eventsRoomId = roomIdFromPath(url.pathname, "/events");
  if (req.method === "GET" && eventsRoomId) {
    const room = createRoom(eventsRoomId);
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "access-control-allow-origin": "*",
      "x-accel-buffering": "no"
    });
    res.write(`event: ready\ndata: ${JSON.stringify({ type: "ready", payload: { roomId: room.id, createdAt: room.createdAt, status: room.status } })}\n\n`);
    if (room.status) {
      res.write(`event: status\ndata: ${JSON.stringify({ type: "status", payload: room.status })}\n\n`);
    }
    if (room.context) {
      res.write(`event: context\ndata: ${JSON.stringify({ type: "context", payload: room.context })}\n\n`);
    }
    room.clients.add(res);
    req.on("close", () => room.clients.delete(res));
    return;
  }

  const contextRoomId = roomIdFromPath(url.pathname, "/context");
  if (req.method === "GET" && contextRoomId) {
    const room = createRoom(contextRoomId);
    sendJson(res, 200, { ok: true, roomId: room.id, status: room.status, context: room.context, schemaExample });
    return;
  }

  const statusRoomId = roomIdFromPath(url.pathname, "/status");
  if (req.method === "POST" && statusRoomId) {
    const room = createRoom(statusRoomId);
    try {
      const body = await readJsonBody(req);
      const validation = validateStatus(body);
      if (!validation.ok) {
        sendJson(res, 422, { ok: false, errors: validation.errors });
        return;
      }
      const status = updateRoomStatus(room, validation.data);
      sendJson(res, 202, { ok: true, roomId: room.id, status });
    } catch (error) {
      sendJson(res, error.status || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && contextRoomId) {
    const room = createRoom(contextRoomId);
    try {
      const body = await readJsonBody(req);
      updateRoomStatus(room, { stage: "validating", message: "Agent payload received. Validating strict schema.", progress: 68 });
      const validation = validateContext(body);
      if (!validation.ok) {
        updateRoomStatus(room, { stage: "error", message: "Agent payload failed schema validation.", progress: 42 });
        sendEvent(room, "error", { message: "Agent payload failed schema validation.", errors: validation.errors });
        sendJson(res, 422, { ok: false, errors: validation.errors, schemaExample });
        return;
      }
      updateRoomStatus(room, { stage: "generating", message: "Schema passed. Generating the personal website preview.", progress: 84 });
      room.context = {
        ...validation.data,
        receivedAt: new Date().toISOString()
      };
      sendEvent(room, "context", room.context);
      updateRoomStatus(room, { stage: "complete", message: `Website generated for ${room.context.name}.`, progress: 100 });
      sendJson(res, 202, { ok: true, roomId: room.id, accepted: room.context });
    } catch (error) {
      sendJson(res, error.status || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "GET" && /^\/room\/[a-zA-Z0-9-]{4,80}$/.test(url.pathname)) {
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
