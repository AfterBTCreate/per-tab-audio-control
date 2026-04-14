// Per-Tab Audio Control - Popup Header Edit Mode
// Long-press ABTC logo to enter edit mode: wiggle, drag-to-reorder, show/hide, spacer count
// All changes save to chrome.storage.sync and live-sync with the options page

'use strict';

// ==================== State ====================
let headerEditMode = false;
let longPressTimer = null;
let editPanel = null;
let currentEditLayout = null;
let dragState = null;
const dragHandlers = new Map();

// ==================== Initialization ====================

function initHeaderEditMode() {
  const header = document.querySelector('.header');
  const brandLogo = header ? header.querySelector('[data-header-item="companyLogo"]') : null;
  if (!header || !brandLogo) return;

  // Long-press detection (600ms)
  brandLogo.addEventListener('pointerdown', (e) => {
    if (headerEditMode) return;
    e.preventDefault();
    brandLogo.classList.add('press-active');
    longPressTimer = setTimeout(() => {
      brandLogo.classList.remove('press-active');
      enterEditMode();
    }, 600);
  });

  const cancelPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    brandLogo.classList.remove('press-active');
  };

  brandLogo.addEventListener('pointerup', cancelPress);
  brandLogo.addEventListener('pointerleave', cancelPress);
  brandLogo.addEventListener('pointercancel', cancelPress);

  // Prevent link navigation during edit mode
  brandLogo.addEventListener('click', (e) => {
    if (headerEditMode) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
}

// ==================== Enter/Exit Edit Mode ====================

async function enterEditMode() {
  const header = document.querySelector('.header');
  if (!header || headerEditMode) return;

  // Load current layout from storage
  try {
    const result = await browserAPI.storage.sync.get(['headerLayout']);
    currentEditLayout = result.headerLayout
      ? JSON.parse(JSON.stringify(result.headerLayout))
      : JSON.parse(JSON.stringify(DEFAULTS.headerLayout));
  } catch (e) {
    currentEditLayout = JSON.parse(JSON.stringify(DEFAULTS.headerLayout));
  }

  headerEditMode = true;
  header.classList.add('edit-mode');

  // If in basic mode, expand to advanced so enhancements section is visible
  const wasBasicMode = document.body.classList.contains('basic-mode');
  if (wasBasicMode) {
    const enhSection = document.querySelector('.enhancements-section');
    if (enhSection) enhSection.classList.remove('mode-collapsed');
  }

  // Disable header button actions during edit (capture phase intercept)
  header.addEventListener('click', editModeClickBlocker, true);

  // Swap from header-item-hidden (applyHeaderLayout) to edit-hidden (edit mode)
  // so we have a single class to manage during editing
  const hiddenSet = new Set(currentEditLayout.hidden || []);
  header.querySelectorAll('[data-header-item]').forEach(el => {
    const id = el.dataset.headerItem;
    el.classList.remove('header-item-hidden');
    if (hiddenSet.has(id)) {
      el.classList.add('edit-hidden');
    }
  });

  // Hide non-editable controls during edit mode
  document.querySelectorAll('.volume-row, .slider-container, .presets, .tab-info-wrapper, .tab-title-external, .seekbar-row').forEach(el => {
    el.style.display = 'none';
  });
  const shortcutsFooter = document.getElementById('shortcutsFooter');
  if (shortcutsFooter) shortcutsFooter.style.display = 'none';

  createEditPanel();
  setupDragListeners();

  // Enter sections edit mode (if available)
  if (typeof enterSectionsEditMode === 'function') enterSectionsEditMode();

  // Exit on Escape
  document.addEventListener('keydown', onEditEscape);
  // Exit on click outside (delayed to avoid immediate trigger)
  setTimeout(() => document.addEventListener('pointerdown', onEditClickOutside), 50);
}

// Block header button clicks during edit mode (used as capture-phase listener)
function editModeClickBlocker(e) {
  const target = e.target.closest('.header-btn, .audio-mode-toggle, .brand-logo-link');
  if (target) {
    e.stopPropagation();
    e.preventDefault();
  }
}

function exitEditMode() {
  const header = document.querySelector('.header');
  if (!header || !headerEditMode) return;

  // Cancel any in-progress drag before tearing down
  if (dragState) {
    if (dragState.moved && dragState.clone.parentNode) dragState.clone.remove();
    dragState.el.classList.remove('edit-dragging');
    dragState.el.removeEventListener('pointermove', onDragMove);
    dragState.el.removeEventListener('pointerup', onDragEnd);
    dragState.el.removeEventListener('pointercancel', onDragEnd);
    dragState = null;
  }

  headerEditMode = false;
  header.classList.remove('edit-mode');

  // Remove click blocker
  header.removeEventListener('click', editModeClickBlocker, true);

  // If was in basic mode, re-collapse enhancements
  if (document.body.classList.contains('basic-mode')) {
    const enhSection = document.querySelector('.enhancements-section');
    if (enhSection) enhSection.classList.add('mode-collapsed');
  }

  // Clean up classes
  header.querySelectorAll('.edit-hidden').forEach(el => el.classList.remove('edit-hidden'));
  header.querySelectorAll('.header-drop-indicator').forEach(el => el.remove());

  // Exit sections edit mode (if available)
  if (typeof exitSectionsEditMode === 'function') exitSectionsEditMode();

  // Remove panel
  if (editPanel) {
    editPanel.remove();
    editPanel = null;
  }

  // Remove listeners
  document.removeEventListener('keydown', onEditEscape);
  document.removeEventListener('pointerdown', onEditClickOutside);
  teardownDragListeners();

  // Remove Done bar
  const doneBarEl = document.querySelector('.header-edit-done-bar');
  if (doneBarEl) doneBarEl.remove();

  // Restore non-editable controls
  document.querySelectorAll('.volume-row, .slider-container, .presets, .tab-info-wrapper, .tab-title-external, .seekbar-row').forEach(el => {
    el.style.display = '';
  });
  const shortcutsEl = document.getElementById('shortcutsFooter');
  if (shortcutsEl) shortcutsEl.style.display = '';

  // Re-apply the saved layout to restore proper display
  applyHeaderLayout();
  // Re-apply appearance settings
  applyShowVisualizer();
  applyShowSeekbar();
  applyShortcutsFooterVisibility();
  applyTabInfoLocation();
}

function onEditEscape(e) {
  if (e.key === 'Escape') exitEditMode();
}

function onEditClickOutside(e) {
  const header = document.querySelector('.header');
  const enhancementsPanel = document.querySelector('.enhancements-section');
  const target = e.target;
  const doneBarCheck = document.querySelector('.header-edit-done-bar');
  if (header && !header.contains(target)
      && editPanel && !editPanel.contains(target)
      && (!enhancementsPanel || !enhancementsPanel.contains(target))
      && (!doneBarCheck || !doneBarCheck.contains(target))) {
    exitEditMode();
  }
}

// ==================== Edit Panel ====================

function createEditPanel() {
  const header = document.querySelector('.header');
  if (!header) return;

  // Remove existing panel
  if (editPanel) editPanel.remove();

  const panel = document.createElement('div');
  panel.className = 'header-edit-panel';

  // — Hide Icons section —
  const showHide = document.createElement('div');
  showHide.className = 'header-edit-panel-section';

  const shLabel = document.createElement('div');
  shLabel.className = 'header-edit-panel-label';
  shLabel.textContent = 'Hide';
  showHide.appendChild(shLabel);

  const checks = document.createElement('div');
  checks.className = 'header-edit-checks';

  const labels = { audioMode: 'Enable/Disable', focus: 'Focus', theme: 'Theme', logo: 'Volume' };
  const hiddenSet = new Set(currentEditLayout.hidden || []);

  for (const id of HIDEABLE_HEADER_ITEMS) {
    const lbl = document.createElement('label');
    lbl.className = 'header-edit-check';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = hiddenSet.has(id);
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleItemVisibility(id, !cb.checked);
    });

    const txt = document.createTextNode(labels[id] || id);
    lbl.appendChild(cb);
    lbl.appendChild(txt);
    checks.appendChild(lbl);
  }
  showHide.appendChild(checks);

  // — Spacers section —
  const spacerSec = document.createElement('div');
  spacerSec.className = 'header-edit-panel-section';

  const spLabel = document.createElement('div');
  spLabel.className = 'header-edit-panel-label';
  spLabel.textContent = 'Spacers';
  spacerSec.appendChild(spLabel);

  const spBtns = document.createElement('div');
  spBtns.className = 'header-edit-spacer-btns';

  const currentCount = currentEditLayout.spacerCount || 4;
  for (let i = 1; i <= MAX_SPACERS; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = String(i);
    btn.setAttribute('aria-label', `Set header spacer count to ${i}`);
    if (i < MIN_SPACERS) {
      btn.className = 'header-edit-spacer-btn disabled';
      btn.setAttribute('aria-disabled', 'true');
      btn.tabIndex = -1;
    } else {
      btn.className = 'header-edit-spacer-btn' + (i === currentCount ? ' active' : '');
      btn.setAttribute('aria-pressed', i === currentCount ? 'true' : 'false');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setSpacerCount(i);
        spBtns.querySelectorAll('.header-edit-spacer-btn').forEach(b => {
          const match = b.textContent === String(i);
          b.classList.toggle('active', match);
          if (b.hasAttribute('aria-pressed')) {
            b.setAttribute('aria-pressed', match ? 'true' : 'false');
          }
        });
      });
    }
    spBtns.appendChild(btn);
  }
  spacerSec.appendChild(spBtns);


  // — Tab Title Location —
  const titleLocRow = document.createElement('div');
  titleLocRow.className = 'header-edit-title-location';

  const titleLabel = document.createElement('span');
  titleLabel.className = 'header-edit-title-label';
  titleLabel.textContent = 'Tab Title';
  titleLocRow.appendChild(titleLabel);

  const titleBtns = document.createElement('div');
  titleBtns.className = 'header-edit-title-btns';

  browserAPI.storage.sync.get(['tabInfoLocation', 'showVisualizer']).then(result => {
    const currentLoc = result.tabInfoLocation || DEFAULTS.tabInfoLocation;
    const vizHidden = !(result.showVisualizer ?? DEFAULTS.showVisualizer);
    const options = [
      { value: 'inside', label: 'Inside' },
      { value: 'below', label: 'Below' },
      { value: 'above', label: 'Above' },
      { value: 'off', label: 'Hidden' }
    ];
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.titleValue = opt.value;
      const isDisabled = vizHidden && (opt.value === 'inside' || opt.value === 'below');
      btn.className = 'header-edit-title-btn'
        + (currentLoc === opt.value ? ' active' : '')
        + (isDisabled ? ' disabled' : '');
      btn.textContent = opt.label;
      btn.setAttribute('aria-label', `Tab title location: ${opt.label}`);
      btn.setAttribute('aria-pressed', currentLoc === opt.value ? 'true' : 'false');
      if (isDisabled) {
        btn.setAttribute('aria-disabled', 'true');
        btn.tabIndex = -1;
      }
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.classList.contains('disabled')) return;
        browserAPI.storage.sync.set({ tabInfoLocation: opt.value });
        titleBtns.querySelectorAll('.header-edit-title-btn').forEach(b => {
          const isMatch = b === btn;
          b.classList.toggle('active', isMatch);
          b.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
        });
      });
      titleBtns.appendChild(btn);
    }
  });
  titleLocRow.appendChild(titleBtns);

  // — Reorder section (keyboard-accessible alternative to drag) #74 —
  const reorderSec = document.createElement('div');
  reorderSec.className = 'header-edit-panel-section header-edit-reorder-section';

  const reLabel = document.createElement('div');
  reLabel.className = 'header-edit-panel-label';
  reLabel.textContent = 'Reorder';
  reorderSec.appendChild(reLabel);

  const reList = document.createElement('div');
  reList.className = 'header-edit-reorder-list';
  reorderSec.appendChild(reList);
  buildHeaderReorderList(reList);

  // Live region for reorder announcements
  const reLive = document.createElement('div');
  reLive.className = 'header-edit-reorder-live';
  reLive.setAttribute('aria-live', 'polite');
  reLive.setAttribute('aria-atomic', 'true');
  reorderSec.appendChild(reLive);

  panel.appendChild(showHide);
  panel.appendChild(spacerSec);
  panel.appendChild(reorderSec);
  panel.appendChild(titleLocRow);

  // Insert after header
  header.insertAdjacentElement('afterend', panel);
  editPanel = panel;

  // — Done bar at bottom of popup —
  const existingDoneBar = document.querySelector('.header-edit-done-bar');
  if (existingDoneBar) existingDoneBar.remove();

  const doneBar = document.createElement('div');
  doneBar.className = 'header-edit-done-bar';

  const resetAllBtn = document.createElement('button');
  resetAllBtn.type = 'button';
  resetAllBtn.className = 'header-edit-reset';
  resetAllBtn.textContent = 'Reset All to Default';
  resetAllBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetAllToDefault();
  });

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'header-edit-done';
  doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exitEditMode();
  });

  doneBar.appendChild(resetAllBtn);
  doneBar.appendChild(doneBtn);

  // Append to the popup container (parent of header)
  const container = header.closest('.container') || header.parentElement;
  if (container) container.appendChild(doneBar);
}

