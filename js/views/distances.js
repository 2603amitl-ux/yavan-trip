import { loadLocations, loadTravelTimes, getTravelTime } from '../store.js';
import { formatHours } from '../util.js';

export async function renderDistances(app) {
  const locations = await loadLocations();

  app.innerHTML = `
    <h1>מרחקי נסיעה בין המקומות</h1>
    <p>זמני נהיגה מוערכים (בשעות) וק"מ בין כל המקומות במסלול. ערכים באדום/מוערכים מסומנים כאשר אין נתון מחקר ישיר.</p>
    <div class="distance-table-wrap"><table class="distance-table" id="distTable"></table></div>

    <div class="section-title-row"><h2>בדיקת מסלול נקודתית</h2></div>
    <div class="route-picker">
      <select id="fromSel" class="pill-select">${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}</select>
      <span>←</span>
      <select id="toSel" class="pill-select">${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}</select>
    </div>
    <div class="route-result" id="routeResult"></div>
  `;

  const table = document.getElementById('distTable');
  table.innerHTML = `
    <thead><tr><th></th>${locations.map(l => `<th>${l.name}</th>`).join('')}</tr></thead>
    <tbody>
      ${(await Promise.all(locations.map(async rowLoc => {
        const cells = await Promise.all(locations.map(async colLoc => {
          if (rowLoc.id === colLoc.id) return '<td class="diag">—</td>';
          const t = await getTravelTime(rowLoc.id, colLoc.id);
          return `<td title="${t.notes || ''}">${formatHours(t.hours)}${t.estimated ? ' *' : ''}<span class="km">${Math.round(t.km)} ק"מ</span></td>`;
        }));
        return `<tr><td>${rowLoc.name}</td>${cells.join('')}</tr>`;
      }))).join('')}
    </tbody>
  `;

  const fromSel = document.getElementById('fromSel');
  const toSel = document.getElementById('toSel');
  toSel.value = locations[1] ? locations[1].id : locations[0].id;
  const resultEl = document.getElementById('routeResult');

  async function updateRoute() {
    const from = fromSel.value, to = toSel.value;
    if (from === to) {
      resultEl.innerHTML = '';
      return;
    }
    const t = await getTravelTime(from, to);
    const fromName = locations.find(l => l.id === from).name;
    const toName = locations.find(l => l.id === to).name;
    resultEl.innerHTML = `
      <div class="card">
        <h3>${fromName} → ${toName}</h3>
        <p>🚗 <b>${formatHours(t.hours)}</b> · 📏 <b>${Math.round(t.km)} ק"מ</b></p>
        ${t.estimated ? `<div class="callout callout-warning"><span class="callout-icon">ℹ️</span><div>זהו אומדן (אין נתון מחקר ישיר בין שני המקומות האלה) — ${t.notes}</div></div>` : `<p class="region">${t.notes || ''}</p>`}
      </div>
    `;
  }

  fromSel.addEventListener('change', updateRoute);
  toSel.addEventListener('change', updateRoute);
  updateRoute();
}
