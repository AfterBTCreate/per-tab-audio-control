// Per-Tab Audio Control - Popup Sections Edit Mode
// When header edit mode is active, replaces the enhancements section
// with a compact editor for reordering, S/P toggle, and show/hide.
// Saves to chrome.storage.sync and live-syncs with the options page.

'use strict';

// ==================== State ====================
let sectionsEditMode = false;
let sectionsEditor = null;
let currentSectionsLayout = null;
let sectionDragState = null;
const sectionDragHandlers = new Map();
let sectionsWarningTimer = null;

// ==================== Enter/Exit ====================

async function enterSectionsEditMode() {
  const panel = document.querySelector('.enhancements-section');
  if (!panel || sectionsEditMode) return;

  // Load current layout from storage
  try {
    const result = await browserAPI.storage.sync.get(['popupSectionsLayout', 'eqControlMode']);
    currentSectionsLayout = result.popupSectionsLayout
      ? JSON.parse(JSON.stringify(result.popupSectionsLayout))
      : JSON.parse(JSON.stringify(DEFAULTS.popupSectionsLayout));
    // Store global EQ mode for fallback
    currentSectionsLayout._globalEqMode = result.eqControlMode || DEFAULTS.eqControlMode;
  } catch (e) {
    currentSectionsLayout = JSON.parse(JSON.stringify(DEFAULTS.popupSectionsLayout));
    currentSectionsLayout._globalEqMode = DEFAULTS.eqControlMode;
  }

  // Validate layout
  validateSectionsEditLayout();

  sectionsEditMode = true;

  // Ensure panel is visible (open advanced mode if needed)
  if (document.body.classList.contains('basic-mode')) {
    document.body.classList.remove('basic-mode');
  }

  panel.classList.add('sections-edit-mode');
  buildSectionsEditor();
}

function exitSectionsEditMode() {
  const panel = document.querySelector('.enhancements-section');
  if (!panel || !sectionsEditMode) return;

  // Cancel any in-progress drag
  if (sectionDragState) {
    if (sectionDragState.moved && sectionDragState.clone.parentNode) sectionDragState.clone.remove();
    sectionDragState.el.classList.remove('section-dragging');
    sectionDragState.el.removeEventListener('pointermove', onSectionDragMove);
    sectionDragState.el.removeEventListener('pointerup', onSectionDragEnd);
    sectionDragState.el.removeEventListener('pointercancel', onSectionDragEnd);
    sectionDragState = null;
  }

  sectionsEditMode = false;
  panel.classList.remove('sections-edit-mode');

  if (sectionsEditor) {
    sectionsEditor.remove();
    sectionsEditor = null;
  }

  teardownSectionDragListeners();

  // Re-apply layout to the actual popup sections
  applyPopupSectionsLayout();
  loadEqControlMode();
}

// ==================== Validate ====================

function validateSectionsEditLayout() {
  if (!currentSectionsLayout) return;
  const allSections = Object.keys(POPUP_SECTION_DATA);

  // Deduplicate order
  currentSectionsLayout.order = [...new Set(currentSectionsLayout.order)];

  // Ensure all sections present
  const orderSet = new Set(currentSectionsLayout.order);
  for (const id of allSections) {
    if (!orderSet.has(id)) currentSectionsLayout.order.push(id);
  }

  // Remove invalid IDs
  currentSectionsLayout.order = currentSectionsLayout.order.filter(id => POPUP_SECTION_DATA[id]);

  if (!currentSectionsLayout.hidden) currentSectionsLayout.hidden = [];
  currentSectionsLayout.hidden = currentSectionsLayout.hidden.filter(id => POPUP_SECTION_DATA[id]);

  if (!currentSectionsLayout.controlMode || typeof currentSectionsLayout.controlMode !== 'object') {
    currentSectionsLayout.controlMode = {};
  }
  for (const key of Object.keys(currentSectionsLayout.controlMode)) {
    if (!EQ_DUAL_MODE_ITEMS.has(key)) delete currentSectionsLayout.controlMode[key];
  }
}

