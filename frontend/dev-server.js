'use strict';

/**
 * Servidor temporário para desenvolvimento exposto via tunnel.
 *
 * Responsabilidades:
 *   - servir os arquivos estáticos da pasta /frontend;
 *   - encaminhar /api/* para o backend local;
 *   - injetar a base da API como /api sem alterar os arquivos existentes.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const HOST = process.env.FRONTEND_HOST || '0.0.0.0';
const PORT = parseInt(process.env.FRONTEND_PORT || '8080', 10);
const FRONTEND_ROOT = __dirname;
const BACKEND_TARGET = String(process.env.BACKEND_TARGET || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const API_BASE_OVERRIDE = String(process.env.FRONTEND_API_BASE || '/api').trim() || '/api';

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function injectRuntimeConfig(html) {
  const runtimeScript = `\n<script>window.__LABORAL_API_BASE__ = ${JSON.stringify(API_BASE_OVERRIDE)};</script>\n`;

  if (html.includes('</head>')) {
    return html.replace('</head>', `${runtimeScript}</head>`);
  }

  return `${runtimeScript}${html}`;
}

function resolveStaticFile(requestUrl) {
  const incomingUrl = new URL(requestUrl, 'http://127.0.0.1');
  const pathname = decodeURIComponent(incomingUrl.pathname === '/' ? '/index.html' : incomingUrl.pathname);
  const resolvedPath = path.resolve(FRONTEND_ROOT, `.${pathname}`);

  if (!resolvedPath.startsWith(FRONTEND_ROOT)) {
    return null;
  }

  return resolvedPath;
}

function serveStaticFile(req, res) {
  const filePath = resolveStaticFile(req.url);
  if (!filePath) {
    sendJson(res, 403, { success: false, message: 'Acesso negado.' });
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendJson(res, 404, { success: false, message: 'Arquivo não encontrado.' });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[extension] || 'application/octet-stream';

    if (extension === '.html') {
      fs.readFile(filePath, 'utf8', (readError, html) => {
        if (readError) {
          sendJson(res, 500, { success: false, message: 'Falha ao carregar a página.' });
          return;
        }

        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-store',
        });
        res.end(injectRuntimeConfig(html));
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

function proxyToBackend(req, res) {
  const targetUrl = new URL(BACKEND_TARGET);
  const incomingUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const proxiedPathname = incomingUrl.pathname === '/api'
    ? '/'
    : incomingUrl.pathname.replace(/^\/api/, '') || '/';

  const headers = {
    ...req.headers,
    host: targetUrl.host,
    'x-forwarded-host': req.headers.host || '',
    'x-forwarded-proto': req.socket.encrypted ? 'https' : 'http',
  };

  const transport = targetUrl.protocol === 'https:' ? https : http;
  const proxyRequest = transport.request({
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: `${proxiedPathname}${incomingUrl.search}`,
    headers,
  }, (proxyResponse) => {
    res.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
    proxyResponse.pipe(res);
  });

  proxyRequest.on('error', (error) => {
    sendJson(res, 502, {
      success: false,
      message: 'Falha ao conectar ao backend local.',
      detail: error.message,
    });
  });

  req.pipe(proxyRequest);
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    proxyToBackend(req, res);
    return;
  }

  serveStaticFile(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`[frontend] ✓ Servidor protegido em http://${HOST}:${PORT}`);
  console.log(`[frontend] ✓ Frontend servido de: ${FRONTEND_ROOT}`);
  console.log(`[frontend] ✓ Proxy da API apontando para: ${BACKEND_TARGET}`);
  console.log(`[frontend] ✓ Base injetada no navegador: ${API_BASE_OVERRIDE}`);
});