// ==================== Tab Title vs Visualizer State ====================

// Called when the visualizer Hide checkbox changes in sections editor
function updateEditTitleBtnsState(vizHidden) {
  if (!editPanel) return;
  const btns = editPanel.querySelectorAll('.header-edit-title-btn');
  btns.forEach(btn => {
    const val = btn.dataset.titleValue;
    if (val === 'inside' || val === 'below') {
      btn.classList.toggle('disabled', vizHidden);
      // If a disabled option is currently active, switch to "above"
      if (vizHidden && btn.classList.contains('active')) {
        btn.classList.remove('active');
        const aboveBtn = editPanel.querySelector('.header-edit-title-btn[data-title-value="above"]');
        if (aboveBtn) aboveBtn.classList.add('active');
        browserAPI.storage.sync.set({ tabInfoLocation: 'above' });
      }
    }
  });
}

// ==================== Keyboard Reorder (#74) ====================

// Human-readable names for header items (matches options HEADER_ITEM_DATA).
const HEADER_ITEM_NAMES = {
  companyLogo: 'ABTC Logo',
  brandText: 'Brand Text',
  audioMode: 'Enable/Disable',
  focus: 'Focus',
  modeToggle: 'Basic/Advanced',
  theme: 'Theme',
  settings: 'Settings',
  logo: 'Volume Icon'
};