// ==================== Build Editor ====================

function buildSectionsEditor() {
  const panel = document.querySelector('.enhancements-section');
  if (!panel || !currentSectionsLayout) return;

  if (sectionsEditor) sectionsEditor.remove();

  const editor = document.createElement('div');
  editor.className = 'sections-editor';

  const hiddenSet = new Set(currentSectionsLayout.hidden);

  for (const sectionId of currentSectionsLayout.order) {
    const data = POPUP_SECTION_DATA[sectionId];
    if (!data) continue;

    const isHidden = hiddenSet.has(sectionId);

    const row = document.createElement('div');
    row.className = 'section-edit-item' + (isHidden ? ' section-hidden' : '');
    row.dataset.sectionId = sectionId;

    // Drag handle
    const handle = document.createElement('div');
    handle.className = 'section-edit-drag-handle';
    for (let i = 0; i < 3; i++) handle.appendChild(document.createElement('span'));
    row.appendChild(handle);

    // Name
    const name = document.createElement('div');
    name.className = 'section-edit-name';
    name.textContent = data.name;
    row.appendChild(name);

    // S/P toggle buttons (dual-mode items only)
    if (EQ_DUAL_MODE_ITEMS.has(sectionId)) {
      const mode = getSectionEditMode(sectionId);
      const wrap = document.createElement('div');
      wrap.className = 'section-edit-sp-wrap';

      const sBtn = document.createElement('button');
      sBtn.type = 'button';
      sBtn.className = 'section-edit-sp-btn' + (mode === 'sliders' ? ' active' : '');
      sBtn.textContent = 'Slider';
      sBtn.title = 'Sliders mode';
      sBtn.setAttribute('aria-pressed', mode === 'sliders' ? 'true' : 'false');
      sBtn.setAttribute('aria-label', `Sliders mode for ${name.textContent || sectionId}`);
      sBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setSectionEditMode(sectionId, 'sliders');
      });

      const pBtn = document.createElement('button');
      pBtn.type = 'button';
      pBtn.className = 'section-edit-sp-btn' + (mode === 'presets' ? ' active' : '');
      pBtn.textContent = 'Preset';
      pBtn.title = 'Presets mode';
      pBtn.setAttribute('aria-pressed', mode === 'presets' ? 'true' : 'false');
      pBtn.setAttribute('aria-label', `Presets mode for ${name.textContent || sectionId}`);
      pBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setSectionEditMode(sectionId, 'presets');
      });

      wrap.appendChild(sBtn);
      wrap.appendChild(pBtn);
      row.appendChild(wrap);
    }

    // Visibility checkbox with "Hide" label
    const vis = document.createElement('label');
    vis.className = 'section-edit-visibility';

    const hideText = document.createElement('span');
    hideText.className = 'section-edit-hide-label';
    hideText.textContent = 'Hide';
    vis.appendChild(hideText);

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = isHidden;
    cb.title = isHidden ? 'Section is hidden' : 'Click to hide';
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleSectionEditVisibility(sectionId, !cb.checked);
    });
    vis.appendChild(cb);
    row.appendChild(vis);

    editor.appendChild(row);
  }

  // Warning message
  const warning = document.createElement('div');
  warning.className = 'sections-edit-warning';
  editor.appendChild(warning);

  // Bulk action buttons
  const bulk = document.createElement('div');
  bulk.className = 'sections-edit-bulk';

  const allSlidersBtn = document.createElement('button');
  allSlidersBtn.type = 'button';
  allSlidersBtn.className = 'sections-edit-bulk-btn';
  allSlidersBtn.textContent = 'All Sliders';
  allSlidersBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setAllSectionEditModes('sliders');
  });

  const allPresetsBtn = document.createElement('button');
  allPresetsBtn.type = 'button';
  allPresetsBtn.className = 'sections-edit-bulk-btn';
  allPresetsBtn.textContent = 'All Presets';
  allPresetsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setAllSectionEditModes('presets');
  });

  bulk.appendChild(allSlidersBtn);
  bulk.appendChild(allPresetsBtn);
  editor.appendChild(bulk);

  // ── Badge Style ──
  const badgeSec = document.createElement('div');
  badgeSec.className = 'sections-edit-badge';

  const badgeLabel = document.createElement('span');
  badgeLabel.className = 'sections-edit-badge-label';
  badgeLabel.textContent = 'Badge';
  badgeSec.appendChild(badgeLabel);

  const badgeBtns = document.createElement('div');
  badgeBtns.className = 'sections-edit-badge-btns';

  browserAPI.storage.sync.get(['badgeStyle']).then(result => {
    const currentBadge = result.badgeStyle || DEFAULTS.badgeStyle;
    const badgeOpts = [
      { value: 'light', label: 'Light on Dark' },
      { value: 'dark', label: 'Dark on Light' },
      { value: 'color', label: 'Volume Color' }
    ];
    for (const opt of badgeOpts) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sections-edit-badge-btn' + (currentBadge === opt.value ? ' active' : '');
      btn.textContent = opt.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        browserAPI.storage.sync.set({ badgeStyle: opt.value });
        badgeBtns.querySelectorAll('.sections-edit-badge-btn').forEach(b =>
          b.classList.toggle('active', b === btn));
      });
      badgeBtns.appendChild(btn);
    }
  });
  badgeSec.appendChild(badgeBtns);
  editor.appendChild(badgeSec);

  // ── Hide Checkboxes (Visualizer, Seekbar, Shortcuts) ──
  const hideSec = document.createElement('div');
  hideSec.className = 'sections-edit-appearance';

  const hideChecks = document.createElement('div');
  hideChecks.className = 'sections-edit-appearance-checks';

  const appearanceItems = [
    { key: 'showVisualizer', label: 'Visualizer' },
    { key: 'showSeekbar', label: 'Seekbar' },
    { key: 'showShortcutsFooter', label: 'Shortcuts' }
  ];

  browserAPI.storage.sync.get(appearanceItems.map(i => i.key)).then(result => {
    for (const item of appearanceItems) {
      const show = result[item.key] ?? DEFAULTS[item.key];
      const lbl = document.createElement('label');
      lbl.className = 'sections-edit-appearance-check';

      const hideText = document.createElement('span');
      hideText.className = 'sections-edit-appearance-hide-text';
      hideText.textContent = 'Hide';
      lbl.appendChild(hideText);

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !show;
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        browserAPI.storage.sync.set({ [item.key]: !cb.checked });
        // Update Tab Title buttons when visualizer visibility changes
        if (item.key === 'showVisualizer' && typeof updateEditTitleBtnsState === 'function') {
          updateEditTitleBtnsState(cb.checked); // checked = hidden
        }
      });
      lbl.appendChild(cb);

      const txt = document.createTextNode(' ' + item.label);
      lbl.appendChild(txt);
      hideChecks.appendChild(lbl);
    }
  });

  hideSec.appendChild(hideChecks);
  editor.appendChild(hideSec);

  panel.appendChild(editor);
  sectionsEditor = editor;

  setupSectionDragListeners();
}

