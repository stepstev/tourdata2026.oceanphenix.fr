// terrain-live.js — Live-update: reads admin data from localStorage + cross-tab sync
(function () {
  const STORAGE_KEY = 'op-terrain-admin';

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  const statusConfig = {
    'Pr\u00e9paration': { css: 'terrain-status-badge--preparation', icon: 'fa-tools' },
    'En route':         { css: 'terrain-status-badge--enroute',      icon: 'fa-bicycle' },
    '\u00c9tape':       { css: 'terrain-status-badge--etape',        icon: 'fa-map-pin' },
    'Repos':            { css: 'terrain-status-badge--repos',        icon: 'fa-bed' },
    'Termin\u00e9':     { css: 'terrain-status-badge--termine',      icon: 'fa-check-circle' }
  };

  function updatePositionBadge(statut) {
    const badge = document.getElementById('live-position-badge');
    const icon = document.getElementById('live-position-icon');
    if (!badge) return;
    // Remove all status classes
    const keys = Object.keys(statusConfig);
    for (const key of keys) {
      badge.classList.remove(statusConfig[key].css);
    }
    const cfg = statusConfig[statut] || statusConfig['Pr\u00e9paration'];
    badge.classList.add(cfg.css);
    if (icon) icon.className = 'fas ' + cfg.icon;
  }

  const statusTexts = {
    'Pr\u00e9paration': 'Phase de pr\u00e9paration\u00a0: contacts entreprises, planification logistique, recherche sponsors.',
    'En route':         'Actuellement en route \u00e0 v\u00e9lo \u2014 rencontres terrain et exploration des besoins data.',
    '\u00c9tape':       '\u00c9tape en cours \u2014 rencontres entreprises, diagnostics data et \u00e9changes terrain.',
    'Repos':            'Journ\u00e9e de repos \u2014 pr\u00e9paration de la prochaine \u00e9tape.',
    'Termin\u00e9':     'Parcours termin\u00e9\u00a0! Merci \u00e0 toutes les entreprises rencontr\u00e9es.'
  };

  function updatePositionInfo(pos) {
    const el = document.getElementById('live-position-info');
    if (!el) return;
    const dateStr = pos.dateDepart || '';
    const desc = statusTexts[pos.statut] || statusTexts['Pr\u00e9paration'];
    el.innerHTML = 'D\u00e9part pr\u00e9vu le <strong id="live-position-depart">' + escapeHtml(dateStr) + '</strong>. ' + escapeHtml(desc);
  }

  // ── Helpers extracted from applyLiveData ──────────────────────────────────

  function applyLastSaved(lastSaved) {
    if (!lastSaved) return;
    const updEl = document.getElementById('live-updated-at');
    if (!updEl) return;
    try {
      const dt = new Date(lastSaved);
      updEl.textContent = '\u26a1 Donn\u00e9es live \u2014 maj : ' + dt.toLocaleString('fr-FR');
      updEl.style.display = 'block';
    } catch { /* skip */ }
  }

  function applyProjectStats(proj) {
    if (proj.kmTotal != null) {
      setText('live-km-total',  proj.kmTotal);
      setText('live-km-total2', proj.kmTotal);
    }
    if (proj.nbEtapes != null) {
      setText('live-nb-etapes',  proj.nbEtapes);
      setText('live-nb-villes',  proj.nbEtapes + ' villes fran\u00e7aises');
      setText('live-nb-villes2', proj.nbEtapes);
    }
    if (proj.periode != null) setText('live-periode', proj.periode);
  }

  function applyDashStats(dash, pos) {
    setText('live-km',            dash.kmParcourus ?? '');
    setText('live-jours',         dash.joursPrevus ?? '');
    setText('live-jours-route',   dash.joursRoute ?? '');
    setText('live-jours-bar',     dash.joursPrevus ?? '');
    setText('live-besoins',       dash.besoinsIdentifies ?? '');
    setText('live-rencontres',    dash.rencontresEntreprises ?? '');
    setText('live-besoins-m',     dash.besoinsIdentifies ?? '');
    setText('live-rencontres-m',  dash.rencontresEntreprises ?? '');
    setText('live-status',        dash.etapeEnCours || pos.statut || '');
    const prochaine = dash.prochaineEtape || '';
    setText('live-prochaine',     prochaine);
    setText('live-route-arrivee', prochaine);
  }

  function findDepartVille(etapes, pos) {
    for (const etape of etapes) {
      if (etape.statut === 'depart' || etape.statut === 'actuel') return etape.ville;
    }
    return pos.ville || '';
  }

  function applyPhotos(photosEl, photos) {
    if (!photosEl || !photos) return;
    photosEl.innerHTML = '';
    photos.forEach(function (src) {
      const thumb = document.createElement('div');
      thumb.className = 'tdash-thumb';
      const img = document.createElement('img');
      img.src = src;
      img.alt = 'Photo terrain';
      img.loading = 'lazy';
      img.addEventListener('error', function () { thumb.style.display = 'none'; });
      thumb.appendChild(img);
      photosEl.appendChild(thumb);
    });
  }

  function applyJournal(journalEl, journal) {
    if (!journalEl || !journal.length) return;
    let jhtml = '';
    journal.forEach(function (entry) {
      jhtml += '<div class="terrain-journal-entry">' +
        '<div class="terrain-journal-date">' +
        '<i class="fas fa-calendar-day"></i> ' + escapeHtml(entry.date || '') +
        '<span class="terrain-journal-ville">\u2014 ' + escapeHtml(entry.ville || '') + '</span>' +
        '</div>' +
        '<h3 class="terrain-journal-titre">' + escapeHtml(entry.titre || '') + '</h3>' +
        '<p class="terrain-journal-contenu">' + escapeHtml(entry.contenu || '').replaceAll('\n', '<br>') + '</p>';
      if (entry.tags?.length) {
        jhtml += '<div class="terrain-journal-tags">';
        entry.tags.forEach(function (tag) {
          jhtml += '<span class="terrain-tag">' + escapeHtml(tag) + '</span>';
        });
        jhtml += '</div>';
      }
      jhtml += '</div>';
    });
    journalEl.innerHTML = jhtml;
  }

  function fmtMonthYear(iso) {
    if (!iso) return '\u2014';
    try {
      return new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    } catch { return iso; }
  }

  function fmtNum(n) {
    if (n == null) return '\u2014';
    return Number(n).toLocaleString('fr-FR');
  }

  function applyEtapesList(etapes) {
    const ul = document.getElementById('td-etapes-list-live');
    if (!ul || !etapes || !etapes.length) return;
    let html = '';
    etapes.forEach(function (etape) {
      const isDepart  = etape.type === 'depart';
      const isArrivee = etape.type === 'arrivee';
      const extraLabel = isDepart ? ' \u2014 D\u00e9part' : isArrivee ? ' \u2014 Retour' : '';
      const dotCls  = etape.statut === 'actuel' ? 'td-dot--live'
                    : isArrivee                 ? 'td-dot--orange'
                    : isDepart                  ? 'td-dot--green'
                    : 'td-dot--blue';
      const badgeTxt = etape.statut === 'actuel' ? 'En cours'
                     : isDepart                  ? fmtMonthYear(etape.dateEstimee)
                     : isArrivee                 ? fmtMonthYear(etape.dateEstimee)
                     : 'Planifi\u00e9';
      const badgeCls = etape.statut === 'actuel' ? 'td-pill--live'
                     : isDepart                  ? 'td-pill--green'
                     : isArrivee                 ? 'td-pill--orange'
                     : 'td-pill--muted';
      const kmLabel  = isDepart ? 'Km 0' : '~' + fmtNum(etape.distanceDepuisDepart) + ' km';
      const accent   = isDepart || isArrivee ? ' td-etape-row--accent' : '';
      html += '<li class="td-etape-row' + accent + '">' +
        '<span class="td-dot ' + dotCls + '"></span>' +
        '<span class="td-etape-ville">' + escapeHtml(etape.ville) + escapeHtml(extraLabel) + '</span>' +
        '<span class="td-etape-sep"></span>' +
        '<span class="td-etape-km">' + kmLabel + '</span>' +
        '<span class="td-pill ' + badgeCls + '">' + badgeTxt + '</span>' +
        '</li>';
    });
    ul.innerHTML = html;
    // Update meta count
    const meta = document.getElementById('td-etapes-meta-live');
    if (meta) {
      const nbEtapes = etapes.filter(function(e) { return e.type === 'etape'; }).length;
      meta.textContent = nbEtapes + ' \u00e9tapes';
    }
  }

  function applyMaps(etapes) {
    if (!etapes.length) return;
    if (globalThis._terrainMainMap) {
      rebuildMapMarkers(globalThis._terrainMainMap, etapes, false);
      addCwFlags(globalThis._terrainMainMap, false);
    }
    if (globalThis._terrainDashMap) {
      rebuildMapMarkers(globalThis._terrainDashMap, etapes, true);
      addCwFlags(globalThis._terrainDashMap, true);
    }
  }

  function applyLiveData(d) {
    if (!d) return;
    const dash    = d.dashboard || {};
    const pos     = d.positionActuelle || {};
    const etapes  = d.etapes || [];
    const journal = d.journal || [];

    applyLastSaved(d._lastSaved);
    applyProjectStats(d.projet || {});
    applyDashStats(dash, pos);

    setText('live-route-depart',   findDepartVille(etapes, pos));
    setText('live-position-ville',  pos.ville      || '');
    setText('live-position-statut', pos.statut     || '');
    setText('live-position-depart', pos.dateDepart || '');
    setText('live-depart-date-bar', pos.dateDepart || '');
    updatePositionBadge(pos.statut || '');
    updatePositionInfo(pos);

    applyPhotos(document.getElementById('live-photos'), dash.photos);
    applyJournal(document.getElementById('live-journal'), journal);
    applyEtapesList(etapes);
    applyMaps(etapes);
  }

  function rebuildMapMarkers(map, etapes, compact) {
    const colors = { actuel: '#f59e0b', planifie: '#1a6b8a', visite: '#22c55e', depart: '#f59e0b' };
    // Remove only route-specific layers (preserve GPX tracks & coworking flags)
    if (map._routeLayers) {
      map._routeLayers.forEach(function (layer) { map.removeLayer(layer); });
    }
    map._routeLayers = [];
    const routeCoords = [];
    etapes.forEach(function (etape) {
      if (etape.visible === false) return;
      const color = colors[etape.statut] || colors.planifie;
      const baseRadius   = compact ? 5 : 7;
      const activeRadius = compact ? 8 : 10;
      const radius = etape.statut === 'actuel' ? activeRadius : baseRadius;
      const marker = L.circleMarker([etape.lat, etape.lng], {
        radius: radius, fillColor: color, color: '#fff',
        weight: 2, opacity: 1, fillOpacity: 0.9,
      }).addTo(map);
      map._routeLayers.push(marker);
      if (!compact && (etape.statut === 'actuel' || etape.statut === 'visite')) {
        const halo = L.circleMarker([etape.lat, etape.lng], {
          radius: 18, fillColor: color, color: color,
          weight: 2, opacity: 0.3, fillOpacity: 0.1,
        }).addTo(map);
        map._routeLayers.push(halo);
      }
      if (compact) {
        marker.bindTooltip(etape.ville, { permanent: false, direction: 'top', className: 'tdash-tooltip' });
      } else {
        marker.bindPopup(
          '<div style="font-family:Inter,sans-serif;min-width:200px;">' +
          '<strong style="font-size:14px;color:#0b1a2e;">' + etape.ville + '</strong>' +
          '<br><span style="color:#666;font-size:12px;">' + etape.region + '</span>' +
          '<br><span style="color:#888;font-size:11px;">' + (etape.type === 'depart' ? 'D\u00e9part' : etape.type === 'arrivee' ? 'Arriv\u00e9e' : '\u00c9tape ' + etape.id) + ' \u2014 ' + etape.distanceDepuisDepart + ' km</span>' +
          '<hr style="margin:6px 0;border:0;border-top:1px solid #e5e7eb;">' +
          '<p style="font-size:12px;color:#444;margin:0;">' + etape.description + '</p>' +
          '<p style="font-size:11px;color:#999;margin:6px 0 0;">Date estim\u00e9e : ' + etape.dateEstimee + '</p></div>'
        );
      }
      routeCoords.push({ lat: etape.lat, lng: etape.lng, statut: etape.statut });
    });
    // Draw segmented route: green solid for realized, dark blue dashed for planned
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const from = routeCoords[i];
      const to   = routeCoords[i + 1];
      const realized = (from.statut === 'visite' || from.statut === 'actuel' || from.statut === 'depart') &&
                       (to.statut === 'visite' || to.statut === 'actuel');
      const seg = L.polyline([[from.lat, from.lng], [to.lat, to.lng]], {
        color:     realized ? '#22c55e' : '#1a6b8a',
        weight:    compact ? 2 : 2.5,
        opacity:   realized ? 0.8 : 0.5,
        dashArray: realized ? null : '8, 8',
      }).addTo(map);
      map._routeLayers.push(seg);
    }
  }

  // Load from localStorage on page load
  // NOTE: terrain-live.js is READ-ONLY — it never writes to localStorage.
  // Only admin-terrain.js is allowed to write (single source of truth).
  function loadAndApply() {
    // Apply initial badge style from data attribute
    const badge = document.getElementById('live-position-badge');
    if (badge) {
      const initStatut = badge.dataset.statut || 'Pr\u00e9paration';
      updatePositionBadge(initStatut);
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        applyLiveData(d);
      }
    } catch { /* invalid JSON, skip */ }
    // NOTE: GPX tracks and coworking markers are drawn by terrain-maps.js on initial load.
    // terrain-live.js only redraws them on cross-tab storage updates (see storage event below).
    // Attach error handlers to initial photo thumbnails (CSP-safe)
    const photosEl = document.getElementById('live-photos');
    if (photosEl) {
      const imgs = photosEl.querySelectorAll('img');
      for (const img of imgs) {
        img.addEventListener('error', function() { img.parentElement.style.display = 'none'; });
      }
    }
  }

  // Helper: parse GPX XML string → [[lat,lng], ...]
  // Uses getElementsByTagNameNS to handle GPX namespace (e.g. Garmin, Strava, Komoot)
  function parseGpxCoords(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) return []; // invalid XML
    let pts = doc.getElementsByTagNameNS('*', 'trkpt');
    if (pts.length === 0) pts = doc.getElementsByTagNameNS('*', 'rtept');
    if (pts.length === 0) pts = doc.getElementsByTagNameNS('*', 'wpt');
    const coords = [];
    for (const pt of pts) {
      const lat = Number.parseFloat(pt.getAttribute('lat'));
      const lon = Number.parseFloat(pt.getAttribute('lon'));
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) coords.push([lat, lon]);
    }
    return coords;
  }

  // Helper: draw a GPX polyline on the map
  function drawGpxTrack(map, coords, name) {
    if (coords.length < 2) return;
    const layer = L.polyline(coords, {
      color: '#f59e0b', weight: 3, opacity: 0.8,
    }).addTo(map).bindTooltip(name || 'Trac\u00e9 GPX', { sticky: true });
    map._gpxLayers.push(layer);
  }

  // Helper to reload GPX tracks from localStorage
  function reloadGpxTracks(map) {
    if (!map || typeof L === 'undefined') return;
    // Remove existing GPX layers
    if (map._gpxLayers) {
      map._gpxLayers.forEach(function(layer) { map.removeLayer(layer); });
    }
    map._gpxLayers = [];
    try {
      const raw = localStorage.getItem('op-terrain-gpx');
      if (!raw) return;
      // Check if GPX toggle is off
      const toggle = document.getElementById('gpx-toggle');
      if (toggle && !toggle.checked) return;
      const gpxFiles = JSON.parse(raw);
      gpxFiles.forEach(function(g) {
        if (g.visible === false) return;
        // New format: pre-parsed coords array (preferred)
        if (g.coords && g.coords.length >= 2) {
          drawGpxTrack(map, g.coords, g.name);
          return;
        }
        // Legacy fallback: raw XML
        if (g.gpxContent) {
          drawGpxTrack(map, parseGpxCoords(g.gpxContent), g.name);
          return;
        }
        // Very legacy: fetch from path
        if (g.path) {
          fetch(g.path)
            .then(function(r) { return r.ok ? r.text() : null; })
            .then(function(xml) {
              if (xml) drawGpxTrack(map, parseGpxCoords(xml), g.name);
            })
            .catch(function() { /* skip */ });
        }
      });
    } catch { /* skip */ }
  }

  // Helper to reload coworking flags
  function addCwFlags(map, compact) {
    if (!map || typeof L === 'undefined') return;
    // Remove existing
    if (map._cwMarkers) {
      map._cwMarkers.forEach(function(m) { map.removeLayer(m); });
    }
    map._cwMarkers = [];
    try {
      const raw = localStorage.getItem('op-terrain-coworking');
      if (!raw) return;
      const cwList = JSON.parse(raw);
      cwList.forEach(function(cw) {
        if (!cw.visible || !cw.lat || !cw.lng) return;
        const flagIcon = L.divIcon({
          className: 'cw-flag-marker',
          html: '<i class="fas fa-flag" style="color:#d4845a;font-size:' + (compact ? '14px' : '18px') + ';filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));"></i>',
          iconSize: compact ? [14, 14] : [18, 18],
          iconAnchor: compact ? [2, 14] : [3, 18],
        });
        const m = L.marker([cw.lat, cw.lng], { icon: flagIcon }).addTo(map);
        if (compact) {
          m.bindTooltip(cw.nom || 'Coworking', { permanent: false, direction: 'top' });
        } else {
          let popup = '<div style="font-family:Inter,sans-serif;min-width:180px;">' +
            '<strong style="font-size:13px;color:#0b1a2e;">' + (cw.nom || '') + '</strong>' +
            '<br><span style="color:#666;font-size:12px;"><i class="fas fa-map-marker-alt"></i> ' + (cw.ville || '') + '</span>';
          if (cw.adresse) popup += '<br><span style="color:#888;font-size:11px;">' + cw.adresse + '</span>';
          if (cw.url) popup += '<br><a href="' + cw.url + '" target="_blank" rel="noopener" style="font-size:11px;">Site web</a>';
          popup += '</div>';
          m.bindPopup(popup);
        }
        map._cwMarkers.push(m);
      });
    } catch { /* skip */ }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAndApply);
  } else {
    loadAndApply();
  }

  // Cross-tab real-time: update when admin saves in another tab
  globalThis.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY && e.newValue) {
      try { applyLiveData(JSON.parse(e.newValue)); } catch { /* skip */ }
    }
    if (e.key === 'op-terrain-coworking') {
      addCwFlags(globalThis._terrainMainMap, false);
      addCwFlags(globalThis._terrainDashMap, true);
    }
    if (e.key === 'op-terrain-gpx') {
      reloadGpxTracks(globalThis._terrainMainMap);
      reloadGpxTracks(globalThis._terrainDashMap);
    }
  });

  // NOTE: 'terrainMapsReady' is NOT listened here — both scripts are inline and execute
  // sequentially, so terrain-maps.js fires the event BEFORE terrain-live.js can register
  // a listener. Initial rendering is fully handled by terrain-maps.js.
  // Cross-tab updates (storage event above) handle all live sync from admin.
})();
