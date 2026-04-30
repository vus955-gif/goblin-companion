import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;
const host = process.env.HOST || DEFAULT_HOST;
const port = Number(process.env.PORT) || DEFAULT_PORT;
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const allowedRoutes = new Map([
  ["/", "src/demo/index.html"],
  ["/src/demo/", "src/demo/index.html"],
  ["/src/demo/index.html", "src/demo/index.html"],
  ["/src/demo/styles.css", "src/demo/styles.css"],
  ["/src/demo/app.js", "src/demo/app.js"],
  ["/src/overlay/", "src/overlay/index.html"],
  ["/src/overlay/index.html", "src/overlay/index.html"],
  ["/src/overlay/styles.css", "src/overlay/styles.css"],
  ["/src/overlay/app.js", "src/overlay/app.js"],
  ["/src/companion/comments.js", "src/companion/comments.js"],
  ["/src/companion/goblin-renderer.js", "src/companion/goblin-renderer.js"],
  ["/src/companion/goblin-state-machine.js", "src/companion/goblin-state-machine.js"],
  ["/src/companion/storage.js", "src/companion/storage.js"],
  ["/assets/goblin.svg", "assets/goblin.svg"],
  ["/favicon.ico", "assets/goblin.svg"]
]);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"]
]);

function isInsideProject(filePath) {
  const resolved = resolve(filePath);
  return resolved === projectRoot || resolved.startsWith(`${projectRoot}${sep}`);
}

function normalizeRoute(pathname) {
  const decodedPath = decodeURIComponent(pathname);
  const singleSlashPath = decodedPath.replace(/\/+/g, "/");
  return singleSlashPath.endsWith("/") && singleSlashPath !== "/"
    ? `${singleSlashPath}index.html`
    : singleSlashPath;
}

function resolveRequestPath(requestUrl) {
  const parsedUrl = new URL(requestUrl, `http://${host}:${port}`);
  const normalizedRoute = normalizeRoute(parsedUrl.pathname);
  const relativePath = allowedRoutes.get(parsedUrl.pathname) ?? allowedRoutes.get(normalizedRoute);

  if (!relativePath) {
    return null;
  }

  const filePath = resolve(projectRoot, relativePath);
  return isInsideProject(filePath) ? filePath : null;
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  response.end(message);
}

const server = createServer((request, response) => {
  if (!request.url || !["GET", "HEAD"].includes(request.method)) {
    sendText(response, 405, "Method not allowed");
    return;
  }

  let filePath;
  try {
    filePath = resolveRequestPath(request.url);
  } catch {
    sendText(response, 400, "Bad request");
    return;
  }

  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    sendText(response, 404, "Not found");
    return;
  }

  const contentType = contentTypes.get(extname(filePath).toLowerCase()) ?? "application/octet-stream";
  response.writeHead(200, { "content-type": contentType });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Goblin Companion demo: http://${host}:${port}/src/demo/`);
  console.log(`Goblin Companion overlay: http://${host}:${port}/src/overlay/`);
});