// ==================== Control Mode ====================

function getSectionEditMode(sectionId) {
  const controlMode = currentSectionsLayout.controlMode || {};
  if (controlMode[sectionId]) return controlMode[sectionId];
  return currentSectionsLayout._globalEqMode || DEFAULTS.eqControlMode;
}

function setSectionEditMode(sectionId, mode) {
  if (!currentSectionsLayout.controlMode) currentSectionsLayout.controlMode = {};

  const globalMode = currentSectionsLayout._globalEqMode || DEFAULTS.eqControlMode;
  if (mode === globalMode) {
    // Matches global default — remove per-item override (sparse storage)
    delete currentSectionsLayout.controlMode[sectionId];
  } else {
    currentSectionsLayout.controlMode[sectionId] = mode;
  }

  saveSectionsEditLayout();
  buildSectionsEditor();
}

function setAllSectionEditModes(mode) {
  // Update global default
  currentSectionsLayout._globalEqMode = mode;
  browserAPI.storage.sync.set({ eqControlMode: mode });

  // Clear all per-item overrides
  currentSectionsLayout.controlMode = {};

  saveSectionsEditLayout();
  buildSectionsEditor();
}

// ==================== Visibility ====================

function toggleSectionEditVisibility(sectionId, visible) {
  const hidden = new Set(currentSectionsLayout.hidden);

  if (visible) {
    hidden.delete(sectionId);
  } else {
    // Check minimum
    const visibleCount = currentSectionsLayout.order.filter(id => !hidden.has(id)).length;
    if (visibleCount <= MIN_VISIBLE_POPUP_SECTIONS) {
      showSectionsEditWarning('At least one control must remain visible');
      buildSectionsEditor();
      return;
    }
    hidden.add(sectionId);
  }

  currentSectionsLayout.hidden = Array.from(hidden);
  saveSectionsEditLayout();
  buildSectionsEditor();
}

