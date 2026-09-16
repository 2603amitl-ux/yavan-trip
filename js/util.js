export const TRIP_DATES = [
  '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22',
  '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26',
];

const WEEKDAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export function dateLabel(iso) {
  const d = new Date(iso + 'T12:00:00');
  const wd = WEEKDAYS_HE[d.getDay()];
  return `יום ${wd}, ${d.getDate()}.${d.getMonth() + 1}`;
}

export const TYPE_LABELS = {
  site: 'אתר היסטורי',
  walk: 'שיטוט עירוני',
  hike: 'מסלול הליכה',
  beach: 'חוף',
};

export const TYPE_ICONS = {
  site: '🏛️',
  walk: '🚶',
  hike: '🥾',
  beach: '🏖️',
};

export const DIFFICULTY_LABELS = {
  easy: 'קל',
  moderate: 'בינוני',
  hard: 'מאתגר',
};

export function formatDuration(minutes) {
  if (minutes == null) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} דק'`;
  if (m === 0) return `${h} שע'`;
  return `${h} שע' ${m} דק'`;
}

export function formatHours(hoursFloat) {
  if (hoursFloat == null) return '';
  const h = Math.floor(hoursFloat);
  const m = Math.round((hoursFloat - h) * 60);
  if (m === 0) return `${h} שע'`;
  return `${h} שע' ${m} דק'`;
}

export function haversineKm([lat1, lng1], [lat2, lng2]) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

export function getAttractionImages(attraction) {
  if (Array.isArray(attraction.images) && attraction.images.length) return attraction.images;
  if (attraction.image) return [attraction.image];
  return [];
}

// Renders a thumb — a single image, a browsable carousel (prev/next arrows + dots) if there are
// multiple images, or an icon fallback if there are none. Pairs with wireAttractionCarousels() below,
// which should be called once on a delegated click listener over the container holding these thumbs.
export function attractionThumbHtml(attraction) {
  const images = getAttractionImages(attraction);
  const icon = TYPE_ICONS[attraction.type] || '📍';
  if (!images.length) {
    return `<div class="thumb-fallback">${icon}</div>`;
  }
  const alt = String(attraction.name).replace(/"/g, '&quot;');
  if (images.length === 1) {
    return `<img src="${images[0]}" alt="${alt}" loading="lazy" onerror="this.parentElement.classList.add('thumb-fallback');this.remove();">`;
  }
  const imagesAttr = JSON.stringify(images).replace(/'/g, '&#39;');
  return `
    <div class="thumb-carousel" data-images='${imagesAttr}' data-idx="0" data-icon="${icon}">
      <img src="${images[0]}" alt="${alt}" loading="lazy" onerror="this.closest('.thumb-carousel').classList.add('img-broken');">
      <button type="button" class="carousel-btn prev" data-role="carousel-prev" aria-label="התמונה הקודמת">‹</button>
      <button type="button" class="carousel-btn next" data-role="carousel-next" aria-label="התמונה הבאה">›</button>
      <div class="carousel-dots">${images.map((_, i) => `<span class="carousel-dot ${i === 0 ? 'active' : ''}"></span>`).join('')}</div>
    </div>
  `;
}

// Attach once to a container that holds one or more .thumb-carousel elements (event delegation),
// so prev/next clicks work no matter how many carousels are re-rendered inside it.
export function wireAttractionCarousels(container) {
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.carousel-btn');
    if (!btn) return;
    const carousel = btn.closest('.thumb-carousel');
    if (!carousel) return;
    const images = JSON.parse(carousel.dataset.images);
    let idx = Number(carousel.dataset.idx);
    idx = btn.dataset.role === 'carousel-next' ? (idx + 1) % images.length : (idx - 1 + images.length) % images.length;
    carousel.dataset.idx = idx;
    carousel.classList.remove('img-broken');
    carousel.querySelector('img').src = images[idx];
    carousel.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
  });
}
