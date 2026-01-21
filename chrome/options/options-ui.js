// Per-Tab Audio Control - Options UI
// Browser-specific UI, collapsible sections, initialization

// ==================== Browser-specific UI ====================

// Show Firefox-only elements and hide Chrome-only elements in Firefox
if (isFirefox) {
  // Show all firefox-only elements
  document.querySelectorAll('.firefox-only').forEach(el => el.style.display = 'block');
  // Hide all chrome-only elements
  document.querySelectorAll('.chrome-only').forEach(el => el.style.display = 'none');
  // Hide chrome-only sections (like Auto Mode Sites which only makes sense with Tab Capture)
  document.querySelectorAll('.chrome-only-section').forEach(el => el.style.display = 'none');
}

// Audio mode is now automatic based on device selection (no longer a global setting)
// When a custom device is selected in the popup, that tab uses device mode (100% max)
// When default device is used, the tab uses boost mode (500% max)
async function loadAudioMode() {
  // No-op - audio mode is now per-tab and automatic
}

// ==================== Collapsible Sections ====================

// Load expanded state from storage (synced across devices, sections start collapsed by default via CSS)
async function loadCollapsedSections() {
  // Check if opened from popup - if so, start with all sections collapsed
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('from') === 'popup') {
    // Remove the query param so refreshes don't re-collapse
    history.replaceState({}, '', window.location.pathname);
    // Don't load saved state - keep all sections collapsed (default CSS state)
    updateExpandAllButton();
    return;
  }

  const result = await browserAPI.storage.sync.get(['expandedSections']);
  const expanded = result.expandedSections || [];

  expanded.forEach(sectionId => {
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    if (section) {
      section.classList.add('expanded');
    }
  });

  // Update the expand all button state after loading saved sections
  updateExpandAllButton();
}

// Save expanded state to storage
async function saveCollapsedSections() {
  const expanded = [];
  document.querySelectorAll('.section.collapsible.expanded').forEach(section => {
    const sectionId = section.dataset.section;
    if (sectionId) {
      expanded.push(sectionId);
    }
  });
  await browserAPI.storage.sync.set({ expandedSections: expanded });
}

// Toggle section collapse
function toggleSection(section) {
  section.classList.toggle('expanded');
  saveCollapsedSections();
  updateExpandAllButton();

  // If FAQ section is being collapsed, also collapse all FAQ subsections
  if (section.dataset.section === 'faq' && !section.classList.contains('expanded')) {
    section.querySelectorAll('.faq-subsection.expanded').forEach(subsection => {
      subsection.classList.remove('expanded');
      const header = subsection.querySelector('.faq-subsection-header');
      if (header) {
        header.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

// Update expand all button state (shows collapse if ANY section is open)
function updateExpandAllButton() {
  const expandAllToggle = document.getElementById('expandAllToggle');
  const expandedSections = document.querySelectorAll('.section.collapsible.expanded');
  const anyExpanded = expandedSections.length > 0;

  if (anyExpanded) {
    expandAllToggle.classList.add('all-expanded');
    expandAllToggle.title = 'Collapse all sections';
  } else {
    expandAllToggle.classList.remove('all-expanded');
    expandAllToggle.title = 'Expand all sections';
  }
}

// Toggle all sections
function toggleAllSections() {
  const allSections = document.querySelectorAll('.section.collapsible');
  const expandedSections = document.querySelectorAll('.section.collapsible.expanded');
  const anyExpanded = expandedSections.length > 0;

  allSections.forEach(section => {
    if (anyExpanded) {
      // Collapse all
      section.classList.remove('expanded');
    } else {
      // Expand all
      section.classList.add('expanded');
    }
  });

  saveCollapsedSections();
  updateExpandAllButton();
}

// Add click handlers to all collapsible section headers
document.querySelectorAll('.section.collapsible .section-header').forEach(header => {
  header.addEventListener('click', () => {
    const section = header.closest('.section.collapsible');
    if (section) {
      toggleSection(section);
    }
  });
});

// FAQ subsection toggle handlers
document.querySelectorAll('.faq-subsection-header').forEach(header => {
  header.addEventListener('click', () => {
    const subsection = header.closest('.faq-subsection');
    if (subsection) {
      subsection.classList.toggle('expanded');
      const isExpanded = subsection.classList.contains('expanded');
      header.setAttribute('aria-expanded', isExpanded);
      updateFaqExpandAllButton();
    }
  });

  // Keyboard support
  header.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      header.click();
    }
  });
});

// Expand all toggle handler
document.getElementById('expandAllToggle').addEventListener('click', toggleAllSections);

// FAQ Expand All toggle handler
const faqExpandAllBtn = document.getElementById('faqExpandAll');

// Update FAQ expand all button text based on current state
function updateFaqExpandAllButton() {
  if (!faqExpandAllBtn) return;
  const expandedSubsections = document.querySelectorAll('.faq-subsection.expanded');
  const anyExpanded = expandedSubsections.length > 0;

  faqExpandAllBtn.textContent = anyExpanded ? 'Collapse All' : 'Expand All';
  faqExpandAllBtn.setAttribute('aria-label', anyExpanded ? 'Collapse all FAQ topics' : 'Expand all FAQ topics');
}

if (faqExpandAllBtn) {
  faqExpandAllBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent triggering the section collapse

    const faqSubsections = document.querySelectorAll('.faq-subsection');
    const expandedSubsections = document.querySelectorAll('.faq-subsection.expanded');
    const anyExpanded = expandedSubsections.length > 0;

    faqSubsections.forEach(subsection => {
      const header = subsection.querySelector('.faq-subsection-header');
      if (anyExpanded) {
        // Collapse all
        subsection.classList.remove('expanded');
        if (header) header.setAttribute('aria-expanded', 'false');
      } else {
        // Expand all
        subsection.classList.add('expanded');
        if (header) header.setAttribute('aria-expanded', 'true');
      }
    });

    // Update button text
    updateFaqExpandAllButton();
  });
}