// ==================== Reset ====================

function resetSectionsEditToDefault() {
  currentSectionsLayout = JSON.parse(JSON.stringify(DEFAULTS.popupSectionsLayout));
  currentSectionsLayout._globalEqMode = DEFAULTS.eqControlMode;

  // Also reset global EQ mode
  browserAPI.storage.sync.set({ eqControlMode: DEFAULTS.eqControlMode });

  saveSectionsEditLayout();
  buildSectionsEditor();
}

// ==================== Save ====================

async function saveSectionsEditLayout() {
  if (!currentSectionsLayout) return;
  try {
    // Don't persist the internal _globalEqMode field
    const toSave = {
      order: currentSectionsLayout.order,
      hidden: currentSectionsLayout.hidden,
      controlMode: currentSectionsLayout.controlMode
    };
    await browserAPI.storage.sync.set({ popupSectionsLayout: toSave });
  } catch (e) {
    console.debug('[Popup Sections Edit] Failed to save:', e.message);
  }
}

// ==================== Warning ====================

function showSectionsEditWarning(msg) {
  if (!sectionsEditor) return;
  const el = sectionsEditor.querySelector('.sections-edit-warning');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
  if (sectionsWarningTimer) clearTimeout(sectionsWarningTimer);
  sectionsWarningTimer = setTimeout(() => {
    el.classList.remove('visible');
    sectionsWarningTimer = null;
  }, 2500);
}

// ==================== Drag & Drop (Pointer Events) ====================

function setupSectionDragListeners() {
  teardownSectionDragListeners();
  if (!sectionsEditor) return;

  sectionsEditor.querySelectorAll('.section-edit-item').forEach(item => {
    const handler = (e) => {
      if (!sectionsEditMode) return;
      // Don't start drag when clicking buttons, inputs, or labels
      const target = e.target;
      if (target.closest('button') || target.closest('input') || target.closest('label')) return;
      e.preventDefault();
      e.stopPropagation();

      const rect = item.getBoundingClientRect();
      sectionDragState = {
        el: item,
        clone: item.cloneNode(true),
        id: item.dataset.sectionId,
        startY: e.clientY,
        offsetY: e.clientY - rect.top,
        moved: false
      };

      // Style clone
      sectionDragState.clone.classList.add('section-edit-drag-clone');
      const s = sectionDragState.clone.style;
      s.top = rect.top + 'px';
      s.left = rect.left + 'px';
      s.width = rect.width + 'px';
      s.height = rect.height + 'px';

      item.setPointerCapture(e.pointerId);
      item.addEventListener('pointermove', onSectionDragMove);
      item.addEventListener('pointerup', onSectionDragEnd);
      item.addEventListener('pointercancel', onSectionDragEnd);
    };

    item.addEventListener('pointerdown', handler);
    sectionDragHandlers.set(item, handler);
  });
}

function teardownSectionDragListeners() {
  sectionDragHandlers.forEach((handler, el) => el.removeEventListener('pointerdown', handler));
  sectionDragHandlers.clear();
}

