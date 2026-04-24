import { createServer } from "node:http";
import { stat, readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const port = Number(process.env.FRONTEND_PORT ?? 5173);

const mounts = [
  { prefix: "/node_modules/", dir: path.join(projectRoot, "node_modules") },
  { prefix: "/artifacts/", dir: path.join(projectRoot, "artifacts") },
  { prefix: "/cache/", dir: path.join(projectRoot, "cache") },
  { prefix: "/", dir: path.join(projectRoot, "frontend") },
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function pickMount(pathname) {
  for (const mount of mounts) {
    if (pathname.startsWith(mount.prefix)) return mount;
  }
  return mounts[mounts.length - 1];
}

function toSafeFilePath(baseDir, relativePath) {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, relativePath);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error("Path traversal blocked");
  }
  return target;
}

async function resolveFilePath(pathname) {
  const mount = pickMount(pathname);
  const rel = mount.prefix === "/" ? pathname.slice(1) : pathname.slice(mount.prefix.length);
  const requested = rel === "" ? "index.html" : rel;

  let filePath = toSafeFilePath(mount.dir, requested);
  const fileStat = await stat(filePath).catch(() => null);
  if (fileStat?.isDirectory()) {
    filePath = toSafeFilePath(filePath, "index.html");
  }
  return filePath;
}

createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const filePath = await resolveFilePath(pathname);
    const fileData = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] ?? "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
    res.end(fileData);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Frontend running at http://127.0.0.1:${port}`);
  console.log("Served paths: / (frontend), /artifacts, /cache, /node_modules");
});