// Load collapsed state on init (also updates expand all button state)
loadCollapsedSections();

// ==================== Initialize ====================

loadPresets();
loadBassPresets();
loadBassCutPresets();
loadTreblePresets();
loadTrebleCutPresets();
loadVoicePresets();
loadVolumeSteps();
loadRules();
updateQuotaDisplay();
loadAudioMode();

// ==================== Unified Site Overrides ====================
// Shows all site mode overrides in one list: Tab Capture, Web Audio, Disabled

// Add Firefox class to body for CSS
if (isFirefox) {
  document.body.classList.add('is-firefox');
}

// Create a trash icon for delete buttons
function createTrashIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', '3 6 5 6 21 6');
  svg.appendChild(polyline);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2');
  svg.appendChild(path);

  return svg;
}

// Mode display config
const modeConfig = {
  tabcapture: { label: 'Tab Capture', className: 'mode-tabcapture' },
  webaudio: { label: 'Web Audio', className: 'mode-webaudio' },
  off: { label: 'Disabled', className: 'mode-off' }
};

// Current default mode (cached for removeSiteOverride)
let currentDefaultMode = 'tabcapture';

// Get storage key for an override mode based on current default mode
function getOverrideStorageKey(defaultMode, overrideMode) {
  if (overrideMode === 'off') {
    return 'disabledDomains'; // Shared across Tab Capture and Web Audio defaults
  }

  if (defaultMode === 'tabcapture') {
    if (overrideMode === 'webaudio') return 'tabCaptureDefault_webAudioSites';
  } else if (defaultMode === 'auto') {
    if (overrideMode === 'tabcapture') return 'webAudioDefault_tabCaptureSites';
  } else if (defaultMode === 'native') {
    if (overrideMode === 'tabcapture') return 'offDefault_tabCaptureSites';
    if (overrideMode === 'webaudio') return 'offDefault_webAudioSites';
  }

  return null;
}

// Load site overrides based on current default mode
async function loadSiteOverrides() {
  try {
    const result = await browserAPI.storage.sync.get([
      'defaultAudioMode',
      'disabledDomains',
      'tabCaptureDefault_webAudioSites',
      'webAudioDefault_tabCaptureSites',
      'offDefault_tabCaptureSites',
      'offDefault_webAudioSites'
    ]);

    const defaultMode = result.defaultAudioMode || 'tabcapture';
    const overrides = [];

    if (defaultMode === 'tabcapture') {
      // Tab Capture is default - show Web Audio and Off overrides
      const webAudioSites = result.tabCaptureDefault_webAudioSites || [];
      const offSites = result.disabledDomains || [];

      webAudioSites.forEach(domain => {
        overrides.push({ domain, mode: 'webaudio' });
      });
      offSites.forEach(domain => {
        overrides.push({ domain, mode: 'off' });
      });

    } else if (defaultMode === 'auto') {
      // Web Audio is default - show Tab Capture and Off overrides
      const tabCaptureSites = result.webAudioDefault_tabCaptureSites || [];
      const offSites = result.disabledDomains || [];

      if (!isFirefox) {
        tabCaptureSites.forEach(domain => {
          overrides.push({ domain, mode: 'tabcapture' });
        });
      }
      offSites.forEach(domain => {
        overrides.push({ domain, mode: 'off' });
      });

    } else {
      // Off is default - show Tab Capture and Web Audio overrides
      const tabCaptureSites = result.offDefault_tabCaptureSites || [];
      const webAudioSites = result.offDefault_webAudioSites || [];

      if (!isFirefox) {
        tabCaptureSites.forEach(domain => {
          overrides.push({ domain, mode: 'tabcapture' });
        });
      }
      webAudioSites.forEach(domain => {
        overrides.push({ domain, mode: 'webaudio' });
      });
    }

    // Cache default mode for removeSiteOverride
    currentDefaultMode = defaultMode;
    renderSiteOverrides(overrides);
  } catch (e) {
    console.error('Failed to load site overrides:', e);
  }
}

