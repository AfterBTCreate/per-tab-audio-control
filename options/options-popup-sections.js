// Per-Tab Audio Control - Options Popup Sections Layout Module
// Drag-and-drop reordering, visibility toggles, and per-item S/P mode for popup sections

// State
let popupSectionsLayout = null;
let draggedSectionId = null;

// DOM Elements (set after DOMContentLoaded)
let popupSectionsPreview = null;
let popupSectionsWarning = null;
let popupSectionsStatus = null;

// ==================== Build Preview ====================

function rebuildPopupSectionsPreview() {
  if (!popupSectionsPreview || !popupSectionsLayout) return;

  // Clear existing content safely
  while (popupSectionsPreview.firstChild) {
    popupSectionsPreview.removeChild(popupSectionsPreview.firstChild);
  }

  // Build items in order
  for (const sectionId of popupSectionsLayout.order) {
    const sectionData = POPUP_SECTION_DATA[sectionId];
    if (!sectionData) continue;

    const isHidden = popupSectionsLayout.hidden.includes(sectionId);

    // Create wrapper for drop indicator
    const wrapper = document.createElement('div');
    wrapper.className = 'popup-section-wrapper';
    wrapper.dataset.sectionId = sectionId;

    // Drop indicator (top)
    const dropIndicator = document.createElement('div');
    dropIndicator.className = 'drop-indicator';
    wrapper.appendChild(dropIndicator);

    // Section item
    const item = document.createElement('div');
    item.className = `popup-section-item${isHidden ? ' hidden-item' : ''}`;
    item.draggable = true;
    item.dataset.sectionId = sectionId;

    // Drag handle (three horizontal lines)
    const dragHandle = document.createElement('div');
    dragHandle.className = 'popup-section-drag-handle';
    for (let i = 0; i < 3; i++) {
      const line = document.createElement('span');
      dragHandle.appendChild(line);
    }
    item.appendChild(dragHandle);

    // Section info
    const info = document.createElement('div');
    info.className = 'popup-section-info';

    const name = document.createElement('div');
    name.className = 'popup-section-name';
    name.textContent = sectionData.name;
    info.appendChild(name);

    const description = document.createElement('div');
    description.className = 'popup-section-description';
    description.textContent = sectionData.description;
    info.appendChild(description);

    item.appendChild(info);

    // S/P toggle button (only for dual-mode items)
    if (EQ_DUAL_MODE_ITEMS.has(sectionId)) {
      const mode = getItemControlMode(sectionId);
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = `popup-section-mode-toggle${mode === 'sliders' ? ' mode-sliders' : ' mode-presets'}`;
      toggle.textContent = mode === 'sliders' ? 'S' : 'P';
      toggle.title = mode === 'sliders' ? 'Sliders mode (click for Presets)' : 'Presets mode (click for Sliders)';
      toggle.setAttribute('aria-label', `${sectionData.name} control mode: ${mode}`);
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleItemControlMode(sectionId);
      });
      item.appendChild(toggle);
    }

    // Visibility checkbox
    const visibility = document.createElement('div');
    visibility.className = 'popup-section-visibility';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !isHidden;
    checkbox.title = isHidden ? 'Show control' : 'Hide control';
    checkbox.setAttribute('aria-label', `${sectionData.name} visibility`);
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      togglePopupSectionVisibility(sectionId, e.target.checked);
    });
    visibility.appendChild(checkbox);

    item.appendChild(visibility);

    // Drag events
    item.addEventListener('dragstart', handlePopupSectionDragStart);
    item.addEventListener('dragend', handlePopupSectionDragEnd);

    wrapper.appendChild(item);

    // Drop events on wrapper
    wrapper.addEventListener('dragover', handlePopupSectionDragOver);
    wrapper.addEventListener('dragleave', handlePopupSectionDragLeave);
    wrapper.addEventListener('drop', handlePopupSectionDrop);

    popupSectionsPreview.appendChild(wrapper);
  }
}

// ==================== Per-Item Control Mode ====================

// Get effective control mode for an item (per-item override or global default)
function getItemControlMode(sectionId) {
  const controlMode = popupSectionsLayout.controlMode || {};
  if (controlMode[sectionId]) {
    return controlMode[sectionId];
  }
  // Fall through to global default (loaded asynchronously, but we cache it)
  return cachedGlobalEqMode || DEFAULTS.eqControlMode;
}

// Cached global EQ mode (loaded once at init)
let cachedGlobalEqMode = DEFAULTS.eqControlMode;

async function loadCachedGlobalEqMode() {
  const result = await browserAPI.storage.sync.get(['eqControlMode']);
  cachedGlobalEqMode = result.eqControlMode || DEFAULTS.eqControlMode;
}

// Toggle an item's control mode between sliders and presets
function toggleItemControlMode(sectionId) {
  if (!popupSectionsLayout.controlMode) {
    popupSectionsLayout.controlMode = {};
  }

  const currentMode = getItemControlMode(sectionId);
  const newMode = currentMode === 'sliders' ? 'presets' : 'sliders';

  // If new mode matches global default, remove override (sparse storage)
  if (newMode === cachedGlobalEqMode) {
    delete popupSectionsLayout.controlMode[sectionId];
  } else {
    popupSectionsLayout.controlMode[sectionId] = newMode;
  }

  savePopupSectionsLayout();
  rebuildPopupSectionsPreview();

  // Also update the options page body class for preset section visibility
  updateEqBodyClass();
}