function getHeaderItemDisplayName(id) {
  if (!id) return 'Item';
  if (HEADER_ITEM_NAMES[id]) return HEADER_ITEM_NAMES[id];
  if (id.startsWith('spacer')) return 'Spacer ' + id.slice(6);
  return id;
}

function getHeaderOrderFromDOM() {
  const header = document.querySelector('.header');
  if (!header) return [];
  return Array.from(header.querySelectorAll('[data-header-item]'))
    .map(el => el.dataset.headerItem)
    .filter(Boolean);
}

function buildHeaderReorderList(container) {
  if (!container) return;
  container.innerHTML = '';

  const order = getHeaderOrderFromDOM();
  const lastIdx = order.length - 1;

  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const row = document.createElement('div');
    row.className = 'header-edit-reorder-item';
    row.dataset.itemId = id;

    const label = document.createElement('span');
    label.className = 'header-edit-reorder-name';
    label.textContent = getHeaderItemDisplayName(id);
    row.appendChild(label);

    const btns = document.createElement('div');
    btns.className = 'header-edit-reorder-btns';

    const leftBtn = document.createElement('button');
    leftBtn.type = 'button';
    leftBtn.className = 'header-edit-reorder-btn';
    leftBtn.setAttribute('aria-label', `Move ${getHeaderItemDisplayName(id)} left`);
    leftBtn.textContent = '\u25C0';
    leftBtn.disabled = i === 0;
    leftBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveHeaderItemByKeyboard(id, -1);
    });

    const rightBtn = document.createElement('button');
    rightBtn.type = 'button';
    rightBtn.className = 'header-edit-reorder-btn';
    rightBtn.setAttribute('aria-label', `Move ${getHeaderItemDisplayName(id)} right`);
    rightBtn.textContent = '\u25B6';
    rightBtn.disabled = i === lastIdx;
    rightBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveHeaderItemByKeyboard(id, 1);
    });

    btns.appendChild(leftBtn);
    btns.appendChild(rightBtn);
    row.appendChild(btns);

    container.appendChild(row);
  }
}

