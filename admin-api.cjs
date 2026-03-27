// admin-api.cjs — API locale : write JSON + build + deploy
// Usage : node admin-api.cjs  (ou : npm run api)
// Reçoit le JSON du panel admin, écrit src/data/terrain-etapes.json, lance build (+ deploy optionnel)

const http = require('node:http');
const fs   = require('node:fs');
const path = require('node:path');
const { exec } = require('node:child_process');

const PORT       = 4399;
const JSON_PATH  = path.join(__dirname, 'src', 'data', 'terrain-etapes.json');
const BUILD_CMD  = 'npm run build';
const DEPLOY_CMD = path.join(__dirname, 'deploy.bat');

const ALLOWED_ORIGINS = [
  'http://localhost:4321',
  'http://localhost:4322',
  'http://localhost:4320',
];

function setCors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function readBody(req) {
  return new Promise(function(resolve, reject) {
    let body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() { resolve(body); });
    req.on('error', reject);
  });
}

function runCmd(cmd, opts) {
  return new Promise(function(resolve, reject) {
    exec(cmd, opts || { cwd: __dirname }, function(err, stdout, stderr) {
      if (err) reject(err); else resolve(stdout);
    });
  });
}

const server = http.createServer(async function(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Endpoint générique: /update ou legacy /update-journal
  const isUpdate = req.method === 'POST' &&
    (req.url === '/update' || req.url === '/update-journal');

  if (!isUpdate) { res.writeHead(404); res.end('Not found'); return; }

  let data;
  try {
    const body = await readBody(req);
    data = JSON.parse(body);
  } catch(e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'JSON invalide : ' + e.message }));
    return;
  }

  // 1. Écrire terrain-etapes.json
  try {
    fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.log('[API] ✅ terrain-etapes.json mis à jour');
  } catch(e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Écriture fichier : ' + e.message }));
    return;
  }

  // 2. Build Astro
  try {
    console.log('[API] 🔨 Build en cours...');
    await runCmd(BUILD_CMD);
    console.log('[API] ✅ Build terminé');
  } catch(e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Build échoué : ' + e.message }));
    return;
  }

  // 3. Deploy (optionnel — uniquement si deploy.bat existe et deploy=true dans la query)
  const deploy = req.url.includes('deploy=true');
  if (deploy && fs.existsSync(DEPLOY_CMD)) {
    console.log('[API] 🚀 Deploy en cours...');
    try {
      await runCmd('cmd.exe /c "' + DEPLOY_CMD + '"');
      console.log('[API] ✅ Deploy terminé');
    } catch(e) {
      // Deploy non bloquant — on répond OK mais on signale l'erreur
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, built: true, deployed: false, error: e.message }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, built: true, deployed: true }));
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, built: true, deployed: false }));
  }
});

server.listen(PORT, '127.0.0.1', function() {
  console.log('');
  console.log('  ✅ Admin API sur http://localhost:' + PORT);
  console.log('  📄 JSON cible : ' + JSON_PATH);
  console.log('  🔨 Build      : ' + BUILD_CMD);
  console.log('  🚀 Deploy     : deploy.bat (via ?deploy=true)');
  console.log('');
  console.log('  En attente de requêtes du panel admin...');
  console.log('');
});