// Set all dual-mode items to the same mode
async function setAllControlMode(mode) {
  // Update the global default
  cachedGlobalEqMode = mode;
  await browserAPI.storage.sync.set({ eqControlMode: mode });

  // Clear all per-item overrides (they now all match global)
  popupSectionsLayout.controlMode = {};
  await savePopupSectionsLayout();
  rebuildPopupSectionsPreview();

  // Update body class for preset section visibility
  updateEqBodyClass();

  const label = mode === 'sliders' ? 'All set to Sliders' : 'All set to Presets';
  showPopupSectionsStatus(label, 'success');
}

// Update body class based on whether ANY item uses presets (for options page preset sections)
function updateEqBodyClass() {
  const anyPresets = EQ_DUAL_MODE_ITEMS.size > 0 && Array.from(EQ_DUAL_MODE_ITEMS).some(id => getItemControlMode(id) === 'presets');
  if (anyPresets) {
    document.body.classList.remove('sliders-mode');
  } else {
    document.body.classList.add('sliders-mode');
  }
}

// ==================== Drag and Drop Handlers ====================

function handlePopupSectionDragStart(e) {
  draggedSectionId = e.target.dataset.sectionId;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedSectionId);
}

function handlePopupSectionDragEnd(e) {
  e.target.classList.remove('dragging');
  draggedSectionId = null;

  // Clear all drop indicators
  document.querySelectorAll('.popup-section-wrapper .drop-indicator').forEach(ind => {
    ind.classList.remove('visible', 'bottom');
  });
}

function handlePopupSectionDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const wrapper = e.currentTarget;
  const targetId = wrapper.dataset.sectionId;

  // Don't show indicator when dragging over self
  if (targetId === draggedSectionId) return;

  // Calculate if we're in the top or bottom half
  const rect = wrapper.getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;
  const isBottomHalf = e.clientY > midpoint;

  // Show appropriate drop indicator
  const indicator = wrapper.querySelector('.drop-indicator');
  if (indicator) {
    indicator.classList.add('visible');
    indicator.classList.toggle('bottom', isBottomHalf);
  }
}

function handlePopupSectionDragLeave(e) {
  const wrapper = e.currentTarget;
  const indicator = wrapper.querySelector('.drop-indicator');
  if (indicator) {
    indicator.classList.remove('visible', 'bottom');
  }
}

function handlePopupSectionDrop(e) {
  e.preventDefault();

  const wrapper = e.currentTarget;
  const targetId = wrapper.dataset.sectionId;

  if (!draggedSectionId || targetId === draggedSectionId) return;

  // Calculate if we're dropping above or below
  const rect = wrapper.getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;
  const insertAfter = e.clientY > midpoint;

  // Get current order
  const order = [...popupSectionsLayout.order];
  const draggedIndex = order.indexOf(draggedSectionId);
  const targetIndex = order.indexOf(targetId);

  if (draggedIndex === -1 || targetIndex === -1) return;

  // Remove dragged item
  order.splice(draggedIndex, 1);

  // Calculate new position
  let newIndex = order.indexOf(targetId);
  if (insertAfter) {
    newIndex++;
  }

  // Insert at new position
  order.splice(newIndex, 0, draggedSectionId);

  // Update layout
  popupSectionsLayout.order = order;
  savePopupSectionsLayout();
  rebuildPopupSectionsPreview();

  // Clear drop indicators
  document.querySelectorAll('.popup-section-wrapper .drop-indicator').forEach(ind => {
    ind.classList.remove('visible', 'bottom');
  });
}

// ==================== Visibility Toggle ====================

function togglePopupSectionVisibility(sectionId, isVisible) {
  const hidden = new Set(popupSectionsLayout.hidden);

  if (isVisible) {
    // Show section
    hidden.delete(sectionId);
  } else {
    // Check if this would leave no visible sections
    const visibleCount = popupSectionsLayout.order.filter(id => !hidden.has(id)).length;
    if (visibleCount <= MIN_VISIBLE_POPUP_SECTIONS) {
      // Show warning and prevent hiding
      showPopupSectionsWarning('At least one control must remain visible.');
      rebuildPopupSectionsPreview(); // Reset checkbox state
      return;
    }
    hidden.add(sectionId);
  }

  popupSectionsLayout.hidden = Array.from(hidden);
  savePopupSectionsLayout();
  rebuildPopupSectionsPreview();
  hidePopupSectionsWarning();
}

// ==================== Warning Display ====================

function showPopupSectionsWarning(message) {
  if (popupSectionsWarning) {
    popupSectionsWarning.textContent = message;
    popupSectionsWarning.classList.add('visible');

    // Auto-hide after 3 seconds
    setTimeout(() => {
      hidePopupSectionsWarning();
    }, 3000);
  }
}

