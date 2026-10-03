/**
 * Loopback server do renderer (produção).
 *
 * Feedback Ezequias (02/10): login Google quebra na AppImage — "modal abre e
 * fecha rapidamente". Histórico do web (PRs #166/#169) + SDK @firebase/auth:
 *
 * 1. `browserPopupRedirectResolver._validateOrigin()` confere a origem atual
 *    contra `authorizedDomains` do projeto Firebase.
 * 2. Em produção o renderer carrega via `loadFile` → origem `file://` — que
 *    NUNCA estará autorizada (e o SDK exige http/https).
 * 3. O popup do Google abre e é imediatamente encerrado com
 *    `auth/unauthorized-domain` → o modal de login "fecha rapidinho" e não
 *    autentica. Em dev (`http://127.0.0.1:5173`) o mesmo problema existe:
 *    `authorizedDomains` tem `localhost`, mas NÃO `127.0.0.1`.
 *
 * Solução (mesma família do web): servir o `dist/` por loopback
 * `http://127.0.0.1:<porta>` no processo main e carregar a janela por lá —
 * origem http válida e autorizável no console do Firebase (127.0.0.1).
 */
import http from "node:http";
import { promises as fsPromises } from "node:fs";
import path from "node:path";

// "localhost" (não 127.0.0.1): o hostname é o que o Firebase valida contra
// authorizedDomains — e "localhost" JÁ está autorizado no projeto. Porta é irrelevante.
const LOOPBACK_HOST = "localhost";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
};

/** SPA fallback: qualquer rota sem extensão serve o index.html (hash router nem precisa, mas defensivo). */
function resolveDistFile(distDir, urlPath) {
  const safe = path.posix.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(distDir, safe);
  if (!filePath.startsWith(distDir)) return null; // traversal
  return filePath;
}

/**
 * Sobe o server loopback. Resolve com { url, server } ou rejeita.
 * A porta é efêmera (0) — o SO escolhe uma livre; 127.0.0.1 nunca expõe rede.
 */
export function startRendererServer(distDir, logger = console) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const urlPath = (req.url || "/").split("?")[0];
        let filePath = resolveDistFile(distDir, urlPath === "/" ? "/index.html" : urlPath);
        let stat = filePath ? await fsPromises.stat(filePath).catch(() => null) : null;
        if (!stat || stat.isDirectory()) {
          // fallback SPA → index.html
          filePath = path.join(distDir, "index.html");
          stat = await fsPromises.stat(filePath).catch(() => null);
          if (!stat) {
            res.writeHead(404, { "content-type": "text/plain" });
            res.end("dist/index.html não encontrado");
            return;
          }
        }
        const ext = path.extname(filePath).toLowerCase();
        const data = await fsPromises.readFile(filePath);
        res.writeHead(200, {
          "content-type": MIME[ext] ?? "application/octet-stream",
          "content-length": data.length,
          "cache-control": "no-cache",
          // Origem própria: sem CORS aberto — o renderer e o auth popup falam com o mesmo host
          "x-content-type-options": "nosniff",
        });
        res.end(data);
      } catch (err) {
        logger.error?.("[renderer-server] erro servindo", req.url, err);
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("erro interno");
      }
    });

    // Porta FIXA (43000): IndexedDB/localStorage são particionados por origem
    // (host:porta) — porta efêmera trocaria a origem a cada boot e a sessão
    // do Firebase se perderia. Se ocupada, cai pra efêmera (auth ainda funciona;
    // só a sessão persistida da porta anterior é que não restaura).
    const PREFERRED_PORT = Number(process.env.LOUVORJA_RENDERER_PORT ?? 43000);
    server.once("error", function onEaddr(err) {
      if (err.code === "EADDRINUSE") {
        server.listen(0, LOOPBACK_HOST, onListening);
      } else {
        logger.error?.("[renderer-server] falhou:", err.message);
        reject(err);
      }
    });
    function onListening() {
      const { port } = server.address();
      const url = `http://${LOOPBACK_HOST}:${port}`;
      logger.log?.(`[renderer-server] dist/ servido em ${url}`);
      resolve({ url, server });
    }
    server.listen(PREFERRED_PORT, LOOPBACK_HOST, onListening);
  });
}

/**
 * Adiciona `?lang=` preservando a URL base do renderer server.
 */
export function rendererUrl(base, locale) {
  return `${base}/?lang=${locale}`;
}