function moveHeaderItemByKeyboard(itemId, delta) {
  const header = document.querySelector('.header');
  if (!header) return;
  const el = header.querySelector('[data-header-item="' + CSS.escape(itemId) + '"]');
  if (!el) return;

  const siblings = Array.from(header.querySelectorAll('[data-header-item]'));
  const currentIdx = siblings.indexOf(el);
  const newIdx = currentIdx + delta;
  if (newIdx < 0 || newIdx >= siblings.length) return;

  if (delta < 0) {
    header.insertBefore(el, siblings[newIdx]);
  } else {
    header.insertBefore(el, siblings[newIdx].nextSibling);
  }

  // Update stored layout to match new DOM order
  updateOrderFromDOM(header);
  saveEditLayout();

  // Rebuild reorder UI and preserve focus on the moved item's button
  if (editPanel) {
    const list = editPanel.querySelector('.header-edit-reorder-list');
    if (list) {
      buildHeaderReorderList(list);
      const movedRow = list.querySelector(`.header-edit-reorder-item[data-item-id="${CSS.escape(itemId)}"]`);
      if (movedRow) {
        const btn = movedRow.querySelector(
          delta < 0 ? '.header-edit-reorder-btn:first-of-type' : '.header-edit-reorder-btn:last-of-type'
        );
        if (btn && !btn.disabled) {
          btn.focus();
        } else {
          const fallback = movedRow.querySelector('.header-edit-reorder-btn:not([disabled])');
          if (fallback) fallback.focus();
        }
      }
    }
    const live = editPanel.querySelector('.header-edit-reorder-live');
    if (live) {
      const newOrder = getHeaderOrderFromDOM();
      const pos = newOrder.indexOf(itemId) + 1;
      live.textContent = `${getHeaderItemDisplayName(itemId)} moved to position ${pos} of ${newOrder.length}`;
    }
  }
}