function hidePopupSectionsWarning() {
  if (popupSectionsWarning) {
    popupSectionsWarning.classList.remove('visible');
  }
}

// ==================== Save/Load ====================

async function savePopupSectionsLayout() {
  try {
    await browserAPI.storage.sync.set({ popupSectionsLayout });
    showPopupSectionsStatus('Saved', 'success');
  } catch (e) {
    console.error('[Options] Failed to save popup sections layout:', e);
    showPopupSectionsStatus('Failed to save', 'error');
  }
}

async function loadPopupSectionsLayout() {
  try {
    const result = await browserAPI.storage.sync.get(['popupSectionsLayout']);
    popupSectionsLayout = result.popupSectionsLayout || { ...DEFAULT_POPUP_SECTIONS_LAYOUT };

    // Validate and migrate if needed
    validatePopupSectionsLayout();

    // Load global EQ mode for S/P toggle defaults
    await loadCachedGlobalEqMode();

    rebuildPopupSectionsPreview();

    // Set initial body class for preset section visibility
    updateEqBodyClass();
  } catch (e) {
    console.error('[Options] Failed to load popup sections layout:', e);
    popupSectionsLayout = { ...DEFAULT_POPUP_SECTIONS_LAYOUT };
    rebuildPopupSectionsPreview();
  }
}

function validatePopupSectionsLayout() {
  // Remove duplicates from order array
  popupSectionsLayout.order = [...new Set(popupSectionsLayout.order)];

  // Ensure all sections are in the order array
  const allSections = Object.keys(POPUP_SECTION_DATA);
  const orderSet = new Set(popupSectionsLayout.order);

  for (const sectionId of allSections) {
    if (!orderSet.has(sectionId)) {
      popupSectionsLayout.order.push(sectionId);
    }
  }

  // Remove any sections that no longer exist
  popupSectionsLayout.order = popupSectionsLayout.order.filter(id => POPUP_SECTION_DATA[id]);

  // Ensure hidden array only contains valid section IDs
  popupSectionsLayout.hidden = popupSectionsLayout.hidden.filter(id => POPUP_SECTION_DATA[id]);

  // Ensure controlMode exists and only contains valid entries
  if (!popupSectionsLayout.controlMode || typeof popupSectionsLayout.controlMode !== 'object') {
    popupSectionsLayout.controlMode = {};
  }
  // Remove controlMode entries for non-dual-mode items
  for (const key of Object.keys(popupSectionsLayout.controlMode)) {
    if (!EQ_DUAL_MODE_ITEMS.has(key)) {
      delete popupSectionsLayout.controlMode[key];
    }
  }

  // Ensure at least one section is visible
  const visibleCount = popupSectionsLayout.order.filter(id => !popupSectionsLayout.hidden.includes(id)).length;
  if (visibleCount === 0 && popupSectionsLayout.order.length > 0) {
    // Show the first section
    popupSectionsLayout.hidden = popupSectionsLayout.hidden.filter(id => id !== popupSectionsLayout.order[0]);
  }
}

// ==================== Reset ====================

async function resetPopupSectionsLayout() {
  popupSectionsLayout = {
    order: [...DEFAULT_POPUP_SECTIONS_LAYOUT.order],
    hidden: [...DEFAULT_POPUP_SECTIONS_LAYOUT.hidden],
    controlMode: {}
  };

  // Also reset global EQ control mode to default
  cachedGlobalEqMode = DEFAULTS.eqControlMode;
  await browserAPI.storage.sync.set({ eqControlMode: DEFAULTS.eqControlMode });

  await savePopupSectionsLayout();
  rebuildPopupSectionsPreview();
  updateEqBodyClass();
  showPopupSectionsStatus('Reset to defaults', 'success');
}

// ==================== Status Display ====================

function showPopupSectionsStatus(message, type = 'info') {
  if (popupSectionsStatus) {
    popupSectionsStatus.textContent = message;
    popupSectionsStatus.className = `status-text ${type}`;

    setTimeout(() => {
      popupSectionsStatus.textContent = '';
      popupSectionsStatus.className = 'status-text';
    }, 2000);
  }
}

// ==================== Initialization ====================

function initPopupSectionsLayout() {
  // Get DOM elements
  popupSectionsPreview = document.getElementById('popupSectionsPreview');
  popupSectionsWarning = document.getElementById('popupSectionsWarning');
  popupSectionsStatus = document.getElementById('popupSectionsStatus');

  // Set up reset button
  const resetBtn = document.getElementById('resetPopupSectionsBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetPopupSectionsLayout);
  }

  // Set up All Sliders / All Presets buttons
  const allSlidersBtn = document.getElementById('allSlidersBtn');
  if (allSlidersBtn) {
    allSlidersBtn.addEventListener('click', () => setAllControlMode('sliders'));
  }

  const allPresetsBtn = document.getElementById('allPresetsBtn');
  if (allPresetsBtn) {
    allPresetsBtn.addEventListener('click', () => setAllControlMode('presets'));
  }

  // Load layout
  loadPopupSectionsLayout();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopupSectionsLayout);
} else {
  initPopupSectionsLayout();
}