function onSectionDragMove(e) {
  if (!sectionDragState || !sectionsEditor) return;

  if (!sectionDragState.moved && Math.abs(e.clientY - sectionDragState.startY) > 5) {
    sectionDragState.moved = true;
    sectionDragState.el.classList.add('section-dragging');
    document.body.appendChild(sectionDragState.clone);
  }

  if (sectionDragState.moved) {
    const editorRect = sectionsEditor.getBoundingClientRect();
    const cloneY = Math.max(editorRect.top,
      Math.min(e.clientY - sectionDragState.offsetY, editorRect.bottom - sectionDragState.clone.offsetHeight));
    sectionDragState.clone.style.top = cloneY + 'px';
    showSectionDropIndicator(e.clientY);
  }
}

function onSectionDragEnd(e) {
  if (!sectionDragState || !sectionsEditor) return;
  const item = sectionDragState.el;

  item.removeEventListener('pointermove', onSectionDragMove);
  item.removeEventListener('pointerup', onSectionDragEnd);
  item.removeEventListener('pointercancel', onSectionDragEnd);
  item.releasePointerCapture(e.pointerId);

  sectionsEditor.querySelectorAll('.section-edit-drop-indicator').forEach(el => el.remove());

  if (sectionDragState.moved) {
    sectionDragState.clone.remove();
    item.classList.remove('section-dragging');

    const target = findSectionInsertTarget(e.clientY);
    if (target && target !== item) {
      const draggedId = sectionDragState.id;
      const targetId = target.dataset.sectionId;

      const order = [...currentSectionsLayout.order];
      const draggedIdx = order.indexOf(draggedId);
      if (draggedIdx >= 0) {
        order.splice(draggedIdx, 1);
        let targetIdx = order.indexOf(targetId);
        const targetRect = target.getBoundingClientRect();
        if (e.clientY > targetRect.top + targetRect.height / 2) targetIdx++;
        order.splice(targetIdx, 0, draggedId);
      }
      currentSectionsLayout.order = order;
      saveSectionsEditLayout();
    }

    buildSectionsEditor();
  }

  sectionDragState = null;
}

function showSectionDropIndicator(clientY) {
  if (!sectionsEditor) return;
  sectionsEditor.querySelectorAll('.section-edit-drop-indicator').forEach(el => el.remove());

  const target = findSectionInsertTarget(clientY);
  if (!target || target === (sectionDragState ? sectionDragState.el : null)) return;

  const ind = document.createElement('div');
  ind.className = 'section-edit-drop-indicator';

  const targetRect = target.getBoundingClientRect();
  if (clientY < targetRect.top + targetRect.height / 2) {
    sectionsEditor.insertBefore(ind, target);
  } else {
    sectionsEditor.insertBefore(ind, target.nextSibling);
  }
}

function findSectionInsertTarget(clientY) {
  if (!sectionsEditor) return null;
  const items = Array.from(sectionsEditor.querySelectorAll('.section-edit-item'))
    .filter(el => el !== (sectionDragState ? sectionDragState.el : null));

  let closest = null;
  let closestDist = Infinity;
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    const dist = Math.abs(clientY - (rect.top + rect.height / 2));
    if (dist < closestDist) { closestDist = dist; closest = item; }
  }
  return closest;
}

// ==================== Live Sync from Options Page ====================

browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;

  // If sections editor is open and options page changes the layout, rebuild
  if (changes.popupSectionsLayout && sectionsEditMode && currentSectionsLayout) {
    const newLayout = changes.popupSectionsLayout.newValue;
    if (newLayout) {
      currentSectionsLayout.order = newLayout.order || currentSectionsLayout.order;
      currentSectionsLayout.hidden = newLayout.hidden || [];
      currentSectionsLayout.controlMode = newLayout.controlMode || {};
      buildSectionsEditor();
    }
  }

  if (changes.eqControlMode && sectionsEditMode && currentSectionsLayout) {
    currentSectionsLayout._globalEqMode = changes.eqControlMode.newValue || DEFAULTS.eqControlMode;
    buildSectionsEditor();
  }
});
