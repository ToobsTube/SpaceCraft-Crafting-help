// ---- State ----
const state = {
  items: [],
  category: 'All',
  query: '',
};

// ---- Init ----
async function init() {
  const res = await fetch('data/recipes.json');
  state.items = await res.json();

  render();

  document.getElementById('search').addEventListener('input', (e) => {
    state.query = e.target.value.trim().toLowerCase();
    render();
  });

  document.getElementById('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    state.category = btn.dataset.cat;
    render();
  });
}

// ---- Filtering ----
function matches(item) {
  const inCategory = state.category === 'All' || item.category === state.category;
  if (!inCategory) return false;
  if (!state.query) return true;

  const haystack = [item.name, item.used_for, ...(item.ingredients || []).map((i) => i.item)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(state.query);
}

// ---- Rendering ----
function render() {
  const list = document.getElementById('list');
  const visible = state.items.filter(matches);

  document.getElementById('count').textContent = `${state.items.length} items indexed`;

  if (visible.length === 0) {
    list.innerHTML = `<p class="empty">No blueprints match "${escapeHtml(state.query)}".</p>`;
    return;
  }

  list.innerHTML = visible.map(renderItem).join('');

  // accordion toggles — on wide screens, also push the item into the detail panel
  list.querySelectorAll('.item-head').forEach((head) => {
    head.addEventListener('click', () => {
      const itemEl = head.closest('.item');
      toggleItem(itemEl, !itemEl.classList.contains('open'));
      if (isDesktopLayout()) {
        renderDetailPanel(itemEl.id.replace('item-', ''));
      }
    });
  });

  wireItemControls(list);
}

function isDesktopLayout() {
  return window.matchMedia('(min-width: 860px)').matches;
}

// Navigating to an ingredient: on wide screens, update the persistent detail panel
// (the list never moves). On narrow screens, fall back to scrolling/expanding in place.
function goToItem(targetId) {
  if (isDesktopLayout()) {
    renderDetailPanel(targetId);
  } else {
    jumpTo(targetId);
  }
}

// Wires up every interactive control (jump links, raw-materials toggle, qty input,
// manual/auto toggle) within a given root — used for both the main list and the
// detail panel so they behave identically wherever an item is rendered.
function wireItemControls(root) {
  root.querySelectorAll('.ing-name.linkable').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      goToItem(link.dataset.target);
    });
  });

  root.querySelectorAll('.raw-controls').forEach((wrap) => {
    const id = wrap.dataset.item;
    const dom = wrap.dataset.dom;
    const toggleBtn = wrap.querySelector('.raw-toggle');
    const qtyInput = wrap.querySelector('.qty-input');
    const speedBtn = wrap.querySelector('.speed-toggle');
    const container = wrap.querySelector('.raw-breakdown');

    const refresh = () => {
      renderRawBreakdown(id, container, getQty(qtyInput), getMode(speedBtn));
      refreshAccordionHeight(wrap);
    };

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasHidden = container.hidden;
      if (wasHidden) refresh();
      container.hidden = !wasHidden;
      toggleBtn.innerHTML = wasHidden ? 'Hide full raw materials &#9652;' : 'Show full raw materials &#9662;';
      refreshAccordionHeight(wrap);
    });

    qtyInput.addEventListener('click', (e) => e.stopPropagation());
    qtyInput.addEventListener('input', () => {
      if (!container.hidden) refresh();
    });

    speedBtn && speedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nextMode = speedBtn.dataset.mode === 'manual' ? 'auto' : 'manual';
      speedBtn.dataset.mode = nextMode;
      speedBtn.textContent = nextMode === 'auto' ? 'Auto' : 'Manual';
      speedBtn.classList.toggle('active', nextMode === 'auto');
      if (!container.hidden) refresh();
    });
  });
}

function refreshAccordionHeight(el) {
  const itemEl = el.closest('.item');
  if (itemEl && itemEl.classList.contains('open')) {
    const body = itemEl.querySelector('.item-body');
    body.style.maxHeight = body.scrollHeight + 'px';
  }
}

function getQty(input) {
  const val = parseFloat(input && input.value);
  return val > 0 ? val : 1;
}

function getMode(btn) {
  return (btn && btn.dataset.mode) || 'manual';
}

