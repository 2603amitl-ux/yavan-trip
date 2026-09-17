import { loadLocations } from '../store.js';

export async function renderHome(app) {
  const locations = await loadLocations();

  app.innerHTML = `
    <section class="hero">
      <h1>הטיול המשותף ליוון</h1>
      <p>8 ימים מלאים בצפון ומרכז יוון — אתונה, דלפי, מטאורה, זגוריה ופרגה, עם שילוב של נופים, טרקים, יין וים.</p>
      <div class="hero-dates">🗓️ 18.9 (נחיתה 20:45) – 27.9 (המראה 00:05)</div>
    </section>

    <div class="callout callout-info">
      <span class="callout-icon">💡</span>
      <div>
        <b>איך להשתמש באתר:</b> עברו על עמודי המקומות למטה כדי להכיר את האטרקציות, בדקו את
        <a href="#/distances"><b>זמני הנסיעה</b></a> בין המקומות, ואז בנו את הלו"ז בפועל ב־
        <a href="#/itinerary"><b>בונה המסלול</b></a> — שם גם תקבלו התראה אם המסלול עמוס מדי או לא ריאלי.
      </div>
    </div>

    <div class="section-title-row">
      <h2>המקומות בטיול</h2>
    </div>
    <div class="location-grid" id="locationGrid"></div>
  `;

  const grid = document.getElementById('locationGrid');
  grid.innerHTML = locations.map(loc => `
    <a class="location-card" href="#/location/${loc.id}">
      <div class="thumb" style="${loc.heroImage ? `background-image:url('${loc.heroImage}')` : ''}">
        ${loc.heroImage ? '' : `<div class="thumb-fallback">📍</div>`}
      </div>
      <div class="body">
        <h3>${loc.name}</h3>
        <div class="region">${loc.region}</div>
        <p>${loc.summary}</p>
        <div class="stay-time">⏱️ ${loc.suggestedStay}</div>
      </div>
    </a>
  `).join('');
}
