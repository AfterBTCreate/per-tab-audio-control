// Per-Tab Audio Control - Header Layout Customization
// Visual drag-and-drop editor matching the header-icon-arranger tool style

// ==================== Item Data ====================
// All SVGs use currentColor to avoid CSP inline style issues
const HEADER_ITEM_DATA = {
  companyLogo: {
    name: 'ABTC Logo',
    // Simplified monochrome version for CSP compliance
    icon: '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="5"><rect x="10" y="10" width="80" height="80" rx="8"/><line x1="50" y1="10" x2="50" y2="90" stroke-width="3"/><line x1="10" y1="50" x2="90" y2="50" stroke-width="3"/><text x="30" y="40" font-family="sans-serif" font-size="22" font-weight="600" fill="currentColor" stroke="none" text-anchor="middle">A</text><text x="70" y="40" font-family="sans-serif" font-size="22" font-weight="600" fill="currentColor" stroke="none" text-anchor="middle">B</text><text x="30" y="80" font-family="sans-serif" font-size="22" font-weight="600" fill="currentColor" stroke="none" text-anchor="middle">C</text></svg>',
    type: 'companyLogo'
  },
  tabCapture: {
    name: 'Tab Capture',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>',
    type: 'button'
  },
  webAudio: {
    name: 'Web Audio',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h2l2-4 3 8 3-8 2 4h4"/></svg>',
    type: 'button'
  },
  offMode: {
    name: 'Disable',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="5.5" y1="5.5" x2="18.5" y2="18.5"/></svg>',
    type: 'button'
  },
  focus: {
    name: 'Focus',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10" opacity="0.5"/><circle cx="12" cy="12" r="7" opacity="0.7"/><circle cx="12" cy="12" r="4" opacity="0.9"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/></svg>',
    type: 'button'
  },
  modeToggle: {
    name: 'Basic/Advanced',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>',
    type: 'button'
  },
  shortcuts: {
    name: 'Shortcuts',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10H6.01M10 10H10.01M14 10H14.01M18 10H18.01M8 14H16"/></svg>',
    type: 'button'
  },
  theme: {
    name: 'Theme',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>',
    type: 'button'
  },
  settings: {
    name: 'Settings',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
    type: 'button'
  },
  logo: {
    name: 'Volume Icon',
    icon: '<svg viewBox="0 0 28 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2V15H6L11 19V5Z"/><path d="M14.5 10C15.1 10.7 15.5 11.3 15.5 12C15.5 12.7 15.1 13.3 14.5 14"/><path d="M16.5 8.5C17.5 9.5 18 10.7 18 12C18 13.3 17.5 14.5 16.5 15.5"/></svg>',
    type: 'logo'
  }
};

const SPACER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

// ==================== State ====================
let currentLayout = null;
let draggedId = null;
let dropTargetId = null;
let dropPosition = null;

// ==================== DOM Elements ====================
let previewContainer = null;
let statusElement = null;

// ==================== Initialization ====================

function initHeaderLayoutEditor() {
  previewContainer = document.getElementById('headerLayoutPreview');
  statusElement = document.getElementById('headerLayoutStatus');

  if (!previewContainer) {
    console.debug('[Options] Header layout preview element not found');
    return;
  }

  loadHeaderLayout();
  setupSpacerControls();
  setupVisibilityToggles();
  setupResetButton();
}

// ==================== Load/Save ====================

async function loadHeaderLayout() {
  try {
    const result = await browserAPI.storage.sync.get(['headerLayout']);
    currentLayout = result.headerLayout || JSON.parse(JSON.stringify(DEFAULT_HEADER_LAYOUT));

    // Ensure spacerCount is valid
    if (typeof currentLayout.spacerCount !== 'number') {
      currentLayout.spacerCount = 1;
    }

    // Ensure hidden is an array
    if (!Array.isArray(currentLayout.hidden)) {
      currentLayout.hidden = [];
    }

    // Migration: pauseOthers → muteOthers → focus (v3.3.25, v4.1.4)
    const needsFocusMigration = currentLayout.order.some(id => id === 'pauseOthers' || id === 'muteOthers');
    if (needsFocusMigration) {
      currentLayout.order = currentLayout.order.map(id =>
        (id === 'pauseOthers' || id === 'muteOthers') ? 'focus' : id
      );
      // Also migrate hidden array if needed
      currentLayout.hidden = currentLayout.hidden.map(id =>
        (id === 'pauseOthers' || id === 'muteOthers') ? 'focus' : id
      );
      // Save the migrated layout
      saveHeaderLayout();
    }

    // Migration: audioMode → tabCapture + webAudio (v4.1.19)
    const needsAudioModeMigration = currentLayout.order.some(id => id === 'audioMode');
    if (needsAudioModeMigration) {
      // Replace audioMode with tabCapture and webAudio
      const newOrder = [];
      for (const id of currentLayout.order) {
        if (id === 'audioMode') {
          newOrder.push('tabCapture', 'webAudio');
        } else {
          newOrder.push(id);
        }
      }
      currentLayout.order = newOrder;
      // Remove audioMode from hidden if it was there (both new buttons should be visible)
      currentLayout.hidden = currentLayout.hidden.filter(id => id !== 'audioMode');
      // Save the migrated layout
      saveHeaderLayout();
    }

    rebuildPreview();
    updateSpacerButtons();
    updateVisibilityToggles();
  } catch (e) {
    console.error('[Options] Failed to load header layout:', e);
    showLayoutStatus('Failed to load header layout', true);
  }
}