// ---- Detail panel (persistent second column on wide screens) ----
function renderDetailPanel(itemId) {
  const panel = document.getElementById('detail');
  const item = state.items.find((i) => i.id === itemId);
  if (!panel || !item) return;

  const idLookup = new Set(state.items.map((i) => i.id));
  const domId = 'detail-' + item.id;
  const bodyHtml = buildItemBody(item, idLookup, domId);
  const verifiedDot = item.verified === false ? ' class="dot unverified"' : ' class="dot verified"';

  panel.innerHTML = `
    <div class="detail-head">
      <span${verifiedDot} title="${item.verified === false ? 'Unverified' : 'Verified in-game'}"></span>
      <span class="item-name">${escapeHtml(item.name)}</span>
      <span class="badge type-${item.type}">${item.type}</span>
      <button class="detail-close" aria-label="Close">&times;</button>
    </div>
    <div class="detail-body body-inner">${bodyHtml}</div>
  `;

  panel.querySelector('.detail-close').addEventListener('click', () => {
    panel.innerHTML = '<div class="detail-empty">Tap any item to see its full recipe and complete raw-materials breakdown here.</div>';
  });

  wireItemControls(panel);

  // auto-expand the raw breakdown immediately — the whole point of this panel
  const wrap = panel.querySelector('.raw-controls');
  if (wrap) {
    const container = wrap.querySelector('.raw-breakdown');
    const toggleBtn = wrap.querySelector('.raw-toggle');
    renderRawBreakdown(item.id, container, 1, 'manual');
    container.hidden = false;
    toggleBtn.innerHTML = 'Hide full raw materials &#9652;';
  }
}

function renderItem(item) {
  const idLookup = new Set(state.items.map((i) => i.id));
  const bodyHtml = buildItemBody(item, idLookup, item.id);
  const verifiedDot = item.verified === false ? ' class="dot unverified"' : ' class="dot verified"';
  const isBuy = item.type === 'buy';
  const isExtract = item.type === 'extract';
  const isBuild = item.type === 'build';
  const isGather = item.type === 'gather';

  return `
    <div class="item${isBuy ? ' buy' : ''}${isExtract ? ' extract' : ''}${isBuild ? ' build' : ''}${isGather ? ' gather' : ''}" id="item-${item.id}">
      <div class="item-head">
        <span${verifiedDot} title="${item.verified === false ? 'Unverified' : 'Verified in-game'}"></span>
        <span class="item-name">${escapeHtml(item.name)}</span>
        <span class="badge type-${item.type}">${item.type}</span>
        ${item.tier ? `<span class="badge tier">T${item.tier}</span>` : ''}
        <span class="chevron">&#9656;</span>
      </div>
      <div class="item-body"><div class="body-inner">${bodyHtml}</div></div>
    </div>
  `;
}

