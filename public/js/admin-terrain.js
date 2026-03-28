// admin-terrain.js — Admin panel logic
// Data is passed from Astro via <script type="application/json" id="etapes-data">
(function() {
  'use strict';

  // ---- Read server-side data ----
  const etapesData = JSON.parse(document.getElementById('etapes-data').textContent);

  // ---- Config ----
  const PASS_HASH = '778fee1ef454204c1ef252ad7e72745eb2a8caca602c87d143c02340ed1da535';
  const STORAGE_KEY = 'op-terrain-admin';
  const STORAGE_GPX_KEY = 'op-terrain-gpx';
  const PUBLIC_KEY = 'op-terrain-public';

  let data = null;
  let gpxFiles = [];
  let currentGpxContent = null;
  let gpxMap = null;
  let gpxLayer = null;

  // ---- Helpers ----
  async function sha256(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function loadData() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        data = JSON.parse(saved);
      } catch {
        data = structuredClone(etapesData);
        return;
      }
      // Ensure etapes array exists
      if (!Array.isArray(data.etapes)) {
        data.etapes = structuredClone(etapesData.etapes || []);
      }
      // Merge missing étapes from JSON template (added after initial save)
      // Skips villes the user deliberately deleted (tracked in _deletedVilles)
      try {
        const templateEtapes = etapesData.etapes || [];
        const savedVilles = new Set(data.etapes.map(function(e) { return e.ville; }));
        const deletedVilles = new Set(data._deletedVilles || []);
        templateEtapes.forEach(function(te) {
          if (!savedVilles.has(te.ville) && !deletedVilles.has(te.ville)) {
            let insertIdx = data.etapes.length;
            for (let i = 0; i < data.etapes.length; i++) {
              if (data.etapes[i].id >= te.id) { insertIdx = i; break; }
            }
            data.etapes.splice(insertIdx, 0, structuredClone(te));
          }
        });
        data.etapes.forEach(function(e, i) { e.id = i + 1; });
      } catch { /* merge failed — keep saved data as-is */ }
      // Ensure essential objects exist
      if (!data.dashboard) data.dashboard = structuredClone(etapesData.dashboard || {});
      if (!data.positionActuelle) data.positionActuelle = structuredClone(etapesData.positionActuelle || {});
      if (!data.projet) data.projet = structuredClone(etapesData.projet || {});
      if (!data.journal) data.journal = [];
      return;
    }
    data = structuredClone(etapesData);
  }

  function loadGpx() {
    const saved = localStorage.getItem(STORAGE_GPX_KEY);
    if (saved) {
      try { gpxFiles = JSON.parse(saved); } catch { gpxFiles = []; }
    }
    // Migrate old entries: gpxContent (raw XML) → coords array (much smaller)
    let needsSave = false;
    gpxFiles.forEach(function(g) {
      if (g.coords) return; // already in new format
      if (g.gpxContent) {
        const pts = parseGpx(g.gpxContent);
        if (pts.length >= 2) {
          g.coords = pts.map(function(p) { return [p.lat, p.lng]; });
          delete g.gpxContent;
          needsSave = true;
        }
      }
    });
    if (needsSave) saveGpxData();
  }

  function saveData(silent) {
    try { collectDashboard(); } catch { /* keep existing dashboard */ }
    try { collectPosition(); } catch { /* keep existing position */ }
    data._lastSaved = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    updateLastSaved();
    if (!silent) showToast('Donn\u00e9es sauvegard\u00e9es dans le navigateur');
  }

  function updateLastSaved() {
    const el = document.getElementById('admin-last-saved');
    if (!el || !data._lastSaved) return;
    try {
      let d = new Date(data._lastSaved);
      el.textContent = 'Derni\u00e8re sauvegarde : ' + d.toLocaleString('fr-FR');
      el.style.display = 'block';
    } catch { /* skip */ }
  }

  function saveGpxData() {
    try {
      localStorage.setItem(STORAGE_GPX_KEY, JSON.stringify(gpxFiles));
    } catch {
      showToast('\u26a0 Fichier GPX trop volumineux pour le navigateur. R\u00e9duisez le nombre de points.');
    }
  }

  function cleanExportData() {
    // Strip internal admin fields before exporting to terrain-etapes.json
    const clean = structuredClone(data);
    delete clean._lastSaved;
    delete clean._deletedVilles;
    // Bake current visibility state into the build
    clean.isPublic = localStorage.getItem(PUBLIC_KEY) === '1';
    // Include GPX file references (path only, not coords — keeps JSON small)
    const gpxRaw = localStorage.getItem(STORAGE_GPX_KEY);
    if (gpxRaw) {
      try {
        const gpxArr = JSON.parse(gpxRaw);
        if (gpxArr?.length) {
          clean.gpxFiles = gpxArr.map(function(g) {
            let safeName = (g.name || 'track').replaceAll(/\s+/g, '_').replaceAll(/[^a-zA-Z0-9._-]/g, '');
            if (!safeName.toLowerCase().endsWith('.gpx')) safeName += '.gpx';
            return { name: g.name || 'Tracé', path: '/gpx/' + safeName, visible: g.visible !== false };
          });
        }
      } catch { /* ignore */ }
    }
    return clean;
  }

  function exportGpxFile() {
    if (!gpxFiles || gpxFiles.length === 0) {
      showToast('\u26a0 Aucun fichier GPX en mémoire — uploadez un fichier GPX d\'abord');
      return;
    }
    gpxFiles.forEach(function(g) {
      if (!g.coords || g.coords.length === 0) return;
      const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="OceanPhenix Admin" xmlns="http://www.topografix.com/GPX/1/1">',
        '  <trk><name>' + (g.name || 'Tracé') + '</name><trkseg>'
      ];
      g.coords.forEach(function(c) {
        lines.push('    <trkpt lat="' + c[0] + '" lon="' + c[1] + '"></trkpt>');
      });
      lines.push('  </trkseg></trk>', '</gpx>');
      const blob = new Blob([lines.join('\n')], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      let safeName = (g.name || 'track').replaceAll(/\s+/g, '_').replaceAll(/[^a-zA-Z0-9._-]/g, '');
      if (!safeName.toLowerCase().endsWith('.gpx')) safeName += '.gpx';
      a.download = safeName;
      a.click();
      URL.revokeObjectURL(url);
    });
    showToast('\u2705 GPX téléchargé \u2014 placez-le dans public/gpx/ puis relancez le build');
  }

  function exportJson(deploy) {
    const exportData = cleanExportData();
    const json = JSON.stringify(exportData, null, 2);
    const btn = document.getElementById(deploy ? 'export-deploy-btn' : 'export-btn');
    if (btn) { btn.disabled = true; btn.textContent = deploy ? '\u23f3 Build + Deploy...' : '\u23f3 Build en cours...'; }

    const endpoint = 'http://localhost:4399/update' + (deploy ? '?deploy=true' : '');
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    }).then(function(r) { return r.json(); }).then(function(result) {
      if (btn) { btn.disabled = false; btn.innerHTML = deploy
        ? '<i class="fas fa-rocket"></i> Build + Deploy'
        : '<i class="fas fa-file-export"></i> Exporter & Build'; }
      if (result.ok) {
        // Sync localStorage with the just-built data → tous les navigateurs voient la même chose
        try {
          const synced = JSON.parse(json);
          synced._lastSaved = new Date().toISOString();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(synced));
        } catch(_) {}
        const msg = result.deployed
          ? '\u2705 Build + deploy termin\u00e9 \u2014 tous les navigateurs sont synchronis\u00e9s \u2714'
          : '\u2705 Build termin\u00e9 \u2014 localStorage synchronis\u00e9 \u2714 \u2014 uploadez dist/ pour d\u00e9ployer';
        showToast(msg);
      } else {
        showToast('\u26a0\ufe0f ' + (result.error || 'Erreur inconnue'));
      }
    }).catch(function() {
      // Fallback : téléchargement si l'API n'est pas démarrée
      if (btn) { btn.disabled = false; btn.innerHTML = deploy
        ? '<i class="fas fa-rocket"></i> Build + Deploy'
        : '<i class="fas fa-file-export"></i> Exporter & Build'; }
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'terrain-etapes.json'; a.click();
      URL.revokeObjectURL(url);
      showToast('\u26a0\ufe0f API locale non d\u00e9marr\u00e9e (npm run api) \u2014 JSON t\u00e9l\u00e9charg\u00e9 manuellement');
    });
  }

  function exportJournalJson() {
    collectDashboard();
    collectPosition();
    const exportData = cleanExportData();
    const nbJournal = (exportData.journal || []).length;
    const json = JSON.stringify(exportData, null, 2);

    // Tente envoi direct vers l'API locale (node admin-api.cjs)
    let btn = document.getElementById('journal-export-btn');
    if (btn) { btn.disabled = true; btn.textContent = '\u23f3 Build en cours...'; }

    fetch('http://localhost:4399/update-journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json
    }).then(function(r) { return r.json(); }).then(function(result) {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-export"></i> Exporter Journal \u2192 terrain-etapes.json'; }
      if (result.ok) {
        try {
          const synced = JSON.parse(json);
          synced._lastSaved = new Date().toISOString();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(synced));
        } catch(_) {}
        showToast('\u2705 ' + nbJournal + ' entr\u00e9e(s) + build termin\u00e9 \u2014 localStorage synchronis\u00e9 \u2714');
      } else {
        showToast('\u26a0\ufe0f Erreur build : ' + result.error);
      }
    }).catch(function() {
      // API locale non d\u00e9marr\u00e9e — fallback : t\u00e9l\u00e9chargement
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-export"></i> Exporter Journal \u2192 terrain-etapes.json'; }
      let blob = new Blob([json], { type: 'application/json' });
      let url = URL.createObjectURL(blob);
      let a = document.createElement('a');
      a.href = url; a.download = 'terrain-etapes.json'; a.click();
      URL.revokeObjectURL(url);
      showToast('\u26a0\ufe0f API locale non d\u00e9marr\u00e9e (node admin-api.cjs) \u2014 JSON t\u00e9l\u00e9charg\u00e9 manuellement');
    });
  }

  function purgeRadarCache() {
    if (!confirm('Vider le cache serveur Radar ?\n\nSupprime tous les fichiers tmp/radar_*.json côté serveur (PHP/O2switch).\nLa prochaine recherche ira chercher des données fraîches.')) return;
    var secret = localStorage.getItem(ADMIN_SECRET_LS) || '';
    if (!secret) {
      secret = prompt('Clé d\'administration (même que pour Publier) :');
      if (!secret) return;
      localStorage.setItem(ADMIN_SECRET_LS, secret.trim());
    }
    var btn = document.getElementById('admin-purge-radar-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Purge…';
    fetch('/api/radar-proxy.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'purge-cache', secret: secret })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-server"></i> Cache Radar';
      if (data.ok) {
        showToast('✅ Cache Radar vidé — ' + data.deleted + ' fichier(s) supprimé(s)');
      } else {
        if (data.error && data.error.includes('refusé')) localStorage.removeItem(ADMIN_SECRET_LS);
        showToast('❌ Erreur : ' + (data.error || 'réponse inattendue'));
      }
    })
    .catch(function(err) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-server"></i> Cache Radar';
      showToast('❌ Erreur réseau : ' + err.message);
    });
  }

  function resetCache() {
    if (!confirm('Réinitialiser le cache local ?\n\nCela efface toutes les modifications non exportées de ce navigateur.\nUtilisez cette action APRÈS avoir exporté le JSON et fait un build.')) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_GPX_KEY);
    localStorage.removeItem('op-terrain-coworking');
    localStorage.removeItem('op-radar-entreprises');
    localStorage.removeItem('op-radar-salons');
    localStorage.removeItem('op-radar-events');
    localStorage.removeItem('op-radar-liens');
    showToast('\u2705 Cache local réinitialisé — les données viennent maintenant du build');
    setTimeout(function() { globalThis.location.reload(); }, 1200);
  }

  function updateVisibilityBtn() {
    let btn = document.getElementById('admin-visibility-btn');
    if (!btn) return;
    // Si aucune entrée localStorage, on initialise depuis la valeur baked du JSON
    if (localStorage.getItem(PUBLIC_KEY) === null) {
      if (etapesData.isPublic === true) {
        localStorage.setItem(PUBLIC_KEY, '1');
      }
    }
    const isPublic = localStorage.getItem(PUBLIC_KEY) === '1';
    btn.className = 'admin-visibility-btn ' + (isPublic ? 'is-public' : 'is-private');
  }

  function toggleVisibility() {
    const isPublic = localStorage.getItem(PUBLIC_KEY) === '1';
    if (isPublic) {
      localStorage.removeItem(PUBLIC_KEY);
      showToast('🔒 Page Terrain maintenant PRIVÉE — accessible uniquement via admin');
    } else {
      localStorage.setItem(PUBLIC_KEY, '1');
      showToast('🌍 Page Terrain maintenant PUBLIQUE — visible par tous les visiteurs');
    }
    updateVisibilityBtn();
  }

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'admin-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function() { toast.classList.add('admin-toast--show'); }, 10);
    setTimeout(function() {
      toast.classList.remove('admin-toast--show');
      setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
  }

  // ---- Captcha ----
  let captchaA, captchaB, captchaOp, captchaAnswer;
  function generateCaptcha() {
    captchaA = Math.floor(Math.random() * 10) + 1;
    captchaB = Math.floor(Math.random() * 10) + 1;
    captchaOp = Math.random() < 0.5 ? '+' : '-';
    if (captchaOp === '-' && captchaA < captchaB) { const t = captchaA; captchaA = captchaB; captchaB = t; }
    captchaAnswer = captchaOp === '+' ? captchaA + captchaB : captchaA - captchaB;
    document.getElementById('captcha-label').textContent = '\ud83d\udd12 V\u00e9rification : ' + captchaA + ' ' + captchaOp + ' ' + captchaB + ' = ?';
    document.getElementById('admin-captcha').value = '';
  }
  generateCaptcha();

  // ---- Auth ----
  const AUTH_SESSION_KEY = 'op-admin-auth';
  const AUTH_MAX_AGE = 3600000; // 1 hour
  const authEl = document.getElementById('admin-auth');
  const panelEl = document.getElementById('admin-panel');
  const passInput = document.getElementById('admin-pass');
  const captchaInput = document.getElementById('admin-captcha');
  const loginBtn = document.getElementById('admin-login-btn');
  const authError = document.getElementById('admin-auth-error');
  let failCount = 0;
  const MAX_ATTEMPTS = 5;
  let lockedUntil = 0;

  function isSessionValid() {
    let raw = sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return false;
    try {
      let sess = JSON.parse(raw);
      if (sess.v !== 2 || !sess.ts) return false;
      if (Date.now() - sess.ts > AUTH_MAX_AGE) { sessionStorage.removeItem(AUTH_SESSION_KEY); return false; }
      return true;
    } catch { sessionStorage.removeItem(AUTH_SESSION_KEY); return false; }
  }
  function setSession() {
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ v: 2, ts: Date.now() }));
  }

  if (isSessionValid()) {
    authEl.style.display = 'none';
    panelEl.style.display = 'block';
    init();
  }

  loginBtn.addEventListener('click', async function() {
    // Rate-limit
    if (Date.now() < lockedUntil) {
      let secs = Math.ceil((lockedUntil - Date.now()) / 1000);
      authError.textContent = 'Trop de tentatives \u2014 r\u00e9essayez dans ' + secs + 's';
      authError.style.display = 'block';
      return;
    }
    // Validate captcha
    let userCaptcha = Number.parseInt(captchaInput.value);
    if (Number.isNaN(userCaptcha) || userCaptcha !== captchaAnswer) {
      failCount++;
      authError.textContent = 'Captcha incorrect';
      authError.style.display = 'block';
      generateCaptcha();
      if (failCount >= MAX_ATTEMPTS) { lockedUntil = Date.now() + 30000; }
      return;
    }
    // Validate password
    let hash = await sha256(passInput.value);
    if (hash === PASS_HASH) {
      setSession();
      authEl.style.display = 'none';
      panelEl.style.display = 'block';
      authError.style.display = 'none';
      failCount = 0;
      init();
    } else {
      failCount++;
      authError.textContent = 'Mot de passe incorrect';
      authError.style.display = 'block';
      passInput.value = '';
      passInput.focus();
      generateCaptcha();
      if (failCount >= MAX_ATTEMPTS) { lockedUntil = Date.now() + 30000; }
    }
  });

  captchaInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') loginBtn.click();
  });
  passInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') captchaInput.focus();
  });

  // ---- Tabs ----
  document.querySelectorAll('.admin-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      // Auto-collect form data before switching tabs
      collectDashboard();
      collectPosition();
      document.querySelectorAll('.admin-tab').forEach(function(t) { t.classList.remove('admin-tab--active'); });
      document.querySelectorAll('.admin-tab-content').forEach(function(c) { c.classList.remove('admin-tab-content--active'); });
      tab.classList.add('admin-tab--active');
      let target = document.getElementById('tab-' + tab.dataset.tab);
      if (target) target.classList.add('admin-tab-content--active');
      if (tab.dataset.tab === 'preview') renderPreview();
      if (tab.dataset.tab === 'gpx' && !gpxMap) initGpxMap();
      if (tab.dataset.tab === 'villes' && !villesRendered) renderVilles('');
      if (tab.dataset.tab === 'coworking') renderCoworking();
      if (tab.dataset.tab === 'radar-pro') renderRadarProTab();
      if (tab.dataset.tab === 'liens-utiles') renderLiensUtiles();
    });
  });

  // ---- Villes de France ----
  const VILLES_FR = [
    {v:'Paris',r:'Île-de-France',lat:48.8566,lng:2.3522},
    {v:'Marseille',r:'Provence-Alpes-Côte d\'Azur',lat:43.2965,lng:5.3698},
    {v:'Lyon',r:'Auvergne-Rhône-Alpes',lat:45.764,lng:4.8357},
    {v:'Toulouse',r:'Occitanie',lat:43.6047,lng:1.4442},
    {v:'Nice',r:'Provence-Alpes-Côte d\'Azur',lat:43.7102,lng:7.262},
    {v:'Nantes',r:'Pays de la Loire',lat:47.2184,lng:-1.5536},
    {v:'Strasbourg',r:'Grand Est',lat:48.5734,lng:7.7521},
    {v:'Montpellier',r:'Occitanie',lat:43.6108,lng:3.8767},
    {v:'Bordeaux',r:'Nouvelle-Aquitaine',lat:44.8378,lng:-0.5792},
    {v:'Lille',r:'Hauts-de-France',lat:50.6292,lng:3.0573},
    {v:'Rennes',r:'Bretagne',lat:48.1173,lng:-1.6778},
    {v:'Reims',r:'Grand Est',lat:49.2583,lng:3.2794},
    {v:'Saint-Étienne',r:'Auvergne-Rhône-Alpes',lat:45.4397,lng:4.3872},
    {v:'Le Havre',r:'Normandie',lat:49.4944,lng:0.1079},
    {v:'Toulon',r:'Provence-Alpes-Côte d\'Azur',lat:43.1242,lng:5.928},
    {v:'Grenoble',r:'Auvergne-Rhône-Alpes',lat:45.1885,lng:5.7245},
    {v:'Dijon',r:'Bourgogne-Franche-Comté',lat:47.322,lng:5.0415},
    {v:'Angers',r:'Pays de la Loire',lat:47.4784,lng:-0.5632},
    {v:'Nîmes',r:'Occitanie',lat:43.8367,lng:4.3601},
    {v:'Villeurbanne',r:'Auvergne-Rhône-Alpes',lat:45.7667,lng:4.8799},
    {v:'Clermont-Ferrand',r:'Auvergne-Rhône-Alpes',lat:45.7772,lng:3.087},
    {v:'Aix-en-Provence',r:'Provence-Alpes-Côte d\'Azur',lat:43.5297,lng:5.4474},
    {v:'Brest',r:'Bretagne',lat:48.3904,lng:-4.4861},
    {v:'Tours',r:'Centre-Val de Loire',lat:47.3941,lng:0.6848},
    {v:'Limoges',r:'Nouvelle-Aquitaine',lat:45.8336,lng:1.2611},
    {v:'Amiens',r:'Hauts-de-France',lat:49.8941,lng:2.2958},
    {v:'Perpignan',r:'Occitanie',lat:42.6986,lng:2.8956},
    {v:'Metz',r:'Grand Est',lat:49.1193,lng:6.1757},
    {v:'Besançon',r:'Bourgogne-Franche-Comté',lat:47.2378,lng:6.0241},
    {v:'Orléans',r:'Centre-Val de Loire',lat:47.9029,lng:1.9093},
    {v:'Rouen',r:'Normandie',lat:49.4432,lng:1.0999},
    {v:'Mulhouse',r:'Grand Est',lat:47.7508,lng:7.3359},
    {v:'Caen',r:'Normandie',lat:49.1829,lng:-0.3707},
    {v:'Nancy',r:'Grand Est',lat:48.6921,lng:6.1844},
    {v:'Argenteuil',r:'Île-de-France',lat:48.9472,lng:2.2467},
    {v:'Saint-Denis',r:'Île-de-France',lat:48.9362,lng:2.3574},
    {v:'Montreuil',r:'Île-de-France',lat:48.8634,lng:2.4484},
    {v:'Pau',r:'Nouvelle-Aquitaine',lat:43.2951,lng:-0.3708},
    {v:'Calais',r:'Hauts-de-France',lat:50.9513,lng:1.8587},
    {v:'Dunkerque',r:'Hauts-de-France',lat:51.0343,lng:2.3768},
    {v:'La Rochelle',r:'Nouvelle-Aquitaine',lat:46.1603,lng:-1.1511},
    {v:'Avignon',r:'Provence-Alpes-Côte d\'Azur',lat:43.9493,lng:4.8055},
    {v:'Poitiers',r:'Nouvelle-Aquitaine',lat:46.5802,lng:0.3404},
    {v:'Antibes',r:'Provence-Alpes-Côte d\'Azur',lat:43.5808,lng:7.1239},
    {v:'Cannes',r:'Provence-Alpes-Côte d\'Azur',lat:43.5528,lng:7.0174},
    {v:'Béziers',r:'Occitanie',lat:43.3448,lng:3.215},
    {v:'Versailles',r:'Île-de-France',lat:48.8014,lng:2.1301},
    {v:'Le Mans',r:'Pays de la Loire',lat:48.0061,lng:0.1996},
    {v:'Ajaccio',r:'Corse',lat:41.9192,lng:8.7386},
    {v:'Bastia',r:'Corse',lat:42.6977,lng:9.4529},
    {v:'Bayonne',r:'Nouvelle-Aquitaine',lat:43.4929,lng:-1.4748},
    {v:'Boulogne-sur-Mer',r:'Hauts-de-France',lat:50.7264,lng:1.6147},
    {v:'Bourges',r:'Centre-Val de Loire',lat:47.081,lng:2.3988},
    {v:'Brive-la-Gaillarde',r:'Nouvelle-Aquitaine',lat:45.1587,lng:1.5321},
    {v:'Chambéry',r:'Auvergne-Rhône-Alpes',lat:45.5646,lng:5.9178},
    {v:'Chartres',r:'Centre-Val de Loire',lat:48.4561,lng:1.4832},
    {v:'Colmar',r:'Grand Est',lat:48.0794,lng:7.3584},
    {v:'Épinal',r:'Grand Est',lat:48.1727,lng:6.4511},
    {v:'Évreux',r:'Normandie',lat:49.027,lng:1.1508},
    {v:'La Roche-sur-Yon',r:'Pays de la Loire',lat:46.6706,lng:-1.4269},
    {v:'Laval',r:'Pays de la Loire',lat:48.0735,lng:-0.7714},
    {v:'Lorient',r:'Bretagne',lat:47.7482,lng:-3.3702},
    {v:'Quimper',r:'Bretagne',lat:47.996,lng:-4.0958},
    {v:'Sophia Antipolis',r:'Provence-Alpes-Côte d\'Azur',lat:43.6163,lng:7.0554},
    {v:'Saint-Malo',r:'Bretagne',lat:48.6493,lng:-1.999},
    {v:'Saint-Nazaire',r:'Pays de la Loire',lat:47.2736,lng:-2.2137},
    {v:'Tarbes',r:'Occitanie',lat:43.2328,lng:0.0781},
    {v:'Troyes',r:'Grand Est',lat:48.2973,lng:4.0744},
    {v:'Valence',r:'Auvergne-Rhône-Alpes',lat:44.9334,lng:4.8924},
    {v:'Vannes',r:'Bretagne',lat:47.6559,lng:-2.76}
  ];

  function markCopyBtn(btn) {
    btn.innerHTML = '<i class="fas fa-check"></i> Copi\u00e9!';
    setTimeout(function() { btn.innerHTML = '<i class="fas fa-copy"></i> Copier'; }, 1500);
  }

  let villesRendered = false;
  function renderVilles(filter) {
    const tbody = document.getElementById('villes-tbody');
    const count = document.getElementById('villes-count');
    if (!tbody) return;
    let q = (filter || '').toLowerCase().trim();
    let filtered = q ? VILLES_FR.filter(function(c) {
      return c.v.toLowerCase().includes(q) || c.r.toLowerCase().includes(q);
    }) : VILLES_FR;
    let html = '';
    filtered.forEach(function(c) {
      html += '<tr style="border-bottom:1px solid #262d38;">';
      html += '<td style="padding:8px 12px;font-weight:600;">' + c.v + '</td>';
      html += '<td style="padding:8px 12px;color:#aaa;">' + c.r + '</td>';
      html += '<td style="padding:8px 12px;text-align:center;font-family:monospace;">' + c.lat.toFixed(4) + '</td>';
      html += '<td style="padding:8px 12px;text-align:center;font-family:monospace;">' + c.lng.toFixed(4) + '</td>';
      html += '<td style="padding:8px 12px;text-align:center;">';
      html += '<button class="admin-btn admin-btn--primary" style="padding:4px 10px;font-size:0.8rem;" data-copy-coords="' + c.lat + ',' + c.lng + '" title="Copier lat,lng">';
      html += '<i class="fas fa-copy"></i> Copier</button></td>';
      html += '</tr>';
    });
    tbody.innerHTML = html;
    count.textContent = filtered.length + ' ville(s) affich\u00e9e(s) sur ' + VILLES_FR.length;
    // attach copy handlers
    tbody.querySelectorAll('[data-copy-coords]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const coords = btn.dataset.copyCoords;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(coords).then(function() { markCopyBtn(btn); });
        } else {
          globalThis.prompt('Coordonn\u00e9es :', coords);
        }
      });
    });
    villesRendered = true;
  }

  document.getElementById('villes-search').addEventListener('input', function() {
    renderVilles(this.value);
  });

  // ---- Coworking CRUD ----
  const CW_KEY = 'op-terrain-coworking';
  let cwData = [];

  function loadCoworking() {
    try { const raw = localStorage.getItem(CW_KEY); if (raw) cwData = JSON.parse(raw); } catch { cwData = []; }
  }
  function saveCoworking() {
    localStorage.setItem(CW_KEY, JSON.stringify(cwData));
    showToast('Coworking sauvegard\u00e9');
  }

  function renderCoworking() {
    const tbody = document.getElementById('cw-tbody');
    const count = document.getElementById('cw-count');
    if (!tbody) return;
    let html = '';
    cwData.forEach(function(cw, idx) {
      html += '<tr>';
      html += '<td style="text-align:center;font-weight:700;color:#d4845a;">' + (idx + 1) + '</td>';
      html += '<td style="font-weight:600;">' + (cw.nom || '') + '</td>';
      html += '<td style="color:#9ab0c4;">' + (cw.ville || '') + '</td>';
      html += '<td style="text-align:center;font-family:monospace;font-size:0.85rem;">' + (cw.lat || '') + '</td>';
      html += '<td style="text-align:center;font-family:monospace;font-size:0.85rem;">' + (cw.lng || '') + '</td>';
      html += '<td style="text-align:center;">' + (cw.visible === false ? '<i class="fas fa-eye-slash" style="color:#666;"></i>' : '<i class="fas fa-flag" style="color:#d4845a;"></i>') + '</td>';
      html += '<td style="text-align:center;white-space:nowrap;">';
      html += '<button class="admin-btn admin-btn--sm" data-cw-edit="' + idx + '" title="Modifier"><i class="fas fa-pen"></i></button> ';
      html += '<button class="admin-btn admin-btn--sm admin-btn--danger" data-cw-del="' + idx + '" title="Supprimer"><i class="fas fa-trash"></i></button>';
      html += '</td></tr>';
    });
    tbody.innerHTML = html;
    count.textContent = cwData.length + ' espace(s) de coworking';
    tbody.querySelectorAll('[data-cw-edit]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        openCwEditor(Number.parseInt(btn.dataset.cwEdit));
      });
    });
    tbody.querySelectorAll('[data-cw-del]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        let idx = Number.parseInt(btn.dataset.cwDel);
        const nom = cwData[idx] ? cwData[idx].nom : '';
        if (confirm('Supprimer "' + nom + '" ?')) {
          cwData.splice(idx, 1);
          saveCoworking();
          renderCoworking();
        }
      });
    });
  }

  function openCwEditor(idx) {
    const editor = document.getElementById('cw-editor');
    const cw = idx >= 0 ? cwData[idx] : null;
    document.getElementById('cw-edit-idx').value = idx;
    document.getElementById('cw-editor-title').textContent = cw ? 'Modifier : ' + cw.nom : 'Nouveau coworking';
    document.getElementById('cw-edit-nom').value = cw ? cw.nom || '' : '';
    document.getElementById('cw-edit-ville').value = cw ? cw.ville || '' : '';
    document.getElementById('cw-edit-adresse').value = cw ? cw.adresse || '' : '';
    document.getElementById('cw-edit-url').value = cw ? cw.url || '' : '';
    document.getElementById('cw-edit-lat').value = cw ? cw.lat || '' : '';
    document.getElementById('cw-edit-lng').value = cw ? cw.lng || '' : '';
    document.getElementById('cw-edit-visible').checked = cw ? cw.visible !== false : true;
    editor.style.display = 'block';
    editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  document.getElementById('cw-add-btn').addEventListener('click', function() {
    openCwEditor(-1);
  });

  document.getElementById('cw-save-btn').addEventListener('click', function() {
    let idx = Number.parseInt(document.getElementById('cw-edit-idx').value);
    let nom = document.getElementById('cw-edit-nom').value.trim();
    if (!nom) { alert('Le nom est obligatoire'); return; }
    let obj = {
      nom: nom,
      ville: document.getElementById('cw-edit-ville').value.trim(),
      adresse: document.getElementById('cw-edit-adresse').value.trim(),
      url: document.getElementById('cw-edit-url').value.trim(),
      lat: Number.parseFloat(document.getElementById('cw-edit-lat').value) || 0,
      lng: Number.parseFloat(document.getElementById('cw-edit-lng').value) || 0,
      visible: document.getElementById('cw-edit-visible').checked
    };
    if (idx >= 0 && idx < cwData.length) {
      Object.assign(cwData[idx], obj);
      showToast('Coworking modifi\u00e9');
    } else {
      cwData.push(obj);
      showToast('Coworking ajout\u00e9');
    }
    saveCoworking();
    document.getElementById('cw-editor').style.display = 'none';
    renderCoworking();
  });

  document.getElementById('cw-cancel-btn').addEventListener('click', function() {
    document.getElementById('cw-editor').style.display = 'none';
  });

  // Load coworking on init
  loadCoworking();
  // Pre-populate with common French coworking spaces if empty
  if (cwData.length === 0) {
    cwData = [
      {nom:'Station F',ville:'Paris',adresse:'5 Parvis Alan Turing, 75013',lat:48.8341,lng:2.3716,visible:true,url:'https://stationf.co'},
      {nom:'La Cord\u00e9e Libert\u00e9',ville:'Lyon',adresse:'2 Rue de Cond\u00e9, 69002',lat:45.758,lng:4.832,visible:true,url:'https://www.la-cordee.net'},
      {nom:'WeWork La Fayette',ville:'Paris',adresse:'33 Rue La Fayette, 75009',lat:48.8748,lng:2.3493,visible:true,url:'https://www.wework.com'},
      {nom:'La Cantine',ville:'Toulouse',adresse:'27 Rue d\'Aubuisson, 31000',lat:43.606,lng:1.45,visible:true,url:''},
      {nom:'Le Wagon',ville:'Marseille',adresse:'Place de la Joliette, 13002',lat:43.3049,lng:5.3652,visible:true,url:'https://www.lewagon.com'},
      {nom:'La Ruche',ville:'Bordeaux',adresse:'3 Rue du Chai des Farines, 33000',lat:44.8396,lng:-0.571,visible:true,url:'https://la-ruche.net'},
      {nom:'Le Palace',ville:'Nantes',adresse:'4 Rue Voltaire, 44000',lat:47.214,lng:-1.5564,visible:true,url:''},
      {nom:'La Plage Digitale',ville:'Strasbourg',adresse:'13 Rue Jacques Peirotes, 67000',lat:48.5818,lng:7.7365,visible:true,url:''},
      {nom:'Le 144 Coworking',ville:'Rennes',adresse:'144 Rue de Chateaugiron, 35000',lat:48.093,lng:-1.649,visible:true,url:''},
      {nom:'La French Tech',ville:'Nice',adresse:'61 Rte de Grenoble, 06200',lat:43.6835,lng:7.205,visible:true,url:''},
      {nom:'Blue Coworking',ville:'Montpellier',adresse:'296 Avenue du Mar\u00e9chal Leclerc, 34000',lat:43.6056,lng:3.876,visible:true,url:''},
      {nom:'Now Coworking',ville:'Lille',adresse:'1 Place Nelson Mandela, 59000',lat:50.6356,lng:3.0653,visible:true,url:'https://now-coworking.com'},
      {nom:'SophiaTech',ville:'Sophia Antipolis',adresse:'450 Route des Chappes, 06410',lat:43.6163,lng:7.0554,visible:true,url:''},
      {nom:'Le 107',ville:'Grenoble',adresse:'107 Avenue de la R\u00e9publique, 38000',lat:45.1812,lng:5.7245,visible:true,url:''},
      {nom:'La Miel',ville:'Dijon',adresse:'10 Rue de Soissons, 21000',lat:47.321,lng:5.04,visible:true,url:''},
      {nom:'Le Connecteur',ville:'Biarritz',adresse:'20 Av. Edouard VII, 64200',lat:43.4832,lng:-1.5586,visible:true,url:''},
      {nom:'La Coque',ville:'Reims',adresse:'3 Rue de Caron, 51100',lat:49.25,lng:3.29,visible:true,url:''},
      {nom:'Anticaf\u00e9',ville:'Paris',adresse:'79 Rue Quincampoix, 75003',lat:48.8622,lng:2.3515,visible:true,url:'https://www.anticafe.eu'},
      {nom:'Le Lawo',ville:'Caen',adresse:'12 Rue Basse, 14000',lat:49.1826,lng:-0.371,visible:true,url:''},
      {nom:'La Fabrique',ville:'Angers',adresse:'2 Quai Monge, 49000',lat:47.471,lng:-0.553,visible:true,url:''}
    ];
    saveCoworking();
  }

  // ---- Init ----
  function init() {
    loadData();
    loadGpx();
    populateDashboard();
    populatePosition();
    renderEtapes();
    renderJournal();
    renderPhotos();
    renderGpxList();
    bindTopbar();
    updateLastSaved();

    // Auto-save when leaving the page
    globalThis.addEventListener('beforeunload', function() {
      try { collectDashboard(); } catch { /* keep existing */ }
      try { collectPosition(); } catch { /* keep existing */ }
      data._lastSaved = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    });
  }

  function bindTopbar() {
    document.getElementById('admin-save-btn').addEventListener('click', function() {
      collectDashboard();
      collectPosition();
      saveData(true);
      showToast('\u2705 Tout sauvegard\u00e9 \u2014 Ouvrez /terrain/ pour voir les changements');
    });

    // Valider buttons per card
    document.getElementById('dash-validate-btn').addEventListener('click', function() {
      collectDashboard();
      collectPosition();
      saveData(true);
      showToast('\u2705 Dashboard + Position sauvegard\u00e9s \u2014 km:' + data.dashboard.kmParcourus + ' besoins:' + data.dashboard.besoinsIdentifies + ' statut:' + data.positionActuelle.statut);
    });
    document.getElementById('pos-validate-btn').addEventListener('click', function() {
      collectDashboard();
      collectPosition();
      saveData(true);
      showToast('\u2705 Dashboard + Position sauvegard\u00e9s \u2014 ville:' + data.positionActuelle.ville + ' statut:' + data.positionActuelle.statut);
    });

    ['export-btn', 'export-deploy-btn'].forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', function() {
        collectDashboard();
        collectPosition();
        exportJson(id === 'export-deploy-btn');
      });
    });
    var journalExportBtn = document.getElementById('journal-export-btn');
    if (journalExportBtn) journalExportBtn.addEventListener('click', function() {
      exportJournalJson();
    });
    document.getElementById('admin-import-btn').addEventListener('click', function() {
      document.getElementById('admin-import-file').click();
    });
    document.getElementById('admin-import-file').addEventListener('change', async function(e) {
      const file = e.target.files[0];
      if (!file) return;
      try {
        let text = await file.text();
        data = JSON.parse(text);
        saveData();
        populateDashboard();
        populatePosition();
        renderEtapes();
        renderJournal();
        renderPhotos();
        showToast('JSON import\u00e9 avec succ\u00e8s');
      } catch {
        showToast('Erreur : fichier JSON invalide');
      }
    });
  }

  // ---- Dashboard tab ----
  function populateDashboard() {
    const d = data.dashboard;
    document.getElementById('dash-km').value = d.kmParcourus;
    document.getElementById('dash-jours').value = d.joursRoute;
    document.getElementById('dash-besoins').value = d.besoinsIdentifies;
    document.getElementById('dash-rencontres').value = d.rencontresEntreprises;
    document.getElementById('dash-encours').value = d.etapeEnCours || '';
    document.getElementById('dash-joursprevus').value = d.joursPrevus;
    // Route info fields
    let p = data.projet || {};
    document.getElementById('dash-km-total').value = p.kmTotal || '';
    document.getElementById('dash-nb-etapes').value = p.nbEtapes || '';
    document.getElementById('dash-periode').value = p.periode || '';
    const sel = document.getElementById('dash-prochaine');
    sel.innerHTML = '<option value="">\u2014</option>';
    data.etapes.forEach(function(e) {
      let opt = document.createElement('option');
      opt.value = e.ville;
      opt.textContent = e.ville;
      if (e.ville === d.prochaineEtape) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function collectDashboard() {
    data.dashboard.kmParcourus = Number.parseInt(document.getElementById('dash-km').value) || 0;
    data.dashboard.joursRoute = Number.parseInt(document.getElementById('dash-jours').value) || 0;
    data.dashboard.besoinsIdentifies = Number.parseInt(document.getElementById('dash-besoins').value) || 0;
    data.dashboard.rencontresEntreprises = Number.parseInt(document.getElementById('dash-rencontres').value) || 0;
    data.dashboard.etapeEnCours = document.getElementById('dash-encours').value || null;
    data.dashboard.prochaineEtape = document.getElementById('dash-prochaine').value || null;
    data.dashboard.joursPrevus = Number.parseInt(document.getElementById('dash-joursprevus').value) || 0;
    // Route info fields
    if (!data.projet) data.projet = structuredClone(etapesData.projet || {});
    data.projet.kmTotal = document.getElementById('dash-km-total').value.trim() || '';
    data.projet.nbEtapes = Number.parseInt(document.getElementById('dash-nb-etapes').value) || 0;
    data.projet.periode = document.getElementById('dash-periode').value.trim() || '';
  }

  // ---- Position tab ----
  function populatePosition() {
    const p = data.positionActuelle;
    document.getElementById('pos-ville').value = p.ville;
    document.getElementById('pos-statut').value = p.statut;
    document.getElementById('pos-lat').value = p.lat;
    document.getElementById('pos-lng').value = p.lng;
    document.getElementById('pos-depart').value = p.dateDepart;
  }

  function collectPosition() {
    data.positionActuelle.ville = document.getElementById('pos-ville').value;
    data.positionActuelle.statut = document.getElementById('pos-statut').value;
    data.positionActuelle.lat = Number.parseFloat(document.getElementById('pos-lat').value) || 0;
    data.positionActuelle.lng = Number.parseFloat(document.getElementById('pos-lng').value) || 0;
    data.positionActuelle.dateDepart = document.getElementById('pos-depart').value;
  }

  // ---- Étapes tab ----
  function reindexEtapes() {
    data.etapes.forEach(function(e, i) { e.id = i + 1; });
  }

  function renderEtapes() {
    const list = document.getElementById('etapes-list');
    list.innerHTML = '';
    const statusIcons = { planifie: 'fa-circle', actuel: 'fa-location-dot', visite: 'fa-check-circle' };
    const statusLabels = { planifie: 'Planifi\u00e9', actuel: 'Actuel', visite: 'Visit\u00e9' };
    const statusColors = { planifie: '#1a6b8a', actuel: '#f59e0b', visite: '#22c55e' };
    let html = '';
    data.etapes.forEach(function(etape, idx) {
      const sc = statusColors[etape.statut] || '#1a6b8a';
      html += '<tr>';
      html += '<td style="text-align:center;font-weight:700;color:' + sc + ';">' + etape.id + '</td>';
      html += '<td style="font-weight:600;">' + etape.ville + '</td>';
      html += '<td style="color:#9ab0c4;">' + (etape.region || '') + '</td>';
      html += '<td style="text-align:center;">' + (etape.distanceDepuisDepart || 0) + '</td>';
      html += '<td style="text-align:center;white-space:nowrap;"><i class="fas ' + (statusIcons[etape.statut] || 'fa-circle') + '" style="color:' + sc + ';"></i> <span style="color:' + sc + ';font-weight:600;">' + (statusLabels[etape.statut] || etape.statut) + '</span></td>';
      html += '<td style="text-align:center;font-family:monospace;font-size:0.85rem;">' + (etape.lat || '') + '</td>';
      html += '<td style="text-align:center;font-family:monospace;font-size:0.85rem;">' + (etape.lng || '') + '</td>';
      const vis = etape.visible !== false;
      html += '<td style="text-align:center;"><label class="admin-gpx-toggle"><input type="checkbox" data-vis-idx="' + idx + '"' + (vis ? ' checked' : '') + ' /><span class="admin-gpx-switch"></span></label></td>';
      html += '<td style="text-align:center;white-space:nowrap;">';
      html += '<button class="admin-btn admin-btn--sm" data-edit="' + etape.id + '" title="Modifier"><i class="fas fa-pen"></i></button> ';
      html += '<button class="admin-btn admin-btn--sm admin-btn--danger" data-del-etape="' + idx + '" title="Supprimer"><i class="fas fa-trash"></i></button>';
      html += '</td></tr>';
    });
    list.innerHTML = html;
    list.querySelectorAll('[data-edit]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        openEtapeEditor(Number.parseInt(btn.dataset.edit));
      });
    });
    list.querySelectorAll('[data-vis-idx]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        const idx = Number.parseInt(cb.dataset.visIdx);
        if (data.etapes[idx]) {
          data.etapes[idx].visible = cb.checked;
          saveData(true);
          updateEtapesSummary();
        }
      });
    });
    updateEtapesSummary();
    list.querySelectorAll('[data-del-etape]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        let idx = Number.parseInt(btn.dataset.delEtape);
        let ville = data.etapes[idx] ? data.etapes[idx].ville : '';
        if (confirm('Supprimer l\'\u00e9tape "' + ville + '" ?')) {
          // Track deleted ville so the merge in loadData() doesn't re-add it
          if (!data._deletedVilles) data._deletedVilles = [];
          if (ville && !data._deletedVilles.includes(ville)) data._deletedVilles.push(ville);
          data.etapes.splice(idx, 1);
          reindexEtapes();
          renderEtapes();
          refreshProchaineSelect();
          saveData();
          showToast('\u00c9tape supprim\u00e9e');
        }
      });
    });
  }

  function updateEtapesSummary() {
    const el = document.getElementById('etapes-summary');
    if (!el) return;
    const total = data.etapes.length;
    let visible = 0, hidden = 0, actuel = 0, visite = 0, planifie = 0;
    data.etapes.forEach(function(e) {
      if (e.visible === false) { hidden++; } else { visible++; }
      if (e.statut === 'actuel') actuel++;
      else if (e.statut === 'visite') visite++;
      else planifie++;
    });
    const visibleVilles = data.etapes.filter(function(e) { return e.visible !== false; }).map(function(e) { return e.ville; });
    const hiddenBadge = hidden > 0 ? '<span class="summary-badge sb-hidden"><i class="fas fa-eye-slash"></i> ' + hidden + ' masqu\u00e9e' + (hidden > 1 ? 's' : '') + '</span>' : '';
    const actuelBadge = actuel > 0 ? '<span class="summary-badge sb-actuel"><i class="fas fa-location-dot"></i> ' + actuel + ' actuelle' + (actuel > 1 ? 's' : '') + '</span>' : '';
    const visiteBadge = visite > 0 ? '<span class="summary-badge sb-visite"><i class="fas fa-check-circle"></i> ' + visite + ' visit\u00e9e' + (visite > 1 ? 's' : '') + '</span>' : '';
    el.innerHTML =
      '<span class="summary-badge sb-total"><i class="fas fa-map-marked-alt"></i> ' + total + ' \u00e9tapes</span>' +
      '<span class="summary-badge sb-visible"><i class="fas fa-eye"></i> ' + visible + ' visible' + (visible > 1 ? 's' : '') + '</span>' +
      hiddenBadge +
      '<span class="summary-badge sb-planifie"><i class="fas fa-circle"></i> ' + planifie + ' planifi\u00e9e' + (planifie > 1 ? 's' : '') + '</span>' +
      actuelBadge +
      visiteBadge +
      '<br><span class="summary-itinerary"><i class="fas fa-route"></i> Itin\u00e9raire affich\u00e9 : <strong>' + visibleVilles.join(' \u2192 ') + '</strong></span>';
  }

  function openEtapeEditor(id) {
    const etape = id ? data.etapes.find(function(e) { return e.id === id; }) : null;
    document.getElementById('etape-editor').style.display = 'block';
    if (etape) {
      document.getElementById('etape-editor-title').textContent = 'Modifier \u2014 ' + etape.ville;
      document.getElementById('etape-edit-id').value = etape.id;
      document.getElementById('etape-edit-ville').value = etape.ville;
      document.getElementById('etape-edit-region').value = etape.region;
      document.getElementById('etape-edit-type').value = etape.type || 'etape';
      document.getElementById('etape-edit-statut').value = etape.statut;
      document.getElementById('etape-edit-dist').value = etape.distanceDepuisDepart;
      document.getElementById('etape-edit-lat').value = etape.lat;
      document.getElementById('etape-edit-lng').value = etape.lng;
      document.getElementById('etape-edit-date').value = etape.dateEstimee;
      document.getElementById('etape-edit-desc').value = etape.description;
    } else {
      document.getElementById('etape-editor-title').textContent = 'Nouvelle \u00e9tape';
      document.getElementById('etape-edit-id').value = '0';
      document.getElementById('etape-edit-ville').value = '';
      document.getElementById('etape-edit-region').value = '';
      document.getElementById('etape-edit-type').value = 'etape';
      document.getElementById('etape-edit-statut').value = 'planifie';
      document.getElementById('etape-edit-dist').value = '';
      document.getElementById('etape-edit-lat').value = '';
      document.getElementById('etape-edit-lng').value = '';
      document.getElementById('etape-edit-date').value = '';
      document.getElementById('etape-edit-desc').value = '';
    }
    document.getElementById('etape-editor').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Refresh only the prochaine-étape select without overwriting other dashboard inputs
  function refreshProchaineSelect() {
    const sel = document.getElementById('dash-prochaine');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">\u2014</option>';
    data.etapes.forEach(function(e) {
      const opt = document.createElement('option');
      opt.value = e.ville;
      opt.textContent = e.ville;
      if (e.ville === current) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  document.getElementById('etape-add-btn').addEventListener('click', function() {
    openEtapeEditor(0);
  });

  document.getElementById('etape-save-btn').addEventListener('click', function() {
    let id = Number.parseInt(document.getElementById('etape-edit-id').value);
    let ville = document.getElementById('etape-edit-ville').value.trim();
    if (!ville) { showToast('Le nom de la ville est obligatoire'); return; }
    let fields = {
      ville: ville,
      region: document.getElementById('etape-edit-region').value.trim(),
      type: document.getElementById('etape-edit-type').value || 'etape',
      statut: document.getElementById('etape-edit-statut').value,
      distanceDepuisDepart: Number.parseInt(document.getElementById('etape-edit-dist').value) || 0,
      lat: Number.parseFloat(document.getElementById('etape-edit-lat').value) || 0,
      lng: Number.parseFloat(document.getElementById('etape-edit-lng').value) || 0,
      dateEstimee: document.getElementById('etape-edit-date').value,
      description: document.getElementById('etape-edit-desc').value.trim(),
    };
    if (id === 0) {
      let newId = data.etapes.length > 0 ? Math.max.apply(null, data.etapes.map(function(e){ return e.id; })) + 1 : 1;
      fields.id = newId;
      // Remove from _deletedVilles if re-adding a previously deleted ville
      if (data._deletedVilles) {
        data._deletedVilles = data._deletedVilles.filter(function(v) { return v !== ville; });
      }
      data.etapes.push(fields);
      showToast('Nouvelle \u00e9tape ajout\u00e9e : ' + ville);
    } else {
      let etape = data.etapes.find(function(e) { return e.id === id; });
      if (!etape) { showToast('\u26a0 \u00c9tape introuvable (id ' + id + ')'); return; }
      Object.assign(etape, fields);
      showToast('\u00c9tape mise \u00e0 jour');
    }
    document.getElementById('etape-editor').style.display = 'none';
    renderEtapes();
    refreshProchaineSelect();
    saveData();
  });

  document.getElementById('etape-cancel-btn').addEventListener('click', function() {
    document.getElementById('etape-editor').style.display = 'none';
  });

  // ---- Journal tab ----
  function renderJournal() {
    const list = document.getElementById('journal-list');
    list.innerHTML = '';
    if (!data.journal || data.journal.length === 0) {
      list.innerHTML = '<p class="admin-hint">Aucune entr\u00e9e de journal.</p>';
      return;
    }
    data.journal.slice().reverse().forEach(function(entry, idx) {
      let realIdx = data.journal.length - 1 - idx;
      const div = document.createElement('div');
      div.className = 'admin-journal-item';
      div.innerHTML =
        '<div class="admin-journal-head">' +
        '<strong>' + entry.date + ' \u2014 ' + entry.ville + '</strong>' +
        '<button class="admin-btn admin-btn--sm admin-btn--danger" data-del-journal="' + realIdx + '">' +
        '<i class="fas fa-trash"></i>' +
        '</button>' +
        '</div>' +
        '<h4>' + entry.titre + '</h4>' +
        '<p>' + entry.contenu + '</p>' +
        '<div class="admin-journal-tags">' +
        entry.tags.map(function(t) { return '<span class="admin-tag">' + t + '</span>'; }).join(' ') +
        '</div>';
      list.appendChild(div);
    });
    list.querySelectorAll('[data-del-journal]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        let idx = Number.parseInt(btn.dataset.delJournal);
        if (confirm('Supprimer cette entr\u00e9e du journal ?')) {
          data.journal.splice(idx, 1);
          renderJournal();
          saveData();
        }
      });
    });
  }

  document.getElementById('journal-add-btn').addEventListener('click', function() {
    let date = document.getElementById('journal-date').value;
    let ville = document.getElementById('journal-ville').value;
    let titre = document.getElementById('journal-titre').value;
    let contenu = document.getElementById('journal-contenu').value;
    let tagsRaw = document.getElementById('journal-tags').value;
    if (!date || !titre || !contenu) {
      showToast('Remplissez au minimum la date, le titre et le contenu');
      return;
    }
    let tags = tagsRaw.split(',').map(function(t) { return t.trim(); }).filter(Boolean);
    data.journal.push({ date: date, ville: ville, titre: titre, contenu: contenu, tags: tags });
    renderJournal();
    saveData();
    document.getElementById('journal-date').value = '';
    document.getElementById('journal-ville').value = '';
    document.getElementById('journal-titre').value = '';
    document.getElementById('journal-contenu').value = '';
    document.getElementById('journal-tags').value = '';
    showToast('Entr\u00e9e ajout\u00e9e au journal');
  });

  // ---- Photos tab (CSP-safe: no inline onerror) ----
  function renderPhotos() {
    const grid = document.getElementById('photos-grid');
    grid.innerHTML = '';
    const photos = data.dashboard.photos || [];
    if (photos.length === 0) {
      grid.innerHTML = '<p class="admin-hint">Aucune photo enregistr\u00e9e.</p>';
      return;
    }
    photos.forEach(function(src, idx) {
      const div = document.createElement('div');
      div.className = 'admin-photo-item';
      const img = document.createElement('img');
      img.src = src;
      img.alt = 'Photo terrain';
      img.addEventListener('error', function() {
        this.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23142038" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%234db8d4" font-size="12">No img</text></svg>';
      });
      const overlay = document.createElement('div');
      overlay.className = 'admin-photo-overlay';
      const code = document.createElement('code');
      code.textContent = src;
      const delBtn = document.createElement('button');
      delBtn.className = 'admin-btn admin-btn--sm admin-btn--danger';
      delBtn.dataset.delPhoto = idx;
      delBtn.innerHTML = '<i class="fas fa-trash"></i>';
      overlay.appendChild(code);
      overlay.appendChild(delBtn);
      div.appendChild(img);
      div.appendChild(overlay);
      grid.appendChild(div);
    });
    grid.querySelectorAll('[data-del-photo]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        let idx = Number.parseInt(btn.dataset.delPhoto);
        data.dashboard.photos.splice(idx, 1);
        renderPhotos();
        saveData();
      });
    });
  }

  let selectedPhotoBlob = null;
  let selectedPhotoName = null;

  document.getElementById('photo-file-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    selectedPhotoBlob = file;
    selectedPhotoName = file.name.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
    const previewUrl = URL.createObjectURL(file);
    document.getElementById('photo-preview').style.display = 'flex';
    document.getElementById('photo-preview-img').src = previewUrl;
    document.getElementById('photo-preview-name').textContent = selectedPhotoName;
    document.getElementById('photo-preview-path').textContent = '/Images/terrain/' + selectedPhotoName;
    document.getElementById('photo-path-input').value = '/Images/terrain/' + selectedPhotoName;
    document.getElementById('photo-download-btn').style.display = 'inline-flex';
  });

  document.getElementById('photo-download-btn').addEventListener('click', function() {
    if (!selectedPhotoBlob) return;
    const url = URL.createObjectURL(selectedPhotoBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedPhotoName;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Photo t\u00e9l\u00e9charg\u00e9e \u2014 uploadez-la dans /Images/terrain/ sur O2switch');
  });

  document.getElementById('photo-add-btn').addEventListener('click', function() {
    let path = document.getElementById('photo-path-input').value.trim();
    if (!path) {
      showToast('Entrez un chemin pour la photo');
      return;
    }
    if (!data.dashboard.photos) data.dashboard.photos = [];
    data.dashboard.photos.push(path);
    renderPhotos();
    saveData();
    document.getElementById('photo-file-input').value = '';
    document.getElementById('photo-path-input').value = '';
    document.getElementById('photo-preview').style.display = 'none';
    document.getElementById('photo-download-btn').style.display = 'none';
    selectedPhotoBlob = null;
    selectedPhotoName = null;
    showToast('Photo ajout\u00e9e');
  });

  // ---- GPX tab ----
  function initGpxMap() {
    const el = document.getElementById('gpx-map');
    el.style.display = 'block';
    gpxMap = L.map('gpx-map', { scrollWheelZoom: true }).setView([46.6, 2.8], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(gpxMap);
    data.etapes.forEach(function(etape) {
      L.circleMarker([etape.lat, etape.lng], {
        radius: 5, fillColor: '#4db8d4', color: '#fff', weight: 1.5, opacity: 0.8, fillOpacity: 0.7,
      }).addTo(gpxMap).bindTooltip(etape.ville);
    });
    setTimeout(function() { gpxMap.invalidateSize(); }, 200);
  }

  // Namespace-safe GPX parser (handles Garmin, Strava, Komoot, etc.)
  function parseGpx(xmlStr) {
    const doc = new DOMParser().parseFromString(xmlStr, 'application/xml');
    if (doc.querySelector('parsererror')) return [];
    const points = [];
    let trkpts = doc.getElementsByTagNameNS('*', 'trkpt');
    if (trkpts.length === 0) trkpts = doc.getElementsByTagNameNS('*', 'rtept');
    if (trkpts.length === 0) trkpts = doc.getElementsByTagNameNS('*', 'wpt');
    for (const trkpt of trkpts) {
      const lat = Number.parseFloat(trkpt.getAttribute('lat'));
      const lon = Number.parseFloat(trkpt.getAttribute('lon'));
      const eleEls = trkpt.getElementsByTagNameNS('*', 'ele');
      const ele = eleEls.length > 0 ? Number.parseFloat(eleEls[0].textContent) : null;
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) points.push({ lat: lat, lng: lon, ele: ele });
    }
    return points;
  }

  function calcDistance(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      let R = 6371;
      let dLat = (points[i].lat - points[i-1].lat) * Math.PI / 180;
      let dLon = (points[i].lng - points[i-1].lng) * Math.PI / 180;
      let a = Math.sin(dLat/2)*Math.sin(dLat/2) +
              Math.cos(points[i-1].lat*Math.PI/180)*Math.cos(points[i].lat*Math.PI/180)*
              Math.sin(dLon/2)*Math.sin(dLon/2);
      total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
    return total;
  }

  function calcElevation(points) {
    let gain = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].ele !== null && points[i-1].ele !== null) {
        let diff = points[i].ele - points[i-1].ele;
        if (diff > 0) gain += diff;
      }
    }
    return gain;
  }

  document.getElementById('gpx-file-input').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    currentGpxContent = await file.text();
    let points = parseGpx(currentGpxContent);
    if (points.length === 0) {
      showToast('Aucun point GPS trouv\u00e9 dans ce fichier');
      return;
    }

    document.getElementById('gpx-info').style.display = 'block';
    document.getElementById('gpx-actions').style.display = 'flex';
    document.getElementById('gpx-filename').value = file.name;
    document.getElementById('gpx-points').value = points.length + ' points';
    document.getElementById('gpx-distance').value = calcDistance(points).toFixed(1) + ' km';
    document.getElementById('gpx-elevation').value = Math.round(calcElevation(points)) + ' m D+';

    if (!gpxMap) initGpxMap();
    if (gpxLayer) gpxMap.removeLayer(gpxLayer);
    const coords = points.map(function(p) { return [p.lat, p.lng]; });
    gpxLayer = L.polyline(coords, { color: '#f59e0b', weight: 3.5, opacity: 0.85 }).addTo(gpxMap);
    gpxMap.fitBounds(gpxLayer.getBounds(), { padding: [30, 30] });
  });

  document.getElementById('gpx-download-btn').addEventListener('click', function() {
    if (!currentGpxContent) return;
    let name = document.getElementById('gpx-filename').value || 'parcours.gpx';
    const blob = new Blob([currentGpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('gpx-add-btn').addEventListener('click', function() {
    if (!currentGpxContent) return;
    let name = document.getElementById('gpx-filename').value || 'parcours.gpx';
    let points = parseGpx(currentGpxContent);
    if (points.length < 2) {
      showToast('\u26a0 Aucun point GPS valide trouv\u00e9 dans ce fichier');
      return;
    }
    // Store coords array only (NOT raw XML) to avoid localStorage quota errors
    const coords = points.map(function(p) { return [p.lat, p.lng]; });
    gpxFiles.push({
      name: name,
      date: new Date().toISOString().split('T')[0],
      points: coords.length,
      distance: calcDistance(points).toFixed(1) + ' km',
      elevation: Math.round(calcElevation(points)) + ' m D+',
      visible: true,
      coords: coords,
    });
    saveGpxData();
    renderGpxList();
    showToast('\u2705 GPX ajout\u00e9 (' + coords.length + ' points) — visible sur /terrain');
  });

  function showGpxOnMap(idx) {
    const g = gpxFiles[idx];
    if (!g) return;
    let coords = null;
    if (g.coords && g.coords.length >= 2) {
      coords = g.coords;
    } else if (g.gpxContent) {
      const pts = parseGpx(g.gpxContent);
      coords = pts.map(function(p) { return [p.lat, p.lng]; });
    }
    if (!coords || coords.length < 2) { showToast('Pas de coordonn\u00e9es pour ce fichier'); return; }
    if (!gpxMap) initGpxMap();
    if (gpxLayer) gpxMap.removeLayer(gpxLayer);
    gpxLayer = L.polyline(coords, { color: '#f59e0b', weight: 3.5, opacity: 0.85 }).addTo(gpxMap);
    gpxMap.fitBounds(gpxLayer.getBounds(), { padding: [30, 30] });
  }

  function renderGpxList() {
    const list = document.getElementById('gpx-list');
    list.innerHTML = '';
    if (gpxFiles.length === 0) {
      list.innerHTML = '<p class="admin-hint">Aucun fichier GPX enregistr\u00e9.</p>';
      return;
    }
    gpxFiles.forEach(function(g, idx) {
      const div = document.createElement('div');
      div.className = 'admin-gpx-item';
      const visChecked = g.visible === false ? '' : ' checked';
      div.innerHTML =
        '<label class="admin-gpx-toggle" title="Afficher/masquer sur la carte Terrain">' +
        '<input type="checkbox" data-gpx-vis="' + idx + '"' + visChecked + ' />' +
        '<span class="admin-gpx-switch"></span>' +
        '</label>' +
        '<div class="admin-gpx-item-info">' +
        '<strong><i class="fas fa-route"></i> ' + g.name + '</strong>' +
        '<span>' + g.date + ' \u2014 ' + g.points + ' pts \u2014 ' + g.distance + ' \u2014 ' + g.elevation + '</span>' +
        '</div>' +
        '<div class="admin-gpx-item-actions">' +
        '<button class="admin-btn admin-btn--sm admin-btn--secondary" data-show-gpx="' + idx + '" title="Voir sur la carte">' +
        '<i class="fas fa-eye"></i>' +
        '</button>' +
        '<button class="admin-btn admin-btn--sm admin-btn--danger" data-del-gpx="' + idx + '" title="Supprimer">' +
        '<i class="fas fa-trash"></i>' +
        '</button>' +
        '</div>';
      list.appendChild(div);
    });
    // Toggle visibility
    list.querySelectorAll('[data-gpx-vis]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        const idx = Number.parseInt(cb.dataset.gpxVis);
        gpxFiles[idx].visible = cb.checked;
        saveGpxData();
      });
    });
    // Show on admin map
    list.querySelectorAll('[data-show-gpx]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        showGpxOnMap(Number.parseInt(btn.dataset.showGpx));
      });
    });
    // Delete
    list.querySelectorAll('[data-del-gpx]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const idx = Number.parseInt(btn.dataset.delGpx);
        gpxFiles.splice(idx, 1);
        saveGpxData();
        renderGpxList();
      });
    });
  }

  // ---- Preview tab ----
  function renderPreview() {
    collectDashboard();
    collectPosition();
    document.getElementById('preview-json').textContent = JSON.stringify(data, null, 2);
  }

  document.getElementById('preview-copy-btn').addEventListener('click', function() {
    collectDashboard();
    collectPosition();
    navigator.clipboard.writeText(JSON.stringify(cleanExportData(), null, 2)).then(function() {
      showToast('JSON copi\u00e9 dans le presse-papier');
    });
  });

  document.getElementById('preview-export-btn').addEventListener('click', function() {
    collectDashboard();
    collectPosition();
    exportJson();
  });

  document.getElementById('admin-reset-cache-btn').addEventListener('click', function() {
    resetCache();
  });

  document.getElementById('admin-purge-radar-btn').addEventListener('click', function() {
    purgeRadarCache();
  });

  document.getElementById('admin-export-gpx-btn').addEventListener('click', function() {
    exportGpxFile();
  });

  document.getElementById('admin-visibility-btn').addEventListener('click', function() {
    toggleVisibility();
  });
  updateVisibilityBtn();

  // ═══════════════════════════════════════════════════════════
  // TAB: Radar Pro — Entreprises / Salons / Événements
  // ═══════════════════════════════════════════════════════════
  var RP_ENT_KEY    = 'op-radar-entreprises';
  var RP_SALONS_KEY = 'op-radar-salons';
  var RP_EVT_KEY    = 'op-radar-events';

  var rpEnts   = [];
  var rpSalons = [];
  var rpEvts   = [];

  function loadRpData() {
    try { rpEnts   = JSON.parse(localStorage.getItem(RP_ENT_KEY)    || '[]'); } catch(e) { rpEnts   = []; }
    try { rpSalons = JSON.parse(localStorage.getItem(RP_SALONS_KEY) || '[]'); } catch(e) { rpSalons = []; }
    try { rpEvts   = JSON.parse(localStorage.getItem(RP_EVT_KEY)    || '[]'); } catch(e) { rpEvts   = []; }
  }

  function saveRpKey(key, data, label) {
    localStorage.setItem(key, JSON.stringify(data));
    showToast(label + ' sauvegardé(s)');
  }

  function renderRadarProTab() {
    loadRpData();
    renderRpEnts();
    renderRpSalons();
    renderRpEvts();
  }

  // ── Entreprises ──────────────────────────────────────────
  function renderRpEnts() {
    var tbody = document.getElementById('rp-ent-tbody');
    var count = document.getElementById('rp-ent-count');
    if (!tbody) return;
    var html = '';
    rpEnts.forEach(function(e, idx) {
      html += '<tr>';
      html += '<td style="font-weight:600;">' + (e.nom || '') + '</td>';
      html += '<td style="color:#9ab0c4;">' + (e.ville || '') + '</td>';
      html += '<td style="color:#9ab0c4;">' + (e.secteur || '') + '</td>';
      html += '<td style="text-align:center;white-space:nowrap;">';
      html += '<button class="admin-btn admin-btn--sm" data-rp-ent-edit="' + idx + '" title="Modifier"><i class="fas fa-pen"></i></button> ';
      html += '<button class="admin-btn admin-btn--sm admin-btn--danger" data-rp-ent-del="' + idx + '" title="Supprimer"><i class="fas fa-trash"></i></button>';
      html += '</td></tr>';
    });
    if (!html) html = '<tr><td colspan="4" style="color:#666;padding:12px;text-align:center;">Aucune entreprise — cliquez sur Ajouter.</td></tr>';
    tbody.innerHTML = html;
    if (count) count.textContent = rpEnts.length + ' entreprise(s)';
    tbody.querySelectorAll('[data-rp-ent-edit]').forEach(function(btn) {
      btn.addEventListener('click', function() { openRpEntEditor(+btn.dataset.rpEntEdit); });
    });
    tbody.querySelectorAll('[data-rp-ent-del]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx2 = +btn.dataset.rpEntDel;
        if (confirm('Supprimer "' + (rpEnts[idx2] ? rpEnts[idx2].nom : '') + '" ?')) {
          rpEnts.splice(idx2, 1);
          saveRpKey(RP_ENT_KEY, rpEnts, 'Entreprise supprimée');
          renderRpEnts();
        }
      });
    });
  }

  function openRpEntEditor(idx) {
    var e = (idx >= 0 && idx < rpEnts.length) ? rpEnts[idx] : null;
    document.getElementById('rp-ent-edit-idx').value  = idx;
    document.getElementById('rp-ent-editor-title').textContent = e ? 'Modifier : ' + e.nom : 'Nouvelle entreprise';
    document.getElementById('rp-ent-nom').value     = e ? (e.nom     || '') : '';
    document.getElementById('rp-ent-ville').value   = e ? (e.ville   || '') : '';
    document.getElementById('rp-ent-url').value     = e ? (e.url     || '') : '';
    document.getElementById('rp-ent-secteur').value = e ? (e.secteur || 'data') : 'data';
    var ed = document.getElementById('rp-ent-editor');
    ed.style.display = 'block';
    ed.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  (function() {
    var addBtn    = document.getElementById('rp-ent-add-btn');
    var saveBtn   = document.getElementById('rp-ent-save-btn');
    var cancelBtn = document.getElementById('rp-ent-cancel-btn');
    if (addBtn)    addBtn.addEventListener('click', function() { openRpEntEditor(-1); });
    if (cancelBtn) cancelBtn.addEventListener('click', function() { document.getElementById('rp-ent-editor').style.display = 'none'; });
    if (saveBtn)   saveBtn.addEventListener('click', function() {
      var idx = +document.getElementById('rp-ent-edit-idx').value;
      var nom = document.getElementById('rp-ent-nom').value.trim();
      if (!nom) { alert('Le nom est obligatoire'); return; }
      var existing = (idx >= 0 && idx < rpEnts.length) ? rpEnts[idx] : null;
      var obj = {
        id:      existing ? existing.id : 'admin-ent-' + Date.now(),
        nom:     nom,
        ville:   document.getElementById('rp-ent-ville').value.trim(),
        url:     document.getElementById('rp-ent-url').value.trim(),
        secteur: document.getElementById('rp-ent-secteur').value,
        source:  'Admin',
        type:    'entreprise'
      };
      if (existing) { Object.assign(rpEnts[idx], obj); showToast('Entreprise modifiée'); }
      else           { rpEnts.push(obj);                showToast('Entreprise ajoutée'); }
      saveRpKey(RP_ENT_KEY, rpEnts, 'Entreprises');
      document.getElementById('rp-ent-editor').style.display = 'none';
      renderRpEnts();
    });
  })();

  // ── Salons ───────────────────────────────────────────────
  function renderRpSalons() {
    var tbody = document.getElementById('rp-sal-tbody');
    var count = document.getElementById('rp-sal-count');
    if (!tbody) return;
    var html = '';
    rpSalons.forEach(function(s, idx) {
      html += '<tr>';
      html += '<td style="font-weight:600;">' + (s.nom || '') + '</td>';
      html += '<td style="color:#9ab0c4;">' + (s.dateDebut || '—') + '</td>';
      html += '<td style="color:#9ab0c4;">' + (s.adresse || '—') + '</td>';
      html += '<td style="color:#9ab0c4;">' + (s.format || '—') + '</td>';
      html += '<td style="text-align:center;white-space:nowrap;">';
      html += '<button class="admin-btn admin-btn--sm" data-rp-sal-edit="' + idx + '" title="Modifier"><i class="fas fa-pen"></i></button> ';
      html += '<button class="admin-btn admin-btn--sm admin-btn--danger" data-rp-sal-del="' + idx + '" title="Supprimer"><i class="fas fa-trash"></i></button>';
      html += '</td></tr>';
    });
    if (!html) html = '<tr><td colspan="5" style="color:#666;padding:12px;text-align:center;">Aucun salon — cliquez sur Ajouter.</td></tr>';
    tbody.innerHTML = html;
    if (count) count.textContent = rpSalons.length + ' salon(s)';
    tbody.querySelectorAll('[data-rp-sal-edit]').forEach(function(btn) {
      btn.addEventListener('click', function() { openRpSalEditor(+btn.dataset.rpSalEdit); });
    });
    tbody.querySelectorAll('[data-rp-sal-del]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx2 = +btn.dataset.rpSalDel;
        if (confirm('Supprimer "' + (rpSalons[idx2] ? rpSalons[idx2].nom : '') + '" ?')) {
          rpSalons.splice(idx2, 1);
          saveRpKey(RP_SALONS_KEY, rpSalons, 'Salon supprimé');
          renderRpSalons();
        }
      });
    });
  }

  function openRpSalEditor(idx) {
    var s = (idx >= 0 && idx < rpSalons.length) ? rpSalons[idx] : null;
    document.getElementById('rp-sal-edit-idx').value   = idx;
    document.getElementById('rp-sal-editor-title').textContent = s ? 'Modifier : ' + s.nom : 'Nouveau salon';
    document.getElementById('rp-sal-nom').value     = s ? (s.nom      || '') : '';
    document.getElementById('rp-sal-date').value    = s ? (s.dateDebut || '') : '';
    document.getElementById('rp-sal-adresse').value = s ? (s.adresse  || '') : '';
    document.getElementById('rp-sal-url').value     = s ? (s.url      || '') : '';
    document.getElementById('rp-sal-format').value  = s ? (s.format   || 'presentiel') : 'presentiel';
    var doms = s ? (s.domaines || []) : [];
    document.querySelectorAll('#rp-sal-domaines input[type=checkbox]').forEach(function(cb) {
      cb.checked = doms.indexOf(cb.value) !== -1;
    });
    var ed = document.getElementById('rp-sal-editor');
    ed.style.display = 'block';
    ed.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  (function() {
    var addBtn    = document.getElementById('rp-sal-add-btn');
    var saveBtn   = document.getElementById('rp-sal-save-btn');
    var cancelBtn = document.getElementById('rp-sal-cancel-btn');
    if (addBtn)    addBtn.addEventListener('click', function() { openRpSalEditor(-1); });
    if (cancelBtn) cancelBtn.addEventListener('click', function() { document.getElementById('rp-sal-editor').style.display = 'none'; });
    if (saveBtn)   saveBtn.addEventListener('click', function() {
      var idx = +document.getElementById('rp-sal-edit-idx').value;
      var nom = document.getElementById('rp-sal-nom').value.trim();
      if (!nom) { alert('Le nom est obligatoire'); return; }
      var doms = [];
      document.querySelectorAll('#rp-sal-domaines input[type=checkbox]:checked').forEach(function(cb) { doms.push(cb.value); });
      var existing = (idx >= 0 && idx < rpSalons.length) ? rpSalons[idx] : null;
      var obj = {
        id:        existing ? existing.id : 'admin-sal-' + Date.now(),
        nom:       nom,
        dateDebut: document.getElementById('rp-sal-date').value || null,
        adresse:   document.getElementById('rp-sal-adresse').value.trim(),
        url:       document.getElementById('rp-sal-url').value.trim(),
        format:    document.getElementById('rp-sal-format').value,
        domaines:  doms.length ? doms : ['data'],
        source:    'Admin'
      };
      if (existing) { Object.assign(rpSalons[idx], obj); showToast('Salon modifié'); }
      else           { rpSalons.push(obj);                showToast('Salon ajouté'); }
      saveRpKey(RP_SALONS_KEY, rpSalons, 'Salons');
      document.getElementById('rp-sal-editor').style.display = 'none';
      renderRpSalons();
    });
  })();

  // ── Événements ───────────────────────────────────────────
  function renderRpEvts() {
    var tbody = document.getElementById('rp-evt-tbody');
    var count = document.getElementById('rp-evt-count');
    if (!tbody) return;
    var html = '';
    rpEvts.forEach(function(e, idx) {
      html += '<tr>';
      html += '<td style="font-weight:600;">' + (e.nom || '') + '</td>';
      html += '<td style="color:#9ab0c4;">' + (e.dateDebut || '—') + '</td>';
      html += '<td style="color:#9ab0c4;">' + (e.adresse || '—') + '</td>';
      html += '<td style="text-align:center;white-space:nowrap;">';
      html += '<button class="admin-btn admin-btn--sm" data-rp-evt-edit="' + idx + '" title="Modifier"><i class="fas fa-pen"></i></button> ';
      html += '<button class="admin-btn admin-btn--sm admin-btn--danger" data-rp-evt-del="' + idx + '" title="Supprimer"><i class="fas fa-trash"></i></button>';
      html += '</td></tr>';
    });
    if (!html) html = '<tr><td colspan="4" style="color:#666;padding:12px;text-align:center;">Aucun événement — cliquez sur Ajouter.</td></tr>';
    tbody.innerHTML = html;
    if (count) count.textContent = rpEvts.length + ' événement(s)';
    tbody.querySelectorAll('[data-rp-evt-edit]').forEach(function(btn) {
      btn.addEventListener('click', function() { openRpEvtEditor(+btn.dataset.rpEvtEdit); });
    });
    tbody.querySelectorAll('[data-rp-evt-del]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx2 = +btn.dataset.rpEvtDel;
        if (confirm('Supprimer "' + (rpEvts[idx2] ? rpEvts[idx2].nom : '') + '" ?')) {
          rpEvts.splice(idx2, 1);
          saveRpKey(RP_EVT_KEY, rpEvts, 'Événement supprimé');
          renderRpEvts();
        }
      });
    });
  }

  function openRpEvtEditor(idx) {
    var e = (idx >= 0 && idx < rpEvts.length) ? rpEvts[idx] : null;
    document.getElementById('rp-evt-edit-idx').value   = idx;
    document.getElementById('rp-evt-editor-title').textContent = e ? 'Modifier : ' + e.nom : 'Nouvel événement';
    document.getElementById('rp-evt-nom').value     = e ? (e.nom      || '') : '';
    document.getElementById('rp-evt-date').value    = e ? (e.dateDebut || '') : '';
    document.getElementById('rp-evt-adresse').value = e ? (e.adresse  || '') : '';
    document.getElementById('rp-evt-url').value     = e ? (e.url      || '') : '';
    var ed = document.getElementById('rp-evt-editor');
    ed.style.display = 'block';
    ed.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  (function() {
    var addBtn    = document.getElementById('rp-evt-add-btn');
    var saveBtn   = document.getElementById('rp-evt-save-btn');
    var cancelBtn = document.getElementById('rp-evt-cancel-btn');
    if (addBtn)    addBtn.addEventListener('click', function() { openRpEvtEditor(-1); });
    if (cancelBtn) cancelBtn.addEventListener('click', function() { document.getElementById('rp-evt-editor').style.display = 'none'; });
    if (saveBtn)   saveBtn.addEventListener('click', function() {
      var idx = +document.getElementById('rp-evt-edit-idx').value;
      var nom = document.getElementById('rp-evt-nom').value.trim();
      if (!nom) { alert('Le nom est obligatoire'); return; }
      var existing = (idx >= 0 && idx < rpEvts.length) ? rpEvts[idx] : null;
      var obj = {
        id:        existing ? existing.id : 'admin-evt-' + Date.now(),
        nom:       nom,
        dateDebut: document.getElementById('rp-evt-date').value || null,
        adresse:   document.getElementById('rp-evt-adresse').value.trim(),
        url:       document.getElementById('rp-evt-url').value.trim(),
        source:    'Admin',
        type:      'evenement'
      };
      if (existing) { Object.assign(rpEvts[idx], obj); showToast('Événement modifié'); }
      else           { rpEvts.push(obj);                showToast('Événement ajouté'); }
      saveRpKey(RP_EVT_KEY, rpEvts, 'Événements');
      document.getElementById('rp-evt-editor').style.display = 'none';
      renderRpEvts();
    });
  })();

  loadRpData();

  // ═══════════════════════════════════════════════════════════
  // TAB: Liens utiles — Sources, veille, agrégateurs
  // ═══════════════════════════════════════════════════════════
  var LIENS_KEY = 'op-radar-liens';
  var rpLiens   = [];

  var LIENS_DEFAULT = [
    // Organisateurs officiels
    { id: 'def-lnk-1',  categorie: 'officiel',    nom: 'Big Data & AI Paris',      date: '15\u201316 sept',  lieu: 'Paris Porte de Versailles',      url: 'https://bigdataparis.com',           interet: 'R\u00e9f\u00e9rence Big Data & IA en France' },
    { id: 'def-lnk-2',  categorie: 'officiel',    nom: 'VivaTech',                 date: '17\u201320 juin',  lieu: 'Paris Porte de Versailles',      url: 'https://vivatech.com',               interet: 'Innovation, IA, Startup, Data, Recrutement' },
    { id: 'def-lnk-3',  categorie: 'officiel',    nom: 'Salon de la Data & IA',    date: '22 sept',          lieu: 'Nantes Cit\u00e9 des Congr\u00e8s', url: 'https://salondata.fr',            interet: 'Salon d\u00e9di\u00e9 Data & IA \u00e0 Nantes' },
    { id: 'def-lnk-4',  categorie: 'officiel',    nom: 'Data & AI Leaders Summit', date: '18\u201319 nov',   lieu: 'Paris',                          url: 'https://techshowparis.fr',           interet: 'Summit d\u00e9cideurs Data & IA' },
    { id: 'def-lnk-5',  categorie: 'officiel',    nom: 'GenAI France',             date: 'R\u00e9gulier',    lieu: 'Paris, Lyon, Nantes, Bordeaux\u2026', url: 'https://generativeai.paris',    interet: 'Meetups GenAI r\u00e9guliers en France' },
    { id: 'def-lnk-6',  categorie: 'officiel',    nom: 'Data Days Lille',          date: '\u00c0 confirmer', lieu: 'Lille',                          url: 'https://days.data-lille.fr/2026',    interet: 'Journ\u00e9es data Lille' },
    { id: 'def-lnk-7',  categorie: 'officiel',    nom: 'World AI Cannes Festival', date: '12\u201313 f\u00e9v', lieu: 'Cannes',                     url: 'https://worldaicannes.com',          interet: 'Festival IA \u00e0 Cannes' },
    // Plateformes de veille
    { id: 'def-lnk-8',  categorie: 'veille',      nom: 'LinkedIn Events',          date: '',                 lieu: '',                               url: 'https://linkedin.com/events',        interet: '\u00c9v\u00e9nements pros data/IA \u2014 tr\u00e8s \u00e0 jour, les organisateurs publient ici en premier' },
    { id: 'def-lnk-9',  categorie: 'veille',      nom: 'Meetup.com',               date: '',                 lieu: '',                               url: 'https://meetup.com',                 interet: 'Communaut\u00e9s locales data/IA par ville' },
    { id: 'def-lnk-10', categorie: 'veille',      nom: 'Eventbrite',               date: '',                 lieu: '',                               url: 'https://eventbrite.fr',              interet: 'Billetterie officielle de nombreux \u00e9v\u00e9nements' },
    { id: 'def-lnk-11', categorie: 'veille',      nom: 'ADN Ouest',                date: '',                 lieu: 'Nantes, Rennes, Bretagne',       url: 'https://adnouest.org/agenda',        interet: 'Grand Ouest num\u00e9rique \u2014 agenda complet' },
    // Agrégateurs
    { id: 'def-lnk-12', categorie: 'agregateur',  nom: 'AVISIA',                   date: '',                 lieu: '',                               url: 'https://avisia.fr/blog',             interet: 'Calendrier S1 + S2 2026' },
    { id: 'def-lnk-13', categorie: 'agregateur',  nom: 'Datalogy',                 date: '',                 lieu: '',                               url: 'https://datalogy-agency.com',        interet: 'Liste 2026 France + Europe' },
    { id: 'def-lnk-14', categorie: 'agregateur',  nom: 'Sylob Salons',             date: '',                 lieu: '',                               url: 'https://sylob.com/salons',           interet: 'IT + Industrie France 2026' },
  ];

  var LIEN_CAT_LABELS = { officiel: 'Officiel', veille: 'Veille', agregateur: 'Agr\u00e9gateur' };

  function loadLiens() {
    try { rpLiens = JSON.parse(localStorage.getItem(LIENS_KEY) || '[]'); } catch(e) { rpLiens = []; }
  }

  function renderLiensUtiles() {
    loadLiens();
    renderLiensTable();
  }

  function renderLiensTable() {
    var tbody = document.getElementById('lien-tbody');
    var count = document.getElementById('lien-count');
    if (!tbody) return;
    var html = '';
    rpLiens.forEach(function(l, idx) {
      var cat = LIEN_CAT_LABELS[l.categorie] || (l.categorie || '');
      var urlShort = (l.url || '').replace(/^https?:\/\//, '');
      html += '<tr>';
      html += '<td style="font-weight:600;">' + (l.nom || '') + '</td>';
      html += '<td><span class="lien-cat-pill">' + cat + '</span></td>';
      html += '<td class="admin-cell-muted" style="font-size:0.82rem;">';
      if (l.url) html += '<a href="' + l.url + '" target="_blank" rel="noopener" class="admin-table-link">' + urlShort + '</a>';
      html += '</td>';
      html += '<td class="admin-cell-muted" style="font-size:0.82rem;">' + (l.interet || '') + '</td>';
      html += '<td style="text-align:center;white-space:nowrap;">';
      html += '<button class="admin-btn admin-btn--sm" data-lien-edit="' + idx + '" title="Modifier"><i class="fas fa-pen"></i></button> ';
      html += '<button class="admin-btn admin-btn--sm admin-btn--danger" data-lien-del="' + idx + '" title="Supprimer"><i class="fas fa-trash"></i></button>';
      html += '</td></tr>';
    });
    if (!html) html = '<tr><td colspan="5" style="color:#666;padding:12px;text-align:center;">Aucun lien \u2014 cliquez sur Ajouter ou Charger donn\u00e9es 2026.</td></tr>';
    tbody.innerHTML = html;
    if (count) count.textContent = rpLiens.length + ' lien(s)';
    tbody.querySelectorAll('[data-lien-edit]').forEach(function(btn) {
      btn.addEventListener('click', function() { openLienEditor(+btn.dataset.lienEdit); });
    });
    tbody.querySelectorAll('[data-lien-del]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx2 = +btn.dataset.lienDel;
        if (confirm('Supprimer "' + (rpLiens[idx2] ? rpLiens[idx2].nom : '') + '" ?')) {
          rpLiens.splice(idx2, 1);
          localStorage.setItem(LIENS_KEY, JSON.stringify(rpLiens));
          showToast('Lien supprim\u00e9');
          renderLiensTable();
        }
      });
    });
  }

  function openLienEditor(idx) {
    var l = (idx >= 0 && idx < rpLiens.length) ? rpLiens[idx] : null;
    document.getElementById('lien-edit-idx').value   = idx;
    document.getElementById('lien-editor-title').textContent = l ? 'Modifier : ' + l.nom : 'Nouveau lien';
    document.getElementById('lien-nom').value       = l ? (l.nom       || '') : '';
    document.getElementById('lien-categorie').value = l ? (l.categorie || 'officiel') : 'officiel';
    document.getElementById('lien-date').value      = l ? (l.date      || '') : '';
    document.getElementById('lien-lieu').value      = l ? (l.lieu      || '') : '';
    document.getElementById('lien-url').value       = l ? (l.url       || '') : '';
    document.getElementById('lien-interet').value   = l ? (l.interet   || '') : '';
    var ed = document.getElementById('lien-editor');
    ed.style.display = 'block';
    ed.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  (function() {
    var addBtn    = document.getElementById('lien-add-btn');
    var saveBtn   = document.getElementById('lien-save-btn');
    var cancelBtn = document.getElementById('lien-cancel-btn');
    var defBtn    = document.getElementById('lien-load-defaults-btn');

    if (addBtn)    addBtn.addEventListener('click', function() { openLienEditor(-1); });
    if (cancelBtn) cancelBtn.addEventListener('click', function() { document.getElementById('lien-editor').style.display = 'none'; });

    if (saveBtn) saveBtn.addEventListener('click', function() {
      var idx = +document.getElementById('lien-edit-idx').value;
      var nom = document.getElementById('lien-nom').value.trim();
      if (!nom) { alert('Le nom est obligatoire'); return; }
      var existing = (idx >= 0 && idx < rpLiens.length) ? rpLiens[idx] : null;
      var obj = {
        id:        existing ? existing.id : 'lnk-' + Date.now(),
        categorie: document.getElementById('lien-categorie').value,
        nom:       nom,
        date:      document.getElementById('lien-date').value.trim(),
        lieu:      document.getElementById('lien-lieu').value.trim(),
        url:       document.getElementById('lien-url').value.trim(),
        interet:   document.getElementById('lien-interet').value.trim(),
      };
      if (existing) { Object.assign(rpLiens[idx], obj); showToast('Lien modifi\u00e9'); }
      else          { rpLiens.push(obj);                 showToast('Lien ajout\u00e9'); }
      localStorage.setItem(LIENS_KEY, JSON.stringify(rpLiens));
      document.getElementById('lien-editor').style.display = 'none';
      renderLiensTable();
    });

    if (defBtn) defBtn.addEventListener('click', function() {
      var isEmpty = rpLiens.length === 0;
      if (!isEmpty && !confirm('Des liens existent d\u00e9j\u00e0.\nVoulez-vous ajouter les donn\u00e9es 2026 en suppl\u00e9ment (sans \u00e9craser) ?')) return;
      var added = 0;
      LIENS_DEFAULT.forEach(function(l) {
        if (!rpLiens.some(function(x) { return x.id === l.id; })) { rpLiens.push(Object.assign({}, l)); added++; }
      });
      localStorage.setItem(LIENS_KEY, JSON.stringify(rpLiens));
      renderLiensTable();
      showToast('\u2705 ' + added + ' lien(s) 2026 charg\u00e9(s)');
    });
  })();

  loadLiens();

  // ═══════════════════════════════════════════════════════════
  // PUBLICATION UNIFIÉE — "Publier tout" → /api/admin-save.php
  // ═══════════════════════════════════════════════════════════
  var ADMIN_SECRET_LS = 'op-admin-secret';

  function collectAllData() {
    // Terrain
    var terrain = null;
    try { terrain = JSON.parse(localStorage.getItem('op-terrain-admin') || 'null'); } catch(e) { terrain = null; }
    var terrainClean = terrain ? {
      isPublic:         terrain.isPublic !== false,
      dashboard:        terrain.dashboard        || {},
      positionActuelle: terrain.positionActuelle || {},
      projet:           terrain.projet           || {},
      etapes:           terrain.etapes           || [],
      journal:          terrain.journal          || []
    } : {};

    // Coworking
    var coworking = [];
    try { coworking = JSON.parse(localStorage.getItem('op-terrain-coworking') || '[]'); } catch(e) { coworking = []; }

    return {
      terrain:   terrainClean,
      coworking: coworking,
      radar: {
        entreprises: rpEnts,
        salons:      rpSalons,
        events:      rpEvts,
        liens:       rpLiens
      }
    };
  }

  function publishAll() {
    var secret = localStorage.getItem(ADMIN_SECRET_LS) || '';
    if (!secret) {
      secret = prompt('Clé de publication (définie dans admin-save.php) :');
      if (!secret) return;
      localStorage.setItem(ADMIN_SECRET_LS, secret.trim());
    }

    var btn      = document.getElementById('admin-publish-btn');
    var statusEl = document.getElementById('admin-publish-status');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publication\u2026';
    if (statusEl) { statusEl.style.display = ''; statusEl.className = 'admin-publish-status admin-publish-status--loading'; statusEl.textContent = 'Envoi\u2026'; }

    var payload = collectAllData();
    payload.secret = secret;

    fetch('/api/admin-save.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) throw new Error(d.error);
        var ts = d.updated_at ? new Date(d.updated_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
        if (statusEl) {
          statusEl.className = 'admin-publish-status admin-publish-status--ok';
          statusEl.innerHTML = '\u2713 ' + ts + ' \u2014 ' + (d.summary || '');
        }
        // Persister la date pour la session suivante
        if (d.updated_at) localStorage.setItem('op-last-published', d.updated_at);
        var lpEl = document.getElementById('admin-last-published');
        if (lpEl && ts) { lpEl.textContent = 'Publi\u00e9 : ' + ts; lpEl.style.display = ''; }
        showToast('\u2705 Site publié sur O2Switch');
      })
      .catch(function (e) {
        // Si clé incorrecte, effacer pour forcer re-saisie
        if (e.message.includes('Clé') || e.message.includes('403')) localStorage.removeItem(ADMIN_SECRET_LS);
        if (statusEl) {
          statusEl.className = 'admin-publish-status admin-publish-status--err';
          statusEl.innerHTML = '\u26a0 ' + e.message;
        }
        showToast('\u274c Publication échouée : ' + e.message);
      })
      .finally(function () {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Publier tout';
      });
  }

  (function () {
    var btn = document.getElementById('admin-publish-btn');
    if (btn) btn.addEventListener('click', publishAll);
    // Restaurer la date de dernière publication depuis localStorage
    var lp = localStorage.getItem('op-last-published');
    if (lp) {
      var lpTs = new Date(lp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      var lpEl = document.getElementById('admin-last-published');
      if (lpEl) { lpEl.textContent = 'Publi\u00e9 : ' + lpTs; lpEl.style.display = ''; }
    }
  })();

  // ── Publication Radar Pro (ancien bouton — maintenant délégue à publishAll) ──
  var RP_SECRET_LS = 'op-radar-upload-secret';

  (function () {
    var secretInput = document.getElementById('rp-upload-secret');
    var publishBtn  = document.getElementById('rp-publish-btn');
    var resultEl    = document.getElementById('rp-publish-result');
    if (!secretInput || !publishBtn) return;

    // Restaurer la clé mémorisée
    secretInput.value = localStorage.getItem(RP_SECRET_LS) || '';
    secretInput.addEventListener('change', function () {
      localStorage.setItem(RP_SECRET_LS, secretInput.value.trim());
    });

    publishBtn.addEventListener('click', function () {
      var secret = secretInput.value.trim();
      if (!secret) { alert('Entrez la clé d\'upload (définie dans radar-pro-save.php)'); return; }
      localStorage.setItem(RP_SECRET_LS, secret);

      publishBtn.disabled = true;
      publishBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publication\u2026';
      resultEl.style.display = '';
      resultEl.className = 'admin-strava-result info';
      resultEl.textContent = 'Envoi en cours\u2026';

      fetch('/api/radar-pro-save.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret:      secret,
          entreprises: rpEnts,
          salons:      rpSalons,
          events:      rpEvts,
        })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.error) throw new Error(d.error);
          resultEl.className = 'admin-strava-result ok';
          resultEl.innerHTML = '<i class="fas fa-check-circle"></i> Publié \u2014 '
            + d.counts.entreprises + ' entreprise(s), '
            + d.counts.salons + ' salon(s), '
            + d.counts.events + ' \u00e9v\u00e9nement(s)'
            + ' \u2014 ' + new Date(d.updated_at).toLocaleString('fr-FR');
        })
        .catch(function (e) {
          resultEl.className = 'admin-strava-result error';
          resultEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> ' + e.message;
        })
        .finally(function () {
          publishBtn.disabled = false;
          publishBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Publier Radar Pro';
        });
    });
  })();

})();
