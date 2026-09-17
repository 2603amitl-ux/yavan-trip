import {
  loadLocations, getTravelTime,
  loadPlan, savePlan, resetPlan,
  listPlans, getActivePlanId, setActivePlanId, createPlan, renamePlan, deletePlan,
} from '../store.js';
import { formatHours, formatDuration, TYPE_ICONS, TRIP_DATES, dateLabel } from '../util.js';

let locationsCache = [];

export async function renderItinerary(app) {
  locationsCache = await loadLocations();
  let activePlanId = getActivePlanId();
  let plan = loadPlan(activePlanId);

  // Which plan pill (if any) is currently showing its rename input — transient UI state, not persisted.
  let renamingPlanId = null;

  const attractionIndex = {}; // attractionId -> { attraction, locationId }
  locationsCache.forEach(l => (l.attractions || []).forEach(a => {
    attractionIndex[a.id] = { attraction: a, locationId: l.id };
  }));

  // Which "add item" tab is currently open per day — transient UI state, not persisted.
  const addTab = {};
  TRIP_DATES.forEach(d => { addTab[d] = 'attraction'; });

  // Which block index (if any) is currently being edited per day — transient UI state, not persisted.
  const editing = {};

  function locName(id) {
    const l = locationsCache.find(l => l.id === id);
    return l ? l.name : id;
  }

  function escAttr(s) {
    return String(s ?? '').replace(/"/g, '&quot;');
  }

  function refreshDay(date) {
    const idx = TRIP_DATES.indexOf(date);
    const daysContainer = document.getElementById('daysContainer');
    const oldEl = daysContainer.children[idx];
    const newEl = buildDayCard(date, idx);
    daysContainer.replaceChild(newEl, oldEl);
  }

  function blockMinutes(block) {
    if (block.type === 'custom') return block.minutes;
    if (block.type === 'attraction') return block.minutes ?? (attractionIndex[block.attractionId]?.attraction.durationMinutes || 0);
    if (block.type === 'travel') return Math.round(block.hours * 60);
    return 0;
  }

  function blockInfo(block) {
    if (block.type === 'custom') {
      return { icon: '📝', label: block.label, sub: 'פעילות מותאמת אישית', minutes: block.minutes };
    }
    if (block.type === 'attraction') {
      const entry = attractionIndex[block.attractionId];
      if (!entry) return { icon: '❓', label: 'אטרקציה לא זמינה יותר', sub: '', minutes: 0 };
      const { attraction, locationId } = entry;
      const subParts = [locName(locationId)];
      if (attraction.mustDo) subParts.push('⭐ Must-do');
      if (block.note) subParts.push(block.note);
      return {
        icon: TYPE_ICONS[attraction.type] || '📍',
        label: attraction.name,
        sub: subParts.join(' · '),
        minutes: block.minutes ?? attraction.durationMinutes,
      };
    }
    if (block.type === 'travel') {
      return {
        icon: '🚗',
        label: `${locName(block.fromId)} → ${locName(block.toId)}`,
        sub: block.estimated ? 'זמן נסיעה משוער' : 'זמן נסיעה',
        minutes: Math.round(block.hours * 60),
      };
    }
    return { icon: '❓', label: '?', sub: '', minutes: 0 };
  }

  function blockRowHtml(block, i, date) {
    if (editing[date] === i) return editRowHtml(block, i);
    const info = blockInfo(block);
    return `
      <div class="block-row" data-idx="${i}" draggable="true">
        <span class="block-handle" title="גררו כדי לסדר מחדש">⠿</span>
        <span class="block-icon">${info.icon}</span>
        <div class="block-body">
          <div class="block-label">${info.label}</div>
          ${info.sub ? `<div class="block-sub">${info.sub}</div>` : ''}
        </div>
        <span class="block-dur">${formatDuration(info.minutes)}</span>
        <div class="block-actions">
          <button type="button" data-role="block-edit" title="ערוך">✏️</button>
          <button type="button" data-role="block-up" title="הזז למעלה">▲</button>
          <button type="button" data-role="block-down" title="הזז למטה">▼</button>
          <button type="button" data-role="block-remove" title="הסר">✕</button>
        </div>
      </div>
    `;
  }

  function editRowHtml(block, i) {
    const saveCancelBtns = `
      <div class="block-actions">
        <button type="button" data-role="edit-save" title="שמור">✔</button>
        <button type="button" data-role="edit-cancel" title="ביטול">✕</button>
      </div>`;
    if (block.type === 'custom') {
      return `
        <div class="block-row block-row-edit" data-idx="${i}">
          <span class="block-icon">📝</span>
          <div class="block-edit-fields">
            <input type="text" value="${escAttr(block.label)}" data-role="edit-label" />
            <input type="number" min="0" max="24" value="${Math.floor(block.minutes / 60)}" data-role="edit-hours" /><span>שע'</span>
            <input type="number" min="0" max="59" step="5" value="${block.minutes % 60}" data-role="edit-minutes" /><span>דק'</span>
          </div>
          ${saveCancelBtns}
        </div>
      `;
    }
    if (block.type === 'attraction') {
      const entry = attractionIndex[block.attractionId];
      const minutes = block.minutes ?? (entry ? entry.attraction.durationMinutes : 0);
      return `
        <div class="block-row block-row-edit" data-idx="${i}">
          <span class="block-icon">${entry ? (TYPE_ICONS[entry.attraction.type] || '📍') : '❓'}</span>
          <div class="block-edit-fields">
            <span class="block-sub">${entry ? entry.attraction.name : 'אטרקציה לא זמינה'}</span>
            <input type="number" min="0" max="24" value="${Math.floor(minutes / 60)}" data-role="edit-hours" /><span>שע'</span>
            <input type="number" min="0" max="59" step="5" value="${minutes % 60}" data-role="edit-minutes" /><span>דק'</span>
            <input type="text" placeholder="הערה אישית" value="${escAttr(block.note)}" data-role="edit-note" />
          </div>
          ${saveCancelBtns}
        </div>
      `;
    }
    if (block.type === 'travel') {
      return `
        <div class="block-row block-row-edit" data-idx="${i}">
          <span class="block-icon">🚗</span>
          <div class="block-edit-fields">
            <select class="pill-select" data-role="edit-from">
              ${locationsCache.map(l => `<option value="${l.id}" ${l.id === block.fromId ? 'selected' : ''}>${l.name}</option>`).join('')}
            </select>
            <span>→</span>
            <select class="pill-select" data-role="edit-to">
              ${locationsCache.map(l => `<option value="${l.id}" ${l.id === block.toId ? 'selected' : ''}>${l.name}</option>`).join('')}
            </select>
            <div class="add-block-preview" data-role="edit-travel-preview"></div>
          </div>
          ${saveCancelBtns}
        </div>
      `;
    }
    return '';
  }

  app.innerHTML = `
    <h1>בונה מסלול אינטראקטיבי</h1>
    <p>לכל תאריך בטיול (18.9–26.9) כבר יש כרטיס למטה. הוסיפו לכל יום אטרקציות מהאתר, פעילויות משלכם (ארוחות, סיורים...), ונסיעות בין מקומות — הזמן מחושב לבד.</p>
    <div class="callout callout-info"><span class="callout-icon">💡</span><div>עוברים במקום בלי ללון בו (למשל דלפי בדרך למטאורה)? הוסיפו לאותו יום גם אטרקציה מדלפי וגם נסיעה "מ" ו"אל" בהתאם — הכול יחד באותו כרטיס יום.</div></div>
    <div class="callout callout-info"><span class="callout-icon">🔀</span><div>רוצים לבדוק כמה גרסאות של המסלול זו מול זו (למשל עם פרגה מול עם פליו)? השתמשו ב"אופציות מסלול" למטה — כל אופציה נשמרת בנפרד, אפשר לשכפל אחת קיימת כנקודת התחלה ולערוך בלי לאבד את המקור.</div></div>

    <div class="plan-bar" id="planBar"></div>

    <div class="summary-bar" id="summaryBar"></div>
    <div id="warningsBox"></div>

    <div class="days-list" id="daysContainer"></div>

    <div style="margin-top:24px;">
      <button class="btn btn-outline btn-sm" id="resetBtn">איפוס אופציית המסלול הנוכחית</button>
    </div>
  `;

  function escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderPlanBar() {
    const plans = listPlans();
    const bar = document.getElementById('planBar');
    bar.innerHTML = `
      <div class="plan-pills">
        ${plans.map(p => {
          const days = (p.id === activePlanId ? plan.days : loadPlan(p.id).days);
          const filled = TRIP_DATES.filter(d => days[d].blocks.length > 0).length;
          if (renamingPlanId === p.id) {
            return `
              <div class="plan-pill ${p.active ? 'active' : ''}" data-id="${p.id}">
                <input type="text" class="plan-pill-input" data-role="rename-input" value="${escAttr(p.name)}" />
                <span class="plan-pill-actions">
                  <button type="button" data-role="rename-save" title="שמור">✔</button>
                  <button type="button" data-role="rename-cancel" title="ביטול">✕</button>
                </span>
              </div>`;
          }
          return `
            <div class="plan-pill ${p.active ? 'active' : ''}" data-id="${p.id}">
              <button type="button" class="plan-pill-name" data-role="select-plan" title="מעבר לאופציה זו">${escHtml(p.name)}</button>
              <span class="plan-pill-meta">${filled}/${TRIP_DATES.length} ימים</span>
              <span class="plan-pill-actions">
                <button type="button" data-role="rename-plan" title="שינוי שם">✏️</button>
                <button type="button" data-role="duplicate-plan" title="שכפול כאופציה חדשה">⧉</button>
                ${plans.length > 1 ? `<button type="button" data-role="delete-plan" title="מחיקת אופציה זו">✕</button>` : ''}
              </span>
            </div>`;
        }).join('')}
        <button type="button" class="plan-pill-add" id="addPlanBtn">+ אופציית מסלול חדשה</button>
      </div>
    `;

    bar.querySelectorAll('[data-role="select-plan"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('.plan-pill').dataset.id;
        if (id === activePlanId) return;
        setActivePlanId(id);
        activePlanId = id;
        plan = loadPlan(activePlanId);
        renamingPlanId = null;
        editingReset();
        await fullRerender();
      });
    });
    bar.querySelectorAll('[data-role="rename-plan"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        renamingPlanId = e.target.closest('.plan-pill').dataset.id;
        renderPlanBar();
      });
    });
    bar.querySelectorAll('[data-role="rename-cancel"]').forEach(btn => {
      btn.addEventListener('click', () => {
        renamingPlanId = null;
        renderPlanBar();
      });
    });
    bar.querySelectorAll('[data-role="rename-save"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const pillEl = e.target.closest('.plan-pill');
        const id = pillEl.dataset.id;
        const value = pillEl.querySelector('[data-role="rename-input"]').value;
        renamePlan(id, value);
        renamingPlanId = null;
        renderPlanBar();
      });
    });
    bar.querySelectorAll('[data-role="duplicate-plan"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('.plan-pill').dataset.id;
        const srcName = plans.find(p => p.id === id)?.name || 'מסלול';
        const newId = createPlan(`${srcName} (עותק)`, id);
        activePlanId = newId;
        plan = loadPlan(activePlanId);
        editingReset();
        await fullRerender();
      });
    });
    bar.querySelectorAll('[data-role="delete-plan"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('.plan-pill').dataset.id;
        deletePlan(id);
        activePlanId = getActivePlanId();
        plan = loadPlan(activePlanId);
        editingReset();
        await fullRerender();
      });
    });
    document.getElementById('addPlanBtn').addEventListener('click', async () => {
      const newId = createPlan(`אופציה ${plans.length + 1}`);
      activePlanId = newId;
      plan = loadPlan(activePlanId);
      editingReset();
      await fullRerender();
    });
  }

  function editingReset() {
    TRIP_DATES.forEach(d => { addTab[d] = 'attraction'; editing[d] = null; });
  }

  async function rerender() {
    savePlan(activePlanId, plan);
    renderPlanBar();
    await renderSummaryAndDays();
  }

  async function fullRerender() {
    renderPlanBar();
    await renderSummaryAndDays();
  }

  function buildDayCard(date, index) {
    const day = plan.days[date];
    const isArrival = index === 0;
    const isLastDay = index === TRIP_DATES.length - 1;
    const usedMinutes = day.blocks.reduce((sum, b) => sum + blockMinutes(b), 0);
    const usedHours = usedMinutes / 60;
    const pct = day.budgetHours > 0 ? Math.min(100, (usedHours / day.budgetHours) * 100) : 100;
    const over = usedHours > day.budgetHours;

    const dayEl = document.createElement('div');
    dayEl.className = 'card day-card';
    dayEl.innerHTML = `
      <div class="day-head">
        <span class="date">${dateLabel(date)}</span>
        <span class="tag">${isArrival ? '🛬 יום ההגעה (נחיתה 20:45)' : ''}${isLastDay ? '🛫 יום אחרון — טיסה 00:05' : ''}</span>
      </div>
      <div class="day-budget-row">
        <span>שעות זמינות היום:</span>
        <input type="number" min="0" max="20" step="0.5" value="${day.budgetHours}" data-role="budget" />
        <span>נוצלו: <b>${formatHours(usedHours)}</b></span>
      </div>
      <div class="hours-bar-wrap"><div class="hours-bar ${over ? 'over' : ''}" style="width:${pct}%"></div></div>
      <div class="block-list">
        ${day.blocks.length ? day.blocks.map((b, i) => blockRowHtml(b, i, date)).join('') : '<div class="empty-day">היום עדיין ריק — הוסיפו פריטים למטה.</div>'}
      </div>
      <div class="add-block">
        <div class="add-block-tabs">
          <button type="button" class="add-block-tab ${addTab[date] === 'attraction' ? 'active' : ''}" data-tab="attraction">🏛️ אטרקציה מהאתר</button>
          <button type="button" class="add-block-tab ${addTab[date] === 'custom' ? 'active' : ''}" data-tab="custom">📝 פעילות משלי</button>
          <button type="button" class="add-block-tab ${addTab[date] === 'travel' ? 'active' : ''}" data-tab="travel">🚗 נסיעה</button>
        </div>
        <div class="add-block-fields" data-fields="attraction" style="${addTab[date] === 'attraction' ? '' : 'display:none;'}">
          <select class="pill-select" data-role="loc-select">
            ${locationsCache.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
          </select>
          <select class="pill-select" data-role="att-select"></select>
          <input type="number" min="0" max="24" value="0" data-role="att-hours" title="שעות" />
          <span>שע'</span>
          <input type="number" min="0" max="59" step="5" value="0" data-role="att-minutes" title="דקות" />
          <span>דק'</span>
          <input type="text" placeholder="הערה אישית (רשות)" data-role="att-note" />
          <button type="button" class="btn btn-sm" data-role="add-attraction">+ הוספה</button>
        </div>
        <div class="add-block-fields" data-fields="custom" style="${addTab[date] === 'custom' ? '' : 'display:none;'}">
          <input type="text" placeholder="לדוגמה: ארוחת בוקר במלון" data-role="custom-label" />
          <input type="number" min="0" max="12" value="1" data-role="custom-hours" title="שעות" />
          <span>שע'</span>
          <input type="number" min="0" max="59" step="5" value="0" data-role="custom-minutes" title="דקות" />
          <span>דק'</span>
          <button type="button" class="btn btn-sm" data-role="add-custom">+ הוספה</button>
        </div>
        <div class="add-block-fields" data-fields="travel" style="${addTab[date] === 'travel' ? '' : 'display:none;'}">
          <select class="pill-select" data-role="from-select">
            ${locationsCache.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
          </select>
          <span>→</span>
          <select class="pill-select" data-role="to-select">
            ${locationsCache.map((l, i2) => `<option value="${l.id}" ${i2 === 1 ? 'selected' : ''}>${l.name}</option>`).join('')}
          </select>
          <button type="button" class="btn btn-sm" data-role="add-travel">+ הוספה</button>
          <div class="add-block-preview" data-role="travel-preview"></div>
        </div>
      </div>
    `;

    // ---- tab switching (pure local DOM, no data mutation / no rerender) ----
    dayEl.querySelectorAll('.add-block-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        addTab[date] = btn.dataset.tab;
        dayEl.querySelectorAll('.add-block-tab').forEach(b => b.classList.toggle('active', b === btn));
        dayEl.querySelectorAll('.add-block-fields').forEach(f => {
          f.style.display = f.dataset.fields === btn.dataset.tab ? '' : 'none';
        });
      });
    });

    // ---- attraction tab ----
    const locSelect = dayEl.querySelector('[data-role="loc-select"]');
    const attSelect = dayEl.querySelector('[data-role="att-select"]');
    const attHours = dayEl.querySelector('[data-role="att-hours"]');
    const attMinutes = dayEl.querySelector('[data-role="att-minutes"]');
    function applyDefaultDuration() {
      const entry = attractionIndex[attSelect.value];
      const minutes = entry ? entry.attraction.durationMinutes : 0;
      attHours.value = Math.floor(minutes / 60);
      attMinutes.value = minutes % 60;
    }
    function populateAttSelect() {
      const loc = locationsCache.find(l => l.id === locSelect.value);
      const opts = (loc?.attractions || []).filter(a => !a.closed);
      attSelect.innerHTML = opts.length
        ? opts.map(a => `<option value="${a.id}">${a.mustDo ? '⭐ ' : ''}${a.name} (${formatDuration(a.durationMinutes)})</option>`).join('')
        : '<option value="">אין אטרקציות זמינות במקום הזה</option>';
      applyDefaultDuration();
    }
    populateAttSelect();
    locSelect.addEventListener('change', populateAttSelect);
    attSelect.addEventListener('change', applyDefaultDuration);
    dayEl.querySelector('[data-role="add-attraction"]').addEventListener('click', async () => {
      const attId = attSelect.value;
      if (!attId) return;
      const hrs = Number(attHours.value) || 0;
      const mins = Number(attMinutes.value) || 0;
      const note = dayEl.querySelector('[data-role="att-note"]').value.trim();
      day.blocks.push({ type: 'attraction', locationId: locSelect.value, attractionId: attId, minutes: hrs * 60 + mins, note });
      await rerender();
    });

    // ---- custom tab ----
    dayEl.querySelector('[data-role="add-custom"]').addEventListener('click', async () => {
      const label = dayEl.querySelector('[data-role="custom-label"]').value.trim();
      const hrs = Number(dayEl.querySelector('[data-role="custom-hours"]').value) || 0;
      const mins = Number(dayEl.querySelector('[data-role="custom-minutes"]').value) || 0;
      if (!label) return;
      day.blocks.push({ type: 'custom', label, minutes: hrs * 60 + mins });
      await rerender();
    });

    // ---- travel tab ----
    const fromSelect = dayEl.querySelector('[data-role="from-select"]');
    const toSelect = dayEl.querySelector('[data-role="to-select"]');
    const preview = dayEl.querySelector('[data-role="travel-preview"]');
    async function updatePreview() {
      if (fromSelect.value === toSelect.value) {
        preview.textContent = 'בחרו שני מקומות שונים';
        return;
      }
      const t = await getTravelTime(fromSelect.value, toSelect.value);
      preview.textContent = `⏱️ זמן משוער: ${formatHours(t.hours)} (${Math.round(t.km)} ק"מ)${t.estimated ? ' — הערכה' : ''}`;
    }
    fromSelect.addEventListener('change', updatePreview);
    toSelect.addEventListener('change', updatePreview);
    updatePreview();
    dayEl.querySelector('[data-role="add-travel"]').addEventListener('click', async () => {
      const fromId = fromSelect.value, toId = toSelect.value;
      if (fromId === toId) return;
      const t = await getTravelTime(fromId, toId);
      day.blocks.push({ type: 'travel', fromId, toId, hours: t.hours, estimated: t.estimated });
      await rerender();
    });

    // ---- budget input ----
    dayEl.querySelector('[data-role="budget"]').addEventListener('change', async (e) => {
      day.budgetHours = Math.max(0, Number(e.target.value) || 0);
      await rerender();
    });

    // ---- block row actions ----
    dayEl.querySelectorAll('[data-role="block-edit"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const i = Number(e.target.closest('.block-row').dataset.idx);
        editing[date] = i;
        refreshDay(date);
      });
    });
    dayEl.querySelectorAll('[data-role="block-remove"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const i = Number(e.target.closest('.block-row').dataset.idx);
        day.blocks.splice(i, 1);
        await rerender();
      });
    });
    dayEl.querySelectorAll('[data-role="block-up"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const i = Number(e.target.closest('.block-row').dataset.idx);
        if (i <= 0) return;
        [day.blocks[i - 1], day.blocks[i]] = [day.blocks[i], day.blocks[i - 1]];
        await rerender();
      });
    });
    dayEl.querySelectorAll('[data-role="block-down"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const i = Number(e.target.closest('.block-row').dataset.idx);
        if (i >= day.blocks.length - 1) return;
        [day.blocks[i + 1], day.blocks[i]] = [day.blocks[i], day.blocks[i + 1]];
        await rerender();
      });
    });

    // ---- edit form (if a block in this day is currently being edited) ----
    if (editing[date] != null) {
      const i = editing[date];
      const block = day.blocks[i];
      const editRow = dayEl.querySelector(`.block-row-edit[data-idx="${i}"]`);
      if (editRow && block) {
        editRow.querySelector('[data-role="edit-cancel"]').addEventListener('click', () => {
          editing[date] = null;
          refreshDay(date);
        });
        if (block.type === 'custom') {
          editRow.querySelector('[data-role="edit-save"]').addEventListener('click', async () => {
            const label = editRow.querySelector('[data-role="edit-label"]').value.trim();
            const hrs = Number(editRow.querySelector('[data-role="edit-hours"]').value) || 0;
            const mins = Number(editRow.querySelector('[data-role="edit-minutes"]').value) || 0;
            if (!label) return;
            block.label = label;
            block.minutes = hrs * 60 + mins;
            editing[date] = null;
            await rerender();
          });
        } else if (block.type === 'attraction') {
          editRow.querySelector('[data-role="edit-save"]').addEventListener('click', async () => {
            const hrs = Number(editRow.querySelector('[data-role="edit-hours"]').value) || 0;
            const mins = Number(editRow.querySelector('[data-role="edit-minutes"]').value) || 0;
            const note = editRow.querySelector('[data-role="edit-note"]').value.trim();
            block.minutes = hrs * 60 + mins;
            block.note = note;
            editing[date] = null;
            await rerender();
          });
        } else if (block.type === 'travel') {
          const efSel = editRow.querySelector('[data-role="edit-from"]');
          const etSel = editRow.querySelector('[data-role="edit-to"]');
          const epreview = editRow.querySelector('[data-role="edit-travel-preview"]');
          async function updateEditPreview() {
            if (efSel.value === etSel.value) {
              epreview.textContent = 'בחרו שני מקומות שונים';
              return;
            }
            const t = await getTravelTime(efSel.value, etSel.value);
            epreview.textContent = `⏱️ זמן משוער: ${formatHours(t.hours)} (${Math.round(t.km)} ק"מ)${t.estimated ? ' — הערכה' : ''}`;
          }
          efSel.addEventListener('change', updateEditPreview);
          etSel.addEventListener('change', updateEditPreview);
          updateEditPreview();
          editRow.querySelector('[data-role="edit-save"]').addEventListener('click', async () => {
            const fromId = efSel.value, toId = etSel.value;
            if (fromId === toId) return;
            const t = await getTravelTime(fromId, toId);
            block.fromId = fromId;
            block.toId = toId;
            block.hours = t.hours;
            block.estimated = t.estimated;
            editing[date] = null;
            await rerender();
          });
        }
      }
    }

    // ---- drag & drop reordering (in addition to the up/down buttons) ----
    const blockList = dayEl.querySelector('.block-list');
    let dragSrcIdx = null;
    blockList.addEventListener('dragstart', (e) => {
      const row = e.target.closest('.block-row');
      if (!row) return;
      dragSrcIdx = Number(row.dataset.idx);
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    blockList.addEventListener('dragend', (e) => {
      const row = e.target.closest('.block-row');
      if (row) row.classList.remove('dragging');
      dragSrcIdx = null;
    });
    blockList.addEventListener('dragover', (e) => {
      if (dragSrcIdx === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    blockList.addEventListener('drop', async (e) => {
      e.preventDefault();
      const row = e.target.closest('.block-row');
      if (!row || dragSrcIdx === null) return;
      const targetIdx = Number(row.dataset.idx);
      if (targetIdx === dragSrcIdx) return;
      const [moved] = day.blocks.splice(dragSrcIdx, 1);
      day.blocks.splice(targetIdx, 0, moved);
      dragSrcIdx = null;
      await rerender();
    });

    return dayEl;
  }

  async function renderSummaryAndDays() {
    const emptyDays = TRIP_DATES.filter(d => plan.days[d].blocks.length === 0).length;
    const totalMinutes = TRIP_DATES.reduce((sum, d) => sum + plan.days[d].blocks.reduce((s, b) => s + blockMinutes(b), 0), 0);

    document.getElementById('summaryBar').innerHTML = `
      <div class="summary-stat ${emptyDays > 0 ? 'bad' : ''}"><div class="num">${TRIP_DATES.length - emptyDays}/${TRIP_DATES.length}</div><div class="label">ימים עם תוכן</div></div>
      <div class="summary-stat"><div class="num">${formatHours(totalMinutes / 60)}</div><div class="label">סה"כ זמן מתוכנן</div></div>
    `;

    let warningsHtml = '';

    if (emptyDays > 0) {
      warningsHtml += `<div class="callout callout-warning"><span class="callout-icon">📅</span><div>נשארו <b>${emptyDays}</b> ימים ריקים לגמרי. גללו למטה ומלאו אותם.</div></div>`;
    }

    TRIP_DATES.forEach(date => {
      const day = plan.days[date];
      const usedHours = day.blocks.reduce((s, b) => s + blockMinutes(b), 0) / 60;
      if (usedHours > day.budgetHours) {
        warningsHtml += `<div class="callout callout-warning"><span class="callout-icon">⏰</span><div>${dateLabel(date)}: נבחרו ${formatHours(usedHours)} של פעילויות, אבל יש רק ${formatHours(day.budgetHours)} זמינות — היום עמוס מדי.</div></div>`;
      }
    });

    const lastDate = TRIP_DATES[TRIP_DATES.length - 1];
    const hasAirportLeg = plan.days[lastDate].blocks.some(b => b.type === 'travel' && b.toId === 'athens');
    if (!hasAirportLeg) {
      warningsHtml += `<div class="callout callout-info"><span class="callout-icon">✈️</span><div>שימו לב: לא הוספתם נסיעה חזרה לאתונה ביום האחרון (${dateLabel(lastDate)}). הטיסה יוצאת ב-00:05 — צריך להיות בשדה התעופה עד כ-21:00.</div></div>`;
    }

    const flatLegs = [];
    TRIP_DATES.forEach(date => {
      plan.days[date].blocks.forEach(b => { if (b.type === 'travel') flatLegs.push(b); });
    });
    const inIdx = flatLegs.findIndex(l => l.toId === 'pelion');
    if (inIdx !== -1) {
      const inLeg = flatLegs[inIdx];
      const outIdx = flatLegs.findIndex((l, i) => i > inIdx && l.fromId === 'pelion');
      if (outIdx !== -1) {
        const outLeg = flatLegs[outIdx];
        const directLeg = await getTravelTime(inLeg.fromId, outLeg.toId);
        const detour = inLeg.hours + outLeg.hours - directLeg.hours;
        if (detour > 0.5) {
          warningsHtml += `
            <div class="callout callout-danger">
              <span class="callout-icon">⚠️</span>
              <div>
                <b>פליו במסלול — בדקו היטב:</b> הכניסה לפליו והיציאה ממנו (${locName(inLeg.fromId)} → פליו → ${locName(outLeg.toId)}) מוסיפות בערך
                <b>${formatHours(detour)}</b> נהיגה נטו, בהשוואה לנסיעה ישירה בלי הסטייה
                (${formatHours(inLeg.hours)} פנימה + ${formatHours(outLeg.hours)} החוצה, מול ${formatHours(directLeg.hours)} ישירות מ-${locName(inLeg.fromId)} ל-${locName(outLeg.toId)}).
                שקלו לוותר עליו, או לקצר לילה אחד במקום אחר כדי לפצות.
              </div>
            </div>`;
        } else {
          warningsHtml += `
            <div class="callout callout-info">
              <span class="callout-icon">✅</span>
              <div>
                פליו במסלול (${locName(inLeg.fromId)} → פליו → ${locName(outLeg.toId)}) — במסלול הספציפי הזה זה כמעט לא מוסיף נסיעה נוספת
                (${formatHours(inLeg.hours)} פנימה + ${formatHours(outLeg.hours)} החוצה, לעומת ${formatHours(directLeg.hours)} ישירות).
                שימו לב: זה תקף רק אם לא נכנסים גם לפרגה באותו מסלול — שילוב של שניהם כן מוסיף עומס נהיגה משמעותי.
              </div>
            </div>`;
        }
      } else {
        warningsHtml += `<div class="callout callout-warning"><span class="callout-icon">⚠️</span><div>יש נסיעה לפליו (${formatHours(inLeg.hours)}) אבל עדיין אין נסיעה חזרה משם בהמשך הלו"ז — ודאו שהוספתם אותה.</div></div>`;
      }
    }

    document.getElementById('warningsBox').innerHTML = warningsHtml;

    const daysContainer = document.getElementById('daysContainer');
    daysContainer.innerHTML = '';
    TRIP_DATES.forEach((date, i) => daysContainer.appendChild(buildDayCard(date, i)));
  }

  document.getElementById('resetBtn').addEventListener('click', async () => {
    resetPlan(activePlanId);
    plan = loadPlan(activePlanId);
    await rerender();
  });

  await fullRerender();
}