function buildItemBody(item, idLookup, domId) {
  const isBuy = item.type === 'buy';
  const isExtract = item.type === 'extract';
  const isBuild = item.type === 'build';
  const isGather = item.type === 'gather';
  const hasRecipes = item.recipes && item.recipes.length;
  const legacyTime = item.time_sec; // old wiki-only field, only used when there's no recipes array

  let bodyHtml = '';

  if (item.verified === false) {
    bodyHtml += `<p class="source-note">⚠ Unverified — pulled from wiki, not confirmed in-game yet.</p>`;
  }

  if (item.subcategory) {
    bodyHtml += `<p class="module-breadcrumb">${escapeHtml(item.category)} &rsaquo; ${escapeHtml(item.subcategory)}</p>`;
  }

  if (item.value != null || item.storage_units != null) {
    const bits = [];
    if (item.value != null) bits.push(`<strong>${item.value}</strong> value`);
    if (item.storage_units != null) bits.push(`${item.storage_units} su`);
    bodyHtml += `<p class="material-stats">${bits.join(' &nbsp;·&nbsp; ')}</p>`;
  }

  if (isBuy) {
    bodyHtml += `<div class="price-line">${item.price.toFixed(2)} cr</div>`;
    bodyHtml += `<p class="station-line">Buy at <strong>${escapeHtml(item.station)}</strong></p>`;
  } else if (isExtract) {
    const ex = item.extraction_info || {};
    bodyHtml += `<p class="station-line">Extracted via <strong>${escapeHtml(item.station)}</strong></p>`;
    const exSpecs = [];
    if (ex.cycle_time_sec != null) exSpecs.push(`${formatDuration(ex.cycle_time_sec)} per cycle`);
    if (ex.storage_capacity_su != null) exSpecs.push(`${ex.storage_capacity_su} su capacity`);
    if (ex.output_buffer_max != null) exSpecs.push(`${ex.output_buffer_max} max output buffer`);
    if (ex.energy_consumption_ma != null) exSpecs.push(`${ex.energy_consumption_ma} MA when running`);
    if (exSpecs.length) {
      bodyHtml += `<p class="specs-line">${exSpecs.map(escapeHtml).join(' &nbsp;·&nbsp; ')}</p>`;
    }
  } else if (isBuild) {
    const bi = item.build_info || {};
    if (bi.description) {
      bodyHtml += `<p class="module-desc">${escapeHtml(bi.description)}</p>`;
    }
    const buildSpecs = [];
    if (bi.fp_cost != null) buildSpecs.push(`${bi.fp_cost} FP`);
    if (bi.xp_bonus != null) buildSpecs.push(`+${bi.xp_bonus} XP first build`);
    if (buildSpecs.length) {
      bodyHtml += `<p class="specs-line">${buildSpecs.map(escapeHtml).join(' &nbsp;·&nbsp; ')}</p>`;
    }
    bodyHtml += `<p class="station-line">Place with <strong>${escapeHtml(item.station)}</strong></p>`;
    const buildRows = (item.ingredients || [])
      .map((ing) => {
        const slug = slugify(ing.item);
        const linkable = idLookup.has(slug);
        const linkAttrs = linkable ? ` data-target="${slug}"` : '';
        const linkClass = linkable ? ' linkable' : '';
        return `<li><span class="ing-name${linkClass}"${linkAttrs}>${escapeHtml(ing.item)}</span><span class="ing-qty">×${ing.qty}</span></li>`;
      })
      .join('');
    bodyHtml += `<ul class="ingredients">${buildRows}</ul>`;
  } else if (isGather) {
    // Gathered/found-in-the-world materials. Most have no synthesis recipe at all
    // (pure raw resource — nothing to "craft"). A handful (Pyrite, Aquamarine, Quartz,
    // Graphite Crystal, Sulfur) can ALSO be synthesized at a Crystallizer or Smelter —
    // show that recipe if present, but skip the "Craft at" line entirely otherwise.
    if (hasRecipes) {
      bodyHtml += `<p class="station-line">Synthesized at <strong>${escapeHtml(item.station)}</strong></p>`;
      bodyHtml += item.recipes.map((r) => renderRecipeBlock(r, idLookup)).join('');
    }
  } else {
    const timeNote = !hasRecipes && legacyTime ? ` · ${legacyTime}s` : '';
    bodyHtml += `<p class="station-line">Craft at <strong>${escapeHtml(item.station)}</strong>${timeNote}</p>`;

    if (hasRecipes) {
      bodyHtml += item.recipes.map((r) => renderRecipeBlock(r, idLookup)).join('');
    } else {
      const rows = (item.ingredients || [])
        .map((ing) => {
          const slug = slugify(ing.item);
          const linkable = idLookup.has(slug);
          const linkAttrs = linkable ? ` data-target="${slug}"` : '';
          const linkClass = linkable ? ' linkable' : '';
          return `<li><span class="ing-name${linkClass}"${linkAttrs}>${escapeHtml(ing.item)}</span><span class="ing-qty">×${ing.qty}</span></li>`;
        })
        .join('');

      bodyHtml += `<ul class="ingredients">${rows}</ul>`;
    }
  }

  const hasAnyIngredients = hasRecipes || (item.ingredients && item.ingredients.length);
  if (hasAnyIngredients && !isBuy && !isExtract) {
    bodyHtml += `
      <div class="raw-controls" data-item="${item.id}" data-dom="${domId}">
        <div class="raw-row">
          <button class="raw-toggle">Show full raw materials &#9662;</button>
          <input type="number" class="qty-input" id="qty-${domId}" min="1" step="1" value="1" aria-label="Quantity">
          ${hasRecipes ? `<button class="speed-toggle" id="speed-${domId}" data-mode="manual">Manual</button>` : ''}
        </div>
        <div class="raw-breakdown" id="raw-${domId}" hidden></div>
      </div>
    `;
  }

  if (item.used_for) {
    bodyHtml += `<p class="used-for">Used for: ${escapeHtml(item.used_for)}</p>`;
  }

  if (item.note) {
    bodyHtml += `<p class="note-line">📝 ${escapeHtml(item.note)}</p>`;
  }

  if (item.specs && item.specs.length) {
    bodyHtml += renderSpecsInfo(item.specs);
  }

  if (item.analysis_tiers && item.analysis_tiers.length) {
    bodyHtml += renderAnalysisTiers(item.analysis_tiers);
  }

  if (item.deposits && item.deposits.length) {
    bodyHtml += renderDeposits(item.deposits);
  }

  if (item.module_info) {
    bodyHtml += renderModuleInfo(item.module_info, item.category);
  }

  return bodyHtml;
}

