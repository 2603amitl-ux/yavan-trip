import { loadLocations } from '../store.js';
import { TYPE_LABELS, TYPE_ICONS, formatDuration } from '../util.js';

let mapInstance = null;

export async function renderMap(app) {
  const locations = await loadLocations();

  app.innerHTML = `
    <h1>מפת הטיול</h1>
    <p>כל האטרקציות מכל המקומות על מפה אחת. סננו לפי מקום או סוג אטרקציה.</p>
    <div class="map-controls">
      <select id="locationFilter" class="pill-select">
        <option value="all">כל המקומות</option>
        ${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
      </select>
      <select id="typeFilter" class="pill-select">
        <option value="all">כל הסוגים</option>
        ${Object.entries(TYPE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
    </div>
    <div id="leaflet-map"></div>
  `;

  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  const map = L.map('leaflet-map').setView([39.4, 21.8], 8);
  mapInstance = map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(map);

  const locationIcon = L.divIcon({
    className: 'loc-marker',
    html: '<div style="background:#0b3d61;color:#fff;border-radius:50%;width:14px;height:14px;border:2px solid #fff;box-shadow:0 0 0 2px #0b3d61;"></div>',
    iconSize: [14, 14],
  });

  const markers = [];

  locations.forEach(loc => {
    if (loc.coords) {
      const m = L.marker(loc.coords, { icon: locationIcon }).addTo(map);
      m.bindPopup(`<div class="map-popup"><h4>📍 ${loc.name}</h4><div class="popup-meta">${loc.region}</div><a href="#/location/${loc.id}">לעמוד המקום ←</a></div>`);
      markers.push({ marker: m, locationId: loc.id, type: '__location__' });
    }
    (loc.attractions || []).forEach(a => {
      if (!a.coords) return;
      const icon = L.divIcon({
        className: 'attr-marker',
        html: `<div style="background:${a.mustDo ? '#c1662f' : '#2ba8a0'};width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:11px;">${TYPE_ICONS[a.type] || '📍'}</span></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      });
      const m = L.marker(a.coords, { icon }).addTo(map);
      m.bindPopup(`
        <div class="map-popup">
          <h4>${TYPE_ICONS[a.type] || ''} ${a.name}</h4>
          <div class="popup-meta">${loc.name} · ${TYPE_LABELS[a.type] || a.type} · ${formatDuration(a.durationMinutes)}</div>
          ${a.mustDo ? '<span class="badge badge-must">⭐ Must-do</span>' : ''}
          <p style="margin-top:6px;"><a href="#/location/${loc.id}">לעמוד ${loc.name} ←</a></p>
        </div>
      `);
      markers.push({ marker: m, locationId: loc.id, type: a.type });
    });
  });

  function applyFilters() {
    const locF = document.getElementById('locationFilter').value;
    const typeF = document.getElementById('typeFilter').value;
    markers.forEach(({ marker, locationId, type }) => {
      const matchLoc = locF === 'all' || locationId === locF;
      const matchType = typeF === 'all' || type === typeF || type === '__location__';
      if (matchLoc && matchType) {
        if (!map.hasLayer(marker)) marker.addTo(map);
      } else {
        map.removeLayer(marker);
      }
    });
  }

  document.getElementById('locationFilter').addEventListener('change', applyFilters);
  document.getElementById('typeFilter').addEventListener('change', applyFilters);
}