// ==================== Save Layout ====================

async function saveEditLayout() {
  try {
    await browserAPI.storage.sync.set({ headerLayout: currentEditLayout });
  } catch (e) {
    console.debug('[Popup Edit] Failed to save layout:', e.message);
  }
}

// ==================== Show/Hide Toggle ====================

function toggleItemVisibility(id, visible) {
  const header = document.querySelector('.header');
  if (!header || !currentEditLayout) return;

  const item = header.querySelector('[data-header-item="' + id + '"]');

  if (visible) {
    currentEditLayout.hidden = (currentEditLayout.hidden || []).filter(h => h !== id);
    if (item) {
      item.classList.remove('edit-hidden');
      item.classList.remove('header-item-hidden');
    }
  } else {
    if (!currentEditLayout.hidden) currentEditLayout.hidden = [];
    if (!currentEditLayout.hidden.includes(id)) {
      currentEditLayout.hidden.push(id);
    }
    if (item) item.classList.add('edit-hidden');
  }

  saveEditLayout();
}

// ==================== Spacer Count ====================

function setSpacerCount(count) {
  const header = document.querySelector('.header');
  if (!header || !currentEditLayout) return;

  count = Math.max(MIN_SPACERS, Math.min(MAX_SPACERS, count));
  currentEditLayout.spacerCount = count;

  // Get current spacers in DOM
  const existing = Array.from(header.querySelectorAll('.header-spacer'));
  const currentDomCount = existing.length;

  if (count > currentDomCount) {
    // Add spacers
    for (let i = currentDomCount; i < count; i++) {
      const spacer = document.createElement('div');
      spacer.className = 'header-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      spacer.dataset.headerItem = 'spacer' + (i + 1);

      // Insert before volume logo if it exists, otherwise append
      const vol = header.querySelector('[data-header-item="logo"]');
      if (vol) {
        header.insertBefore(spacer, vol);
      } else {
        header.appendChild(spacer);
      }
    }
  } else if (count < currentDomCount) {
    // Remove spacers from the end
    for (let i = currentDomCount - 1; i >= count; i--) {
      existing[i].remove();
    }
  }

  // Renumber spacers
  const spacers = Array.from(header.querySelectorAll('.header-spacer'));
  spacers.forEach((s, i) => {
    s.dataset.headerItem = 'spacer' + (i + 1);
  });

  // Ensure spacers are in the order array
  for (let i = 1; i <= count; i++) {
    const spacerId = 'spacer' + i;
    if (!currentEditLayout.order.includes(spacerId)) {
      // Insert after the previous spacer
      const prevIdx = currentEditLayout.order.indexOf('spacer' + (i - 1));
      if (prevIdx >= 0) {
        currentEditLayout.order.splice(prevIdx + 1, 0, spacerId);
      } else {
        currentEditLayout.order.push(spacerId);
      }
    }
  }

  // Remove spacers beyond count from order
  currentEditLayout.order = currentEditLayout.order.filter(id => {
    if (id.startsWith('spacer')) {
      const num = parseInt(id.replace('spacer', ''), 10);
      return num <= count;
    }
    return true;
  });


  saveEditLayout();
  setupDragListeners();
}