// ---- Gathering-specific sections: SPECS, Analysis (Laboratory), Contained in Resources ----
function renderSpecsInfo(specs) {
  const rows = specs.map((s) => `<li>${escapeHtml(s)}</li>`).join('');
  return `<p class="section-label">Specs</p><ul class="specs-list">${rows}</ul>`;
}

function renderAnalysisTiers(tiers) {
  const rows = tiers
    .map((t) => {
      const tierClass = t.unlocked ? 'tier-unlocked' : 'tier-locked';
      const lockNote = !t.unlocked && t.unlock_requirement
        ? `<span class="lock-note">${escapeHtml(t.unlock_requirement)}</span>`
        : '';
      return `<li class="${tierClass}"><span class="tier-name">${escapeHtml(t.tier)}</span>${lockNote}</li>`;
    })
    .join('');
  return `<p class="section-label">Analysis (Laboratory)</p><ul class="analysis-list">${rows}</ul>`;
}

function renderDeposits(deposits) {
  const rows = deposits
    .map((d) => `<li><span class="ing-name">${escapeHtml(d.resource)}</span><span class="ing-qty">${escapeHtml(String(d.yield))}</span></li>`)
    .join('');
  return `<p class="section-label">Contained in resources</p><ul class="ingredients deposits-list">${rows}</ul>`;
}