// Create a site override item element
function createSiteOverrideItem(domain, mode) {
  const config = modeConfig[mode];

  const item = document.createElement('div');
  item.className = 'rule-item';
  item.dataset.domain = domain;
  item.dataset.mode = mode;

  const ruleInfo = document.createElement('div');
  ruleInfo.className = 'rule-info';

  const patternDiv = document.createElement('div');
  patternDiv.className = 'rule-pattern';
  patternDiv.textContent = domain;

  const modeLabel = document.createElement('span');
  modeLabel.className = `mode-label ${config.className}`;
  modeLabel.textContent = config.label;

  ruleInfo.appendChild(patternDiv);
  ruleInfo.appendChild(modeLabel);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'rule-delete';
  deleteBtn.setAttribute('aria-label', `Remove ${domain} override`);
  deleteBtn.title = `Remove ${domain} override`;
  deleteBtn.appendChild(createTrashIcon());

  deleteBtn.addEventListener('click', async () => {
    await removeSiteOverride(domain, mode);
  });

  item.appendChild(ruleInfo);
  item.appendChild(deleteBtn);

  return item;
}

// Render the unified site overrides list
function renderSiteOverrides(overrides) {
  const content = document.getElementById('siteOverridesContent');
  const clearAllBtn = document.getElementById('clearAllOverridesBtn');

  if (!content) return;

  // Clear existing content
  content.textContent = '';

  if (overrides.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'no-rules';
    emptyDiv.textContent = 'No site overrides. All sites use your default mode.';
    content.appendChild(emptyDiv);
    if (clearAllBtn) clearAllBtn.style.display = 'none';
    return;
  }

  // Show clear all button only when 2+ sites
  if (clearAllBtn) clearAllBtn.style.display = overrides.length >= 2 ? 'block' : 'none';

  // Sort alphabetically by domain
  overrides.sort((a, b) => a.domain.localeCompare(b.domain));

  // Create and append each item
  overrides.forEach(({ domain, mode }) => {
    content.appendChild(createSiteOverrideItem(domain, mode));
  });
}

// Remove a site override based on its mode (uses currentDefaultMode)
async function removeSiteOverride(domain, mode) {
  try {
    const storageKey = getOverrideStorageKey(currentDefaultMode, mode);
    if (!storageKey) {
      showSiteOverridesStatus('Invalid override type', 'error');
      return;
    }

    const result = await browserAPI.storage.sync.get([storageKey]);
    let domains = result[storageKey] || [];
    domains = domains.filter(d => d !== domain);
    await browserAPI.storage.sync.set({ [storageKey]: domains });

    // Reload the list
    await loadSiteOverrides();
    showSiteOverridesStatus(`Removed ${domain}`, 'success');
  } catch (e) {
    showSiteOverridesStatus('Failed to remove site', 'error');
  }
}

// Clear all site overrides for the current default mode
async function clearAllSiteOverrides() {
  if (!confirm('Remove all site overrides? All sites will use your default mode.')) return;

  try {
    // Clear only the lists relevant to the current default mode
    if (currentDefaultMode === 'tabcapture') {
      await browserAPI.storage.sync.set({
        tabCaptureDefault_webAudioSites: [],
        disabledDomains: []
      });
    } else if (currentDefaultMode === 'auto') {
      await browserAPI.storage.sync.set({
        webAudioDefault_tabCaptureSites: [],
        disabledDomains: []
      });
    } else {
      await browserAPI.storage.sync.set({
        offDefault_tabCaptureSites: [],
        offDefault_webAudioSites: []
      });
    }

    await loadSiteOverrides();
    showSiteOverridesStatus('All overrides removed', 'success');
  } catch (e) {
    showSiteOverridesStatus('Failed to clear overrides', 'error');
  }
}

// Show status message for site overrides
function showSiteOverridesStatus(message, type) {
  const status = document.getElementById('siteOverridesStatus');
  if (!status) return;

  status.textContent = message;
  status.className = 'status ' + type;

  setTimeout(() => {
    status.textContent = '';
    status.className = 'status';
  }, 3000);
}

// Event listener for clear all button
const clearAllOverridesBtn = document.getElementById('clearAllOverridesBtn');
if (clearAllOverridesBtn) {
  clearAllOverridesBtn.addEventListener('click', clearAllSiteOverrides);
}

// Load site overrides on init
loadSiteOverrides();