async function saveHeaderLayout() {
  try {
    await browserAPI.storage.sync.set({ headerLayout: currentLayout });
    showLayoutStatus('Layout saved');
  } catch (e) {
    console.error('[Options] Failed to save header layout:', e);
    showLayoutStatus('Failed to save', true);
  }
}

// ==================== Rebuild Preview ====================

function isSpacer(id) {
  return id && id.startsWith('spacer');
}

function rebuildPreview() {
  if (!previewContainer || !currentLayout) return;

  previewContainer.innerHTML = '';

  // Build the visible order based on spacerCount
  const visibleOrder = currentLayout.order.filter(id => {
    if (isSpacer(id)) {
      const spacerNum = parseInt(id.replace('spacer', ''), 10);
      return spacerNum <= currentLayout.spacerCount;
    }
    return true;
  });

  visibleOrder.forEach((id, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'header-item-wrapper';
    wrapper.dataset.id = id;
    wrapper.dataset.index = index;

    // Left drop indicator
    const leftIndicator = document.createElement('div');
    leftIndicator.className = 'drop-indicator';
    wrapper.appendChild(leftIndicator);

    // Create the item element
    if (isSpacer(id)) {
      const spacer = document.createElement('div');
      spacer.className = 'header-spacer-item';
      spacer.draggable = true;
      spacer.dataset.id = id;
      spacer.innerHTML = `<span class="tooltip">Spacer (flex)</span>${SPACER_ICON}`;
      wrapper.appendChild(spacer);
    } else {
      const data = HEADER_ITEM_DATA[id];
      if (!data) return;

      const item = document.createElement('div');
      item.className = 'header-icon-item';
      if (data.type === 'logo') item.classList.add('logo');
      if (data.type === 'companyLogo') item.classList.add('companyLogo');
      if (currentLayout.hidden.includes(id)) item.classList.add('hidden-item');

      // Locked items (companyLogo) cannot be dragged
      const isLocked = typeof LOCKED_HEADER_ITEMS !== 'undefined' && LOCKED_HEADER_ITEMS.includes(id);
      item.draggable = !isLocked;
      if (isLocked) item.classList.add('locked-item');
      item.dataset.id = id;
      item.innerHTML = `<span class="tooltip">${data.name}${isLocked ? ' (locked)' : ''}</span>${data.icon}`;
      wrapper.appendChild(item);
    }

    // Right drop indicator (only on last item)
    if (index === visibleOrder.length - 1) {
      const rightIndicator = document.createElement('div');
      rightIndicator.className = 'drop-indicator right';
      wrapper.appendChild(rightIndicator);
    }

    previewContainer.appendChild(wrapper);
  });

  setupDragListeners();
}

// ==================== Drag and Drop ====================

function setupDragListeners() {
  const draggables = previewContainer.querySelectorAll('[draggable="true"]');
  const wrappers = previewContainer.querySelectorAll('.header-item-wrapper');

  draggables.forEach(item => {
    item.addEventListener('dragstart', (e) => {
      draggedId = item.dataset.id;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedId);
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      draggedId = null;
      clearIndicators();
    });
  });

  wrappers.forEach(wrapper => {
    wrapper.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedId || wrapper.dataset.id === draggedId) return;

      const rect = wrapper.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      let position = e.clientX < midpoint ? 'before' : 'after';

      // Cannot drop before or after locked items (companyLogo stays in place)
      const isLockedTarget = typeof LOCKED_HEADER_ITEMS !== 'undefined' && LOCKED_HEADER_ITEMS.includes(wrapper.dataset.id);
      if (isLockedTarget) {
        // Don't allow dropping before or after locked items
        clearIndicators();
        return;
      }

      clearIndicators();
      dropTargetId = wrapper.dataset.id;
      dropPosition = position;

      if (position === 'before') {
        wrapper.querySelector('.drop-indicator:not(.right)').classList.add('visible');
      } else {
        const rightIndicator = wrapper.querySelector('.drop-indicator.right');
        if (rightIndicator) {
          rightIndicator.classList.add('visible');
        } else {
          const nextWrapper = wrapper.nextElementSibling;
          if (nextWrapper) {
            nextWrapper.querySelector('.drop-indicator:not(.right)').classList.add('visible');
          }
        }
      }
    });

    wrapper.addEventListener('dragleave', (e) => {
      if (!wrapper.contains(e.relatedTarget)) {
        clearIndicators();
      }
    });

    wrapper.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!draggedId || !dropTargetId || draggedId === dropTargetId) {
        clearIndicators();
        return;
      }

      const fromIndex = currentLayout.order.indexOf(draggedId);
      const toIndex = currentLayout.order.indexOf(dropTargetId);

      if (fromIndex === -1 || toIndex === -1) {
        clearIndicators();
        return;
      }

      // Remove from old position
      currentLayout.order.splice(fromIndex, 1);

      // Calculate new index
      let newIndex = currentLayout.order.indexOf(dropTargetId);
      if (dropPosition === 'after') {
        newIndex++;
      }

      // Ensure locked items stay at position 0
      if (typeof LOCKED_HEADER_ITEMS !== 'undefined') {
        const lockedCount = LOCKED_HEADER_ITEMS.length;
        if (newIndex < lockedCount) {
          newIndex = lockedCount;
        }
      }

      // Insert at new position
      currentLayout.order.splice(newIndex, 0, draggedId);

      clearIndicators();
      saveHeaderLayout();
      rebuildPreview();
    });
  });
}