function formatLocation(loc) {
  return loc.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderModuleInfo(info, category) {
  const statRows = info.stats
    ? Object.entries(info.stats)
        .map(([k, v]) => `<li><span class="stat-key">${escapeHtml(k)}</span><span class="stat-val">${escapeHtml(v)}</span></li>`)
        .join('')
    : '';

  return `
    <div class="module-info">
      ${info.subcategory ? `<p class="module-breadcrumb">${escapeHtml(category)} &rsaquo; ${escapeHtml(info.subcategory)}</p>` : ''}
      ${info.description ? `<p class="module-desc">${escapeHtml(info.description)}</p>` : ''}
      ${statRows ? `<ul class="module-stats">${statRows}</ul>` : ''}
      <div class="module-footer">
        ${info.tag ? `<span class="badge tag-badge">${escapeHtml(info.tag)}</span>` : ''}
        ${info.sell_price != null ? `<span class="sell-price">${info.sell_price} cr sell</span>` : ''}
      </div>
    </div>
  `;
}

function renderRecipeBlock(recipe, idLookup) {
  const rows = (recipe.ingredients || [])
    .map((ing) => {
      const slug = slugify(ing.item);
      const linkable = idLookup.has(slug);
      const linkAttrs = linkable ? ` data-target="${slug}"` : '';
      const linkClass = linkable ? ' linkable' : '';
      return `<li><span class="ing-name${linkClass}"${linkAttrs}>${escapeHtml(ing.item)}</span><span class="ing-qty">×${ing.qty}</span></li>`;
    })
    .join('');

  const yieldTag = recipe.output_qty && recipe.output_qty !== 1
    ? ` <span class="yield-tag">yields ×${recipe.output_qty}</span>`
    : '';

  let bonusHtml = '';
  if (recipe.additional_outputs && recipe.additional_outputs.length) {
    const bonusRows = recipe.additional_outputs
      .map((o) => {
        const slug = slugify(o.item);
        const linkable = idLookup.has(slug);
        const linkAttrs = linkable ? ` data-target="${slug}"` : '';
        const linkClass = linkable ? ' linkable' : '';
        return `<li><span class="ing-name${linkClass}"${linkAttrs}>${escapeHtml(o.item)}</span><span class="ing-qty">×${o.qty || 1}</span></li>`;
      })
      .join('');
    bonusHtml = `<p class="bonus-label">Also produces:</p><ul class="ingredients bonus-list">${bonusRows}</ul>`;
  }

  const specs = [];
  if (recipe.craft_time_sec != null) {
    const autoNote = recipe.auto_craft_time_sec != null ? ` / ${formatDuration(recipe.auto_craft_time_sec)} auto` : '';
    specs.push(`${recipe.craft_time_sec}s manual${autoNote}`);
  }
  if (recipe.storage_units != null) specs.push(`${recipe.storage_units} su`);
  if (recipe.added_value != null) specs.push(`+${recipe.added_value} value`);
  if (recipe.tax) {
    const bits = Object.entries(recipe.tax).map(([loc, val]) => `${val} (${formatLocation(loc)})`);
    specs.push(`tax — ${bits.join(', ')}`);
  }
  const specsLine = specs.length ? `<p class="specs-line">${specs.map(escapeHtml).join(' &nbsp;·&nbsp; ')}</p>` : '';

  return `
    <div class="recipe-block">
      ${recipe.label ? `<p class="recipe-label">${escapeHtml(recipe.label)}${yieldTag}</p>` : ''}
      <ul class="ingredients">${rows}</ul>
      ${bonusHtml}
      ${specsLine}
    </div>
  `;
}

// ---- Raw materials breakdown (recursive) ----
// Walks every sub-recipe down to ingredients with no recipe of their own (true raw
// materials, or unconfirmed gaps). Tracks TWO buckets:
//   - intermediates: anything that itself has a recipe (e.g. Copper Ingot) — these get
//     fully expanded further, but we still record how much of them is needed along the way.
//   - totals: the true raw leaves at the bottom of the chain (e.g. Copper Ore).
// Where an item has multiple recipe paths, the first listed one is used.
// Items with a flat `ingredients` list (no recipes array, e.g. placeable buildings) are
// supported too — treated as a single batch of 1.
function computeRawMaterials(itemId, neededQty, totals, intermediates, visiting) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item || visiting.has(itemId)) return;

  const recipe = item.recipes && item.recipes.length ? item.recipes[0] : null;
  const flatIngredients = !recipe && item.ingredients && item.ingredients.length ? item.ingredients : null;
  if (!recipe && !flatIngredients) return; // raw leaf — nothing further to expand

  visiting.add(itemId);
  const ingredients = recipe ? recipe.ingredients : flatIngredients;
  const batchSize = recipe ? recipe.output_qty || 1 : 1;
  const batches = neededQty / batchSize;

  (ingredients || []).forEach((ing) => {
    const slug = slugify(ing.item);
    const subItem = state.items.find((i) => i.id === slug);
    const requiredQty = ing.qty * batches;
    // If the sub-item is already being expanded further up this call stack, we've
    // hit a real cycle (e.g. Pyrite -> Sulfur -> Pyrite via the Crystallizer recipes).
    // Treat it as a raw leaf here instead of recursing again — recursing would just
    // return immediately and silently drop this quantity from the total.
    const cyclic = subItem && visiting.has(slug);
    const subExpandable = subItem && !cyclic && ((subItem.recipes && subItem.recipes.length) || (subItem.ingredients && subItem.ingredients.length));

    if (subExpandable) {
      intermediates.set(ing.item, (intermediates.get(ing.item) || 0) + requiredQty);
      computeRawMaterials(slug, requiredQty, totals, intermediates, visiting);
    } else {
      totals.set(ing.item, (totals.get(ing.item) || 0) + requiredQty);
    }
  });

  visiting.delete(itemId);
}

