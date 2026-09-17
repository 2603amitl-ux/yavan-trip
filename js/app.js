import { renderHome } from './views/home.js';
import { renderLocation } from './views/location.js';
import { renderMap } from './views/map.js';
import { renderDistances } from './views/distances.js';
import { renderItinerary } from './views/itinerary.js';

const app = document.getElementById('app');
const navToggle = document.getElementById('navToggle');
const mainNav = document.getElementById('mainNav');

navToggle.addEventListener('click', () => mainNav.classList.toggle('open'));
mainNav.addEventListener('click', (e) => {
  if (e.target.tagName === 'A') mainNav.classList.remove('open');
});

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);
  return parts;
}

function setActiveNav(parts) {
  const links = mainNav.querySelectorAll('a');
  links.forEach(a => a.classList.remove('active'));
  const key = parts[0] || '';
  const match = [...links].find(a => a.getAttribute('href') === '#/' + key || (key === '' && a.getAttribute('href') === '#/'));
  if (match) match.classList.add('active');
}

async function route() {
  const parts = parseHash();
  setActiveNav(parts);
  app.innerHTML = '<div class="empty-state">טוען…</div>';
  window.scrollTo(0, 0);
  try {
    if (parts.length === 0) {
      await renderHome(app);
    } else if (parts[0] === 'location' && parts[1]) {
      await renderLocation(app, parts[1]);
    } else if (parts[0] === 'map') {
      await renderMap(app);
    } else if (parts[0] === 'distances') {
      await renderDistances(app);
    } else if (parts[0] === 'itinerary') {
      await renderItinerary(app);
    } else {
      app.innerHTML = '<div class="empty-state"><h2>הדף לא נמצא</h2><a class="btn" href="#/">חזרה לבית</a></div>';
    }
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="callout callout-danger"><span class="callout-icon">⚠️</span><div>שגיאה בטעינת הדף: ${err.message}</div></div>`;
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);
if (document.readyState !== 'loading') route();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(new URL('../service-worker.js', import.meta.url))
      .catch((err) => console.error('שגיאה ברישום Service Worker', err));
  });
}
