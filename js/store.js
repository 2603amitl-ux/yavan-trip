import { haversineKm, TRIP_DATES } from './util.js';
import { DEFAULT_ITINERARY } from './default-itinerary.js';

let _locationsBase = null;
let _travelTimes = null;

async function loadLocationsBase() {
  if (_locationsBase) return _locationsBase;
  const res = await fetch('data/locations.json');
  _locationsBase = await res.json();
  return _locationsBase;
}

// Merges each location's researched attractions with any attractions the user added herself
// (stored locally, see the custom-attractions section below). Re-merges on every call so newly
// added/removed custom attractions show up immediately without needing a page reload.
export async function loadLocations() {
  const base = await loadLocationsBase();
  const custom = loadCustomAttractions();
  return base.map(loc => ({
    ...loc,
    attractions: [...loc.attractions, ...(custom[loc.id] || [])],
  }));
}

export async function loadTravelTimes() {
  if (_travelTimes) return _travelTimes;
  const res = await fetch('data/travel-times.json');
  _travelTimes = await res.json();
  return _travelTimes;
}

export async function getLocationById(id) {
  const locs = await loadLocations();
  return locs.find(l => l.id === id);
}

// Returns { hours, km, estimated, notes } for travel between two location ids.
// Falls back to a haversine-based estimate (avg 55km/h on mountain/rural Greek roads) if no researched edge exists.
export async function getTravelTime(fromId, toId) {
  if (fromId === toId) return { hours: 0, km: 0, estimated: false, notes: '' };
  const edges = await loadTravelTimes();
  const direct = edges.find(e =>
    (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId));
  if (direct) return { hours: direct.hours, km: direct.km, estimated: false, notes: direct.notes || '' };

  const locs = await loadLocations();
  const a = locs.find(l => l.id === fromId);
  const b = locs.find(l => l.id === toId);
  if (a && b && a.coords && b.coords) {
    const km = haversineKm(a.coords, b.coords) * 1.35; // road-distance fudge factor for winding Greek roads
    const hours = km / 55;
    return { hours, km, estimated: true, notes: 'הערכה גסה (אין נתון מחקר ישיר) — מרחק אווירי + מקדם כבישים' };
  }
  return { hours: 2, km: 100, estimated: true, notes: 'לא ידוע — ברירת מחדל גסה' };
}

// ---------------- Itinerary (trip plan) persistence ----------------
//
// Free-form day planner: every date in TRIP_DATES always exists as a slot.
// Each day holds an ordered list of "blocks" the user builds up themselves:
//   { type: 'attraction', locationId, attractionId }         — picked from a location's catalog
//   { type: 'custom', label, minutes }                       — free-text item (breakfast, food tour, ...)
//   { type: 'travel', fromId, toId, hours, estimated }       — a drive between two known locations, auto-timed
//
// dayIndex 0 = arrival evening (Sept 18, budget 3h), last index = departure day (budget 13h window).
//
// Multiple named "route options" can exist side by side (e.g. to compare a Parga-leg plan against
// a Pelion-leg plan) — all stored together, keyed by an internal plan id, with one marked active.

const PLANS_KEY = 'greece-trip-plans-v1';
const LEGACY_PLAN_KEY = 'greece-trip-plan-v2'; // pre-multi-plan storage, migrated once then dropped

function buildDefaultDays() {
  const days = {};
  TRIP_DATES.forEach((date, i) => {
    days[date] = {
      budgetHours: i === 0 ? 3 : (i === TRIP_DATES.length - 1 ? 13 : 9),
      blocks: [],
    };
  });
  return days;
}

function sanitizeDays(rawDays) {
  const base = buildDefaultDays();
  if (rawDays && typeof rawDays === 'object') {
    TRIP_DATES.forEach(date => {
      if (rawDays[date]) base[date] = rawDays[date];
    });
  }
  return base;
}