function renderRawBreakdown(itemId, container, qty, mode) {
  qty = qty || 1;
  mode = mode || 'manual';
  const totals = new Map();
  const intermediates = new Map();
  computeRawMaterials(itemId, qty, totals, intermediates, new Set());
  const idLookup = new Set(state.items.map((i) => i.id));

  const topItem = state.items.find((i) => i.id === itemId);
  const topRecipe = topItem.recipes && topItem.recipes.length ? topItem.recipes[0] : null;

  let timeLine = '';
  if (topRecipe && topRecipe.craft_time_sec != null) {
    const batchSize = topRecipe.output_qty || 1;
    const batchesNeeded = Math.ceil(qty / batchSize);
    const usingAuto = mode === 'auto' && topRecipe.auto_craft_time_sec != null;
    const fellBack = mode === 'auto' && topRecipe.auto_craft_time_sec == null;
    const perCraft = usingAuto ? topRecipe.auto_craft_time_sec : topRecipe.craft_time_sec;
    const modeLabel = usingAuto ? 'auto machine' : 'manual craft';
    const fallbackNote = fellBack ? ' — auto time not confirmed yet for this one, showing manual instead' : '';
    timeLine = `<p class="time-line">&#9201; ~${formatDuration(batchesNeeded * perCraft)} to craft ×${qty} (${batchesNeeded} batch${batchesNeeded === 1 ? '' : 'es'} of ${perCraft}s each, ${modeLabel}, one machine running back-to-back)${fallbackNote}</p>`;
  }

  const renderRows = (map) =>
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, total]) => {
        const slug = slugify(name);
        const linkable = idLookup.has(slug);
        const linkAttrs = linkable ? ` data-target="${slug}"` : '';
        const linkClass = linkable ? ' linkable' : '';
        const displayQty = Math.ceil(total - 1e-9); // tiny epsilon guards against float noise like 6.0000000001
        return `<li><span class="ing-name${linkClass}"${linkAttrs}>${escapeHtml(name)}</span><span class="ing-qty">×${displayQty}</span></li>`;
      })
      .join('');

  const intermediateSection = intermediates.size
    ? `<p class="section-label">Sub-crafts needed along the way</p><ul class="ingredients raw-list">${renderRows(intermediates)}</ul>`
    : '';

  container.innerHTML = `
    ${timeLine}
    <p class="raw-note">Everything needed for ×${qty}, tracing each sub-recipe down to its base materials (using the first recipe option at each step where there's more than one):</p>
    ${intermediateSection}
    <p class="section-label">Base/raw materials</p>
    <ul class="ingredients raw-list">${renderRows(totals)}</ul>
  `;

  container.querySelectorAll('.ing-name.linkable').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      goToItem(link.dataset.target);
    });
  });
}

function formatDuration(totalSeconds) {
  if (totalSeconds < 60) return `${Math.round(totalSeconds)}s`;
  const totalMinutes = totalSeconds / 60;
  if (totalMinutes < 60) return `${Math.round(totalMinutes * 10) / 10}m`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

// ---- Accordion + jump-to-recipe helpers ----
function toggleItem(itemEl, open) {
  itemEl.classList.toggle('open', open);
  const body = itemEl.querySelector('.item-body');
  body.style.maxHeight = open ? body.scrollHeight + 'px' : '0px';
}

function jumpTo(id) {
  const alreadyVisible = document.getElementById('item-' + id);

  // if the target is filtered out right now, reset filters so it shows up
  if (!alreadyVisible) {
    state.query = '';
    state.category = 'All';
    document.getElementById('search').value = '';
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelector('.tab[data-cat="All"]').classList.add('active');
    render();
  }

  requestAnimationFrame(() => {
    const el = document.getElementById('item-' + id);
    if (!el) return;
    toggleItem(el, true);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

// ---- Utilities ----
function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// ---- Theme picker ----
function initTheme() {
  const saved = localStorage.getItem('spacecraft-theme') || 'default';
  applyTheme(saved);

  document.querySelectorAll('.theme-dot').forEach((dot) => {
    dot.classList.toggle('active', dot.dataset.theme === saved);
    dot.addEventListener('click', () => {
      const theme = dot.dataset.theme;
      applyTheme(theme);
      localStorage.setItem('spacecraft-theme', theme);
      document.querySelectorAll('.theme-dot').forEach((d) => d.classList.toggle('active', d === dot));
    });
  });
}

function applyTheme(theme) {
  if (theme === 'default') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

init();
initTheme();