function clearIndicators() {
  previewContainer.querySelectorAll('.drop-indicator').forEach(el => {
    el.classList.remove('visible');
  });
  dropTargetId = null;
  dropPosition = null;
}

// ==================== Spacer Controls ====================

function setupSpacerControls() {
  const spacerButtons = document.querySelectorAll('.spacer-btn');

  spacerButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const count = parseInt(btn.dataset.count, 10);
      setSpacerCount(count);
    });
  });
}

function setSpacerCount(count) {
  currentLayout.spacerCount = Math.min(Math.max(0, count), MAX_SPACERS);

  // Add spacers to order if they don't exist
  for (let i = 1; i <= currentLayout.spacerCount; i++) {
    const spacerId = `spacer${i}`;
    if (!currentLayout.order.includes(spacerId)) {
      // Insert after the previous spacer or at the middle
      const prevSpacerIndex = currentLayout.order.findIndex(id =>
        isSpacer(id) && parseInt(id.replace('spacer', ''), 10) === i - 1
      );
      if (prevSpacerIndex !== -1) {
        currentLayout.order.splice(prevSpacerIndex + 1, 0, spacerId);
      } else {
        const middleIndex = Math.floor(currentLayout.order.length / 2);
        currentLayout.order.splice(middleIndex, 0, spacerId);
      }
    }
  }

  saveHeaderLayout();
  rebuildPreview();
  updateSpacerButtons();
}

function updateSpacerButtons() {
  const spacerButtons = document.querySelectorAll('.spacer-btn');

  spacerButtons.forEach(btn => {
    const count = parseInt(btn.dataset.count, 10);
    btn.classList.toggle('active', count === currentLayout.spacerCount);
  });
}

// ==================== Visibility Toggles ====================

function setupVisibilityToggles() {
  const toggles = document.querySelectorAll('.visibility-toggle input[type="checkbox"]');

  toggles.forEach(toggle => {
    toggle.addEventListener('change', () => {
      const itemId = toggle.dataset.itemId;
      toggleItemVisibility(itemId, toggle.checked);
    });
  });
}

function toggleItemVisibility(itemId, visible) {
  if (visible) {
    currentLayout.hidden = currentLayout.hidden.filter(id => id !== itemId);
  } else {
    if (!currentLayout.hidden.includes(itemId)) {
      currentLayout.hidden.push(itemId);
    }
  }

  saveHeaderLayout();
  rebuildPreview();
  updateVisibilityToggles();
}

function updateVisibilityToggles() {
  const toggles = document.querySelectorAll('.visibility-toggle');

  toggles.forEach(toggle => {
    const checkbox = toggle.querySelector('input[type="checkbox"]');
    if (!checkbox) return;

    const itemId = checkbox.dataset.itemId;
    const isHidden = currentLayout.hidden.includes(itemId);

    checkbox.checked = !isHidden;
    toggle.classList.toggle('unchecked', isHidden);
  });
}

// ==================== Reset ====================

function setupResetButton() {
  const resetBtn = document.getElementById('resetHeaderLayoutBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetToDefault);
  }
}

function resetToDefault() {
  currentLayout = JSON.parse(JSON.stringify(DEFAULT_HEADER_LAYOUT));

  saveHeaderLayout();
  rebuildPreview();
  updateSpacerButtons();
  updateVisibilityToggles();
  showLayoutStatus('Reset to default');
}

// ==================== Status Messages ====================

function showLayoutStatus(message, isError = false) {
  if (!statusElement) return;

  statusElement.textContent = message;
  statusElement.className = 'status ' + (isError ? 'error' : 'success');

  setTimeout(() => {
    statusElement.className = 'status';
  }, 3000);
}

// ==================== Initialize on DOM Ready ====================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHeaderLayoutEditor);
} else {
  initHeaderLayoutEditor();
}