function makePlanId() {
  return 'plan_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

// The trip's pre-planned itinerary, bundled with the site (see default-itinerary.js) so it's
// there from the first visit on any device — no per-device setup needed. A device only falls
// back to a blank plan if that bundled data is ever missing entirely.
function buildDefaultState() {
  if (DEFAULT_ITINERARY && DEFAULT_ITINERARY.plans && Object.keys(DEFAULT_ITINERARY.plans).length) {
    const src = JSON.parse(JSON.stringify(DEFAULT_ITINERARY));
    const order = Array.isArray(src.order) ? src.order.filter(id => src.plans[id]) : Object.keys(src.plans);
    const plans = {};
    order.forEach(id => {
      const p = src.plans[id] || {};
      plans[id] = { id, name: p.name || 'מסלול', days: sanitizeDays(p.days) };
    });
    const activeId = order.includes(src.activeId) ? src.activeId : order[0];
    return { activeId, order, plans };
  }
  const id = makePlanId();
  return { activeId: id, order: [id], plans: { [id]: { id, name: 'מסלול 1', days: buildDefaultDays() } } };
}

// One-time migration from the old single-plan storage format, if present.
function migrateLegacyState() {
  const legacyRaw = localStorage.getItem(LEGACY_PLAN_KEY);
  if (!legacyRaw) return null;
  let state = null;
  try {
    const parsed = JSON.parse(legacyRaw);
    if (parsed && typeof parsed.days === 'object') {
      const id = makePlanId();
      state = { activeId: id, order: [id], plans: { [id]: { id, name: 'מסלול 1', days: sanitizeDays(parsed.days) } } };
    }
  } catch {
    // fall through, treated as unrecoverable
  }
  localStorage.removeItem(LEGACY_PLAN_KEY);
  return state;
}

// True when every plan on this device is still completely untouched (no blocks added to any
// day, on any plan). A device that only ever got this far — e.g. it loaded the site once before
// the trip's default itinerary existed — should still pick up the bundled itinerary rather than
// stay stuck on the blank state it happened to save first.
function isStateBlank(state) {
  return Object.values(state.plans).every((p) =>
    Object.values(p.days).every((d) => !d.blocks || d.blocks.length === 0));
}

function loadState() {
  try {
    const raw = localStorage.getItem(PLANS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.plans && typeof parsed.plans === 'object' && Object.keys(parsed.plans).length) {
        const order = Array.isArray(parsed.order) ? parsed.order.filter(id => parsed.plans[id]) : [];
        Object.keys(parsed.plans).forEach(id => { if (!order.includes(id)) order.push(id); });
        const plans = {};
        order.forEach(id => {
          const p = parsed.plans[id] || {};
          plans[id] = { id, name: p.name || 'מסלול', days: sanitizeDays(p.days) };
        });
        const activeId = order.includes(parsed.activeId) ? parsed.activeId : order[0];
        const state = { activeId, order, plans };
        if (isStateBlank(state) && DEFAULT_ITINERARY) {
          const seeded = buildDefaultState();
          saveState(seeded);
          return seeded;
        }
        return state;
      }
    }
  } catch {
    // fall through to migration / defaults
  }
  // Migration consumes the legacy key as a side effect, and a fresh default state mints a random
  // plan id — both must be persisted immediately so a second loadState() call in the same tick
  // (renderItinerary reads activeId and the plan separately) sees the exact same state instead of
  // re-deriving a divergent one.
  const state = migrateLegacyState() || buildDefaultState();
  saveState(state);
  return state;
}

function saveState(state) {
  localStorage.setItem(PLANS_KEY, JSON.stringify(state));
}

// [{ id, name, active }] in display order.
export function listPlans() {
  const state = loadState();
  return state.order.map(id => ({ id, name: state.plans[id].name, active: id === state.activeId }));
}

export function getActivePlanId() {
  return loadState().activeId;
}

export function setActivePlanId(id) {
  const state = loadState();
  if (!state.plans[id]) return;
  state.activeId = id;
  saveState(state);
}

// Returns { days } for the given plan id (or the active plan if omitted/unknown).
export function loadPlan(id) {
  const state = loadState();
  const targetId = (id && state.plans[id]) ? id : state.activeId;
  return { days: state.plans[targetId].days };
}

export function savePlan(id, plan) {
  const state = loadState();
  if (!state.plans[id]) return;
  state.plans[id].days = plan.days;
  saveState(state);
}

// Creates a new route option — blank, or a deep copy of an existing plan's days — and makes it active.
export function createPlan(name, cloneFromId) {
  const state = loadState();
  const id = makePlanId();
  const days = (cloneFromId && state.plans[cloneFromId])
    ? JSON.parse(JSON.stringify(state.plans[cloneFromId].days))
    : buildDefaultDays();
  state.plans[id] = { id, name: (name || '').trim() || `מסלול ${state.order.length + 1}`, days };
  state.order.push(id);
  state.activeId = id;
  saveState(state);
  return id;
}

export function renamePlan(id, name) {
  const state = loadState();
  const trimmed = (name || '').trim();
  if (!state.plans[id] || !trimmed) return;
  state.plans[id].name = trimmed;
  saveState(state);
}

// No-op if this is the last remaining plan — there must always be at least one.
export function deletePlan(id) {
  const state = loadState();
  if (state.order.length <= 1 || !state.plans[id]) return;
  state.order = state.order.filter(pid => pid !== id);
  delete state.plans[id];
  if (state.activeId === id) state.activeId = state.order[0];
  saveState(state);
}

export function resetPlan(id) {
  const state = loadState();
  const targetId = (id && state.plans[id]) ? id : state.activeId;
  state.plans[targetId].days = buildDefaultDays();
  saveState(state);
}

// ---------------- User-added custom attractions ----------------
// Stored locally per location: { [locationId]: [ { id, name, type, durationMinutes, description, link, custom:true }, ... ] }

const CUSTOM_ATTRACTIONS_KEY = 'greece-trip-custom-attractions-v1';

export function loadCustomAttractions() {
  try {
    const raw = localStorage.getItem(CUSTOM_ATTRACTIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch {
    return {};
  }
}

function saveCustomAttractions(all) {
  localStorage.setItem(CUSTOM_ATTRACTIONS_KEY, JSON.stringify(all));
}

export function addCustomAttraction(locationId, attraction) {
  const all = loadCustomAttractions();
  if (!all[locationId]) all[locationId] = [];
  const id = 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  const entry = { ...attraction, id, custom: true, images: [], mustDo: false };
  all[locationId].push(entry);
  saveCustomAttractions(all);
  return entry;
}

export function removeCustomAttraction(locationId, attractionId) {
  const all = loadCustomAttractions();
  if (!all[locationId]) return;
  all[locationId] = all[locationId].filter(a => a.id !== attractionId);
  saveCustomAttractions(all);
}
