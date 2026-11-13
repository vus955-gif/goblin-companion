// Lokalny most zdarzen (http://127.0.0.1:<port>/event) bez zaleznosci od Electrona,
// zeby dalo sie go testowac zwyklym Node.
const MAX_EVENT_BODY_BYTES = 16 * 1024;
const MAX_EVENT_COMMENT_LENGTH = 240;

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let byteLength = 0;
    let settled = false;

    function fail(error) {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
      request.destroy();
    }

    request.on("data", (chunk) => {
      byteLength += chunk.length;

      if (byteLength > MAX_EVENT_BODY_BYTES) {
        fail(new Error(`Event payload is too large. Limit: ${MAX_EVENT_BODY_BYTES} bytes.`));
        return;
      }

      chunks.push(chunk);
    });
    request.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    request.on("end", () => {
      if (settled) {
        return;
      }

      settled = true;
      const rawBody = Buffer.concat(chunks).toString("utf8");

      if (!rawBody.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function normalizeEventComment(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedComment = value.trim().replace(/\s+/g, " ");
  return normalizedComment ? normalizedComment.slice(0, MAX_EVENT_COMMENT_LENGTH) : undefined;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

// Przegladarka dolacza Origin do kazdego zadania POST (rowniez same-origin, np. po
// DNS rebinding) i do zapytan CORS. Lokalne klienty (npm run event, curl, hooki)
// go nie wysylaja, wiec obecnosc Origin oznacza strone WWW.
function isBrowserRequest(request) {
  return request.headers.origin !== undefined;
}

// Wymaganie application/json zamyka "proste" zadania CORS: formularz HTML i fetch
// bez preflightu moga wyslac tylko text/plain, form-urlencoded albo multipart.
function isJsonContentType(contentType) {
  if (typeof contentType !== "string") {
    return false;
  }

  return contentType.split(";")[0].trim().toLowerCase() === "application/json";
}

function createEventBridgeHandler({ onEvent, port, validStates }) {
  return async (request, response) => {
    if (!request.url) {
      sendJson(response, 400, { ok: false, error: "Missing URL." });
      return;
    }

    if (isBrowserRequest(request)) {
      sendJson(response, 403, {
        ok: false,
        error: "Browser requests are not allowed. Send events from a local client without an Origin header."
      });
      return;
    }

    const requestUrl = new URL(request.url, `http://127.0.0.1:${port}`);

    if (request.method === "GET" && requestUrl.pathname === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method !== "POST" || requestUrl.pathname !== "/event") {
      sendJson(response, 404, { ok: false, error: "Not found." });
      return;
    }

    if (!isJsonContentType(request.headers["content-type"])) {
      sendJson(response, 415, {
        ok: false,
        error: "Event payload must be sent with Content-Type: application/json."
      });
      return;
    }

    try {
      const body = await parseJsonBody(request);

      if (!body || typeof body !== "object" || Array.isArray(body)) {
        sendJson(response, 400, { ok: false, error: "Event payload must be a JSON object." });
        return;
      }

      const state =String(body.state || requestUrl.searchParams.get("state") || "idle");

      if (!validStates.has(state)) {
        sendJson(response, 400, { ok: false, error: `Unknown state: ${state}` });
        return;
      }

      onEvent({
        comment: normalizeEventComment(body.comment),
        state
      });
      sendJson(response, 200, { ok: true, state });
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
}

module.exports = {
  MAX_EVENT_BODY_BYTES,
  MAX_EVENT_COMMENT_LENGTH,
  createEventBridgeHandler,
  isJsonContentType,
  normalizeEventComment
};
