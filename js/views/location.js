import { getLocationById, loadPlan, savePlan, addCustomAttraction, removeCustomAttraction } from '../store.js';
import { TYPE_LABELS, TYPE_ICONS, DIFFICULTY_LABELS, formatDuration, attractionThumbHtml, wireAttractionCarousels } from '../util.js';

let miniMapInstance = null;

function attractionExtra(a) {
  if (a.type === 'hike' && a.hike) {
    return `
      <div class="attraction-stats">
        <span>📏 <b>${a.hike.km} ק"מ</b></span>
        <span>⛰️ <b>${DIFFICULTY_LABELS[a.hike.difficulty] || a.hike.difficulty}</b></span>
        ${a.hike.elevationGain ? `<span>📈 <b>${a.hike.elevationGain} מ' טיפוס</b></span>` : ''}
        ${a.hike.start ? `<span>🚩 ${a.hike.start} → ${a.hike.end || ''}</span>` : ''}
      </div>`;
  }
  if (a.type === 'beach') {
    return `<div class="attraction-stats">${a.beachCharacter ? `<span>🏖️ ${a.beachCharacter}</span>` : ''}${a.access ? `<span>🚗 ${a.access}</span>` : ''}</div>`;
  }
  return '';
}

export async function renderLocation(app, id) {
  const loc = await getLocationById(id);
  if (!loc) {
    app.innerHTML = `<div class="empty-state"><h2>המקום לא נמצא</h2><a class="btn" href="#/">חזרה לבית</a></div>`;
    return;
  }

  const types = [...new Set(loc.attractions.map(a => a.type))];

  app.innerHTML = `
    <div class="location-hero">
      <div class="info">
        <h1>${loc.name}</h1>
        <div class="region">${loc.region}</div>
        <p>${loc.summary}</p>
        <div class="meta-row">
          <span class="meta-chip">⏱️ ${loc.suggestedStay}</span>
        </div>
      </div>
    </div>

    ${loc.logisticsTips && loc.logisticsTips.some(t => t.includes('⚠️')) ? `
      <div class="callout callout-warning">
        <span class="callout-icon">⚠️</span>
        <div>${loc.logisticsTips.find(t => t.includes('⚠️'))}</div>
      </div>` : ''}

    <div class="section-title-row"><h2>אטרקציות ופעילויות</h2></div>
    <div class="filter-bar" id="filterBar">
      <button class="filter-chip active" data-type="all">הכל</button>
      ${types.map(t => `<button class="filter-chip" data-type="${t}">${TYPE_LABELS[t] || t}</button>`).join('')}
    </div>
    <div id="attractionsList"></div>

    <div class="add-custom-attraction">
      <button type="button" class="btn btn-outline btn-sm" id="showAddAttractionBtn">+ הוספת אטרקציה משלכם</button>
      <div id="addAttractionForm" class="add-attraction-form" style="display:none;">
        <div class="add-block-fields">
          <input type="text" placeholder="שם האטרקציה" data-role="custom-attr-name" />
          <select class="pill-select" data-role="custom-attr-type">
            ${Object.entries(TYPE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
          <input type="number" min="0" max="24" value="1" data-role="custom-attr-hours" title="שעות" /><span>שע'</span>
          <input type="number" min="0" max="59" step="5" value="0" data-role="custom-attr-minutes" title="דקות" /><span>דק'</span>
        </div>
        <input type="url" placeholder="קישור (רשות) — https://..." data-role="custom-attr-link" class="add-attraction-wide" />
        <textarea placeholder="תיאור / הערות (רשות)" data-role="custom-attr-desc" class="add-attraction-wide" rows="2"></textarea>
        <div class="add-attraction-actions">
          <button type="button" class="btn btn-sm" data-role="save-custom-attraction">+ הוספה</button>
          <button type="button" class="btn btn-outline btn-sm" data-role="cancel-custom-attraction">ביטול</button>
        </div>
      </div>
    </div>

    ${(loc.restaurants && loc.restaurants.length) ? `
    <div class="subsection">
      <h2>מסעדות ומקומות אוכל</h2>
      <div class="chip-list">
        ${loc.restaurants.map(r => `<div class="info-chip"><div class="label">מסעדה</div><b>${r.name}</b><div>${r.note || ''}</div>${r.area ? `<div class="region">${r.area}</div>` : ''}</div>`).join('')}
      </div>
    </div>` : ''}

    ${(loc.wineries && loc.wineries.length) ? `
    <div class="subsection">
      <h2>יקבים</h2>
      <div class="chip-list">
        ${loc.wineries.map(w => `<div class="info-chip"><div class="label">יקב</div><b>${w.name}</b><div>${w.note || ''}</div></div>`).join('')}
      </div>
    </div>` : ''}

    ${(loc.lodgingAreas && loc.lodgingAreas.length) ? `
    <div class="subsection">
      <h2>איפה ללון (ברמת אזור)</h2>
      <div class="chip-list">
        ${loc.lodgingAreas.map(l => `<div class="info-chip"><div class="label">אזור לינה</div><b>${l.area}</b><div>${l.note || ''}</div></div>`).join('')}
      </div>
    </div>` : ''}

    ${(loc.logisticsTips && loc.logisticsTips.length) ? `
    <div class="subsection">
      <h2>טיפים לוגיסטיים</h2>
      <ul>${loc.logisticsTips.map(t => `<li>${t}</li>`).join('')}</ul>
    </div>` : ''}

    <div class="subsection">
      <h2>מפת ${loc.name}</h2>
      <p>כל האטרקציות של ${loc.name} על מפה אחת.</p>
      <div id="locationMiniMap"></div>
    </div>
  `;

  const listEl = document.getElementById('attractionsList');
  const filterBar = document.getElementById('filterBar');
  let activeFilter = 'all';

  function renderAttractions(filterType) {
    activeFilter = filterType;
    const list = filterType === 'all' ? loc.attractions : loc.attractions.filter(a => a.type === filterType);
    if (!list.length) {
      listEl.innerHTML = `<div class="empty-state">אין אטרקציות בקטגוריה הזו עדיין.</div>`;
      return;
    }
    listEl.innerHTML = list.map(a => `
      <div class="card attraction-card">
        <div class="thumb">${attractionThumbHtml(a)}</div>
        <div class="attraction-body">
          <div class="attraction-head">
            <h3>${a.name}</h3>
            <div>
              ${a.custom ? '<span class="badge badge-custom">🙋 נוסף על ידכם</span>' : (a.closed ? '<span class="badge badge-closed">🔒 סגור כרגע</span>' : `<span class="badge ${a.mustDo ? 'badge-must' : 'badge-optional'}">${a.mustDo ? '⭐ Must-do' : 'אופציונלי'}</span>`)}
              <span class="badge badge-type">${TYPE_LABELS[a.type] || a.type}</span>
            </div>
          </div>
          <p>${a.description || ''}</p>
          <div class="attraction-stats"><span>⏱️ <b>${formatDuration(a.durationMinutes)}</b></span></div>
          ${attractionExtra(a)}
          ${a.tips ? `<p><i>💡 ${a.tips}</i></p>` : ''}
          ${a.link ? `<p><a href="${a.link}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">🔗 קישור</a></p>` : ''}
          ${a.custom ? `<button type="button" class="btn btn-outline btn-sm" data-role="delete-custom-attraction" data-id="${a.id}">🗑️ הסרה</button>` : ''}
        </div>
      </div>
    `).join('');
    listEl.querySelectorAll('[data-role="delete-custom-attraction"]').forEach(btn => {
      btn.addEventListener('click', () => {
        removeCustomAttraction(loc.id, btn.dataset.id);
        loc.attractions = loc.attractions.filter(a => a.id !== btn.dataset.id);
        renderAttractions(activeFilter);
      });
    });
  }

  renderAttractions('all');
  wireAttractionCarousels(listEl);
  filterBar.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    [...filterBar.children].forEach(c => c.classList.remove('active'));
    e.target.classList.add('active');
    renderAttractions(e.target.dataset.type);
  });

  const showAddBtn = document.getElementById('showAddAttractionBtn');
  const addForm = document.getElementById('addAttractionForm');
  showAddBtn.addEventListener('click', () => {
    addForm.style.display = addForm.style.display === 'none' ? '' : 'none';
  });
  addForm.querySelector('[data-role="cancel-custom-attraction"]').addEventListener('click', () => {
    addForm.style.display = 'none';
  });
  addForm.querySelector('[data-role="save-custom-attraction"]').addEventListener('click', () => {
    const name = addForm.querySelector('[data-role="custom-attr-name"]').value.trim();
    if (!name) return;
    const type = addForm.querySelector('[data-role="custom-attr-type"]').value;
    const hrs = Number(addForm.querySelector('[data-role="custom-attr-hours"]').value) || 0;
    const mins = Number(addForm.querySelector('[data-role="custom-attr-minutes"]').value) || 0;
    const link = addForm.querySelector('[data-role="custom-attr-link"]').value.trim();
    const description = addForm.querySelector('[data-role="custom-attr-desc"]').value.trim();
    const entry = addCustomAttraction(loc.id, {
      name, type, durationMinutes: hrs * 60 + mins, link, description,
    });
    loc.attractions.push(entry);
    addForm.style.display = 'none';
    addForm.querySelector('[data-role="custom-attr-name"]').value = '';
    addForm.querySelector('[data-role="custom-attr-link"]').value = '';
    addForm.querySelector('[data-role="custom-attr-desc"]').value = '';
    renderAttractions(activeFilter);
  });

  initMiniMap(loc);
}

function initMiniMap(loc) {
  if (miniMapInstance) {
    miniMapInstance.remove();
    miniMapInstance = null;
  }
  const mapEl = document.getElementById('locationMiniMap');
  if (!mapEl) return;

  const points = (loc.attractions || []).filter(a => a.coords);
  const center = loc.coords || (points[0] && points[0].coords) || [39.0, 22.0];
  const map = L.map('locationMiniMap').setView(center, 12);
  miniMapInstance = map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(map);

  const bounds = [];

  if (loc.coords) {
    const locIcon = L.divIcon({
      className: 'loc-marker',
      html: '<div style="background:#0b3d61;color:#fff;border-radius:50%;width:14px;height:14px;border:2px solid #fff;box-shadow:0 0 0 2px #0b3d61;"></div>',
      iconSize: [14, 14],
    });
    L.marker(loc.coords, { icon: locIcon }).addTo(map).bindPopup(`<div class="map-popup"><h4>📍 ${loc.name}</h4></div>`);
    bounds.push(loc.coords);
  }

  points.forEach(a => {
    const icon = L.divIcon({
      className: 'attr-marker',
      html: `<div style="background:${a.mustDo ? '#c1662f' : '#2ba8a0'};width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:11px;">${TYPE_ICONS[a.type] || '📍'}</span></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 22],
    });
    L.marker(a.coords, { icon }).addTo(map).bindPopup(`
      <div class="map-popup">
        <h4>${TYPE_ICONS[a.type] || ''} ${a.name}</h4>
        <div class="popup-meta">${TYPE_LABELS[a.type] || a.type} · ${formatDuration(a.durationMinutes)}</div>
        ${a.mustDo ? '<span class="badge badge-must">⭐ Must-do</span>' : ''}
      </div>
    `);
    bounds.push(a.coords);
  });

  if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [30, 30] });
  }
}