// ==================== Reset to Default ====================

function resetAllToDefault() {
  // Reset header layout
  resetHeaderToDefault();

  // Reset sections layout (order, hidden, control modes)
  if (typeof resetSectionsEditToDefault === 'function') {
    resetSectionsEditToDefault();
  }

  // Reset appearance settings to defaults
  browserAPI.storage.sync.set({
    tabInfoLocation: DEFAULTS.tabInfoLocation,
    badgeStyle: DEFAULTS.badgeStyle,
    showVisualizer: DEFAULTS.showVisualizer,
    showSeekbar: DEFAULTS.showSeekbar,
    showShortcutsFooter: DEFAULTS.showShortcutsFooter
  });

  // Refresh the edit panel to reflect new state
  createEditPanel();
}

function resetHeaderToDefault() {
  const header = document.querySelector('.header');
  if (!header) return;

  currentEditLayout = JSON.parse(JSON.stringify(DEFAULTS.headerLayout));

  // Un-hide all items
  header.querySelectorAll('[data-header-item].edit-hidden').forEach(el => {
    el.classList.remove('edit-hidden');
  });

  // Reset spacer count (re-creates spacers and saves layout)
  setSpacerCount(currentEditLayout.spacerCount);

  // Reorder to default
  for (const id of currentEditLayout.order) {
    const el = header.querySelector('[data-header-item="' + id + '"]');
    if (el) header.appendChild(el);
  }

  setupDragListeners();

  // Refresh the panel to reflect new state
  createEditPanel();
}

// ==================== Drag & Drop (Pointer Events) ====================

function setupDragListeners() {
  teardownDragListeners();
  const header = document.querySelector('.header');
  if (!header) return;

  header.querySelectorAll('[data-header-item]').forEach(el => {
    const handler = (e) => {
      if (!headerEditMode) return;
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      dragState = {
        el: el,
        clone: el.cloneNode(true),
        startX: e.clientX,
        offsetX: e.clientX - rect.left,
        moved: false
      };

      // Style the clone as floating drag ghost (static styles via CSS class)
      dragState.clone.classList.add('edit-drag-clone');
      // Dynamic position/size must be set inline
      const s = dragState.clone.style;
      s.top = rect.top + 'px';
      s.left = rect.left + 'px';
      s.width = rect.width + 'px';
      s.height = rect.height + 'px';

      el.setPointerCapture(e.pointerId);
      el.addEventListener('pointermove', onDragMove);
      el.addEventListener('pointerup', onDragEnd);
      el.addEventListener('pointercancel', onDragEnd);
    };

    el.addEventListener('pointerdown', handler);
    dragHandlers.set(el, handler);
  });
}

function teardownDragListeners() {
  dragHandlers.forEach((handler, el) => {
    el.removeEventListener('pointerdown', handler);
  });
  dragHandlers.clear();
}

function onDragMove(e) {
  if (!dragState) return;
  const header = document.querySelector('.header');
  if (!header) return;

  // Start drag after 5px threshold
  if (!dragState.moved && Math.abs(e.clientX - dragState.startX) > 5) {
    dragState.moved = true;
    dragState.el.classList.add('edit-dragging');
    document.body.appendChild(dragState.clone);
  }

  if (dragState.moved) {
    const headerRect = header.getBoundingClientRect();
    const cloneX = Math.max(
      headerRect.left,
      Math.min(e.clientX - dragState.offsetX, headerRect.right - dragState.clone.offsetWidth)
    );
    dragState.clone.style.left = cloneX + 'px';
    showDropIndicator(header, e.clientX);
  }
}

function onDragEnd(e) {
  if (!dragState) return;
  const header = document.querySelector('.header');
  const item = dragState.el;

  item.removeEventListener('pointermove', onDragMove);
  item.removeEventListener('pointerup', onDragEnd);
  item.removeEventListener('pointercancel', onDragEnd);
  item.releasePointerCapture(e.pointerId);

  if (header) {
    header.querySelectorAll('.header-drop-indicator').forEach(el => el.remove());
  }

  // Always clean up clone and dragging state if drag threshold was crossed
  if (dragState.moved) {
    if (dragState.clone.parentNode) dragState.clone.remove();
    item.classList.remove('edit-dragging');
  }

  if (dragState.moved && header) {

    // Find drop target and insert
    const target = findInsertTarget(header, e.clientX);
    if (target && target !== item) {
      const targetRect = target.getBoundingClientRect();
      if (e.clientX < targetRect.left + targetRect.width / 2) {
        header.insertBefore(item, target);
      } else {
        header.insertBefore(item, target.nextSibling);
      }
    }

    // Update the order in currentEditLayout based on new DOM order
    updateOrderFromDOM(header);
    saveEditLayout();

    // Renumber spacers
    const spacers = Array.from(header.querySelectorAll('.header-spacer'));
    spacers.forEach((s, i) => {
      s.dataset.headerItem = 'spacer' + (i + 1);
    });

    setupDragListeners();

    // Keep the keyboard reorder list in sync with the new DOM order (#74)
    if (editPanel) {
      const list = editPanel.querySelector('.header-edit-reorder-list');
      if (list) buildHeaderReorderList(list);
    }
  }

  dragState = null;
}

function showDropIndicator(header, clientX) {
  header.querySelectorAll('.header-drop-indicator').forEach(el => el.remove());

  const target = findInsertTarget(header, clientX);
  if (!target || target === (dragState ? dragState.el : null)) return;

  const ind = document.createElement('div');
  ind.className = 'header-drop-indicator';

  const targetRect = target.getBoundingClientRect();
  if (clientX < targetRect.left + targetRect.width / 2) {
    header.insertBefore(ind, target);
  } else {
    header.insertBefore(ind, target.nextSibling);
  }
}

function findInsertTarget(header, clientX) {
  const items = Array.from(header.querySelectorAll('[data-header-item]'))
    .filter(el => el !== (dragState ? dragState.el : null));

  let closest = null;
  let closestDist = Infinity;

  for (const item of items) {
    const rect = item.getBoundingClientRect();
    const dist = Math.abs(clientX - (rect.left + rect.width / 2));
    if (dist < closestDist) {
      closestDist = dist;
      closest = item;
    }
  }

  return closest;
}

function updateOrderFromDOM(header) {
  if (!currentEditLayout) return;

  const newOrder = [];
  header.querySelectorAll('[data-header-item]').forEach(el => {
    const id = el.dataset.headerItem;
    if (id) newOrder.push(id);
  });

  // Also include spacers beyond current count that may be in the layout order
  // (they're not in the DOM but should be preserved)
  currentEditLayout.order = newOrder;
}

// ==================== Live Sync from Options Page ====================

browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes.headerLayout) return;
  if (!headerEditMode || !currentEditLayout) return;
  // Skip if we're mid-drag to avoid conflicts
  if (dragState) return;

  const newLayout = changes.headerLayout.newValue;
  if (!newLayout) return;

  const header = document.querySelector('.header');
  if (!header) return;

  // Update local state
  currentEditLayout = JSON.parse(JSON.stringify(newLayout));

  // Apply hidden state to header items
  const hiddenSet = new Set(currentEditLayout.hidden || []);
  header.querySelectorAll('[data-header-item]').forEach(el => {
    const id = el.dataset.headerItem;
    el.classList.toggle('edit-hidden', hiddenSet.has(id));
  });

  // Update spacer count if changed
  const currentSpacers = header.querySelectorAll('.header-spacer').length;
  const newCount = currentEditLayout.spacerCount || 4;
  if (currentSpacers !== newCount) {
    setSpacerCount(newCount);
  }

  // Reorder DOM to match new order
  for (const id of currentEditLayout.order) {
    const el = header.querySelector('[data-header-item="' + id + '"]');
    if (el) header.appendChild(el);
  }

  // Rebuild the edit panel to reflect new state
  createEditPanel();
  setupDragListeners();
});

// ==================== Initialize on DOM Ready ====================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHeaderEditMode);
} else {
  initHeaderEditMode();
}
