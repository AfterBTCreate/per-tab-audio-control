// Per-Tab Audio Control - Tab List Overlay Module
// Dropdown overlay showing all tabs currently playing audio

const tabListBtn = document.getElementById('tabListBtn');
const tabListOverlay = document.getElementById('tabListOverlay');
const tabListItems = document.getElementById('tabListItems');

// Create a default speaker SVG icon (used when a tab has no favicon)
function createDefaultFaviconIcon() {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const path1 = document.createElementNS(svgNS, 'path');
  path1.setAttribute('d', 'M11 5L6 9H2V15H6L11 19V5Z');
  svg.appendChild(path1);

  const path2 = document.createElementNS(svgNS, 'path');
  path2.setAttribute('d', 'M15.54 8.46a5 5 0 010 7.07');
  svg.appendChild(path2);

  return svg;
}

// Create a speaker icon for the active/current tab
function createActiveSpeakerIcon() {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const path1 = document.createElementNS(svgNS, 'path');
  path1.setAttribute('d', 'M11 5L6 9H2V15H6L11 19V5Z');
  svg.appendChild(path1);

  const path2 = document.createElementNS(svgNS, 'path');
  path2.setAttribute('d', 'M15.54 8.46a5 5 0 010 7.07');
  svg.appendChild(path2);

  const path3 = document.createElementNS(svgNS, 'path');
  path3.setAttribute('d', 'M19.07 4.93a10 10 0 010 14.14');
  svg.appendChild(path3);

  return svg;
}

// Create a favicon placeholder with default speaker icon
function createFaviconPlaceholder() {
  const placeholder = document.createElement('span');
  placeholder.style.display = 'flex';
  placeholder.style.alignItems = 'center';
  placeholder.style.flexShrink = '0';
  placeholder.style.color = '#7a8fa5';
  placeholder.appendChild(createDefaultFaviconIcon());
  return placeholder;
}

// Show the tab list overlay
function showTabList() {
  // Clear previous items
  while (tabListItems.firstChild) {
    tabListItems.removeChild(tabListItems.firstChild);
  }

  // Populate with current audible tabs
  audibleTabs.forEach((tab, i) => {
    const item = document.createElement('div');
    item.className = 'tab-list-item' + (i === currentTabIndex ? ' active' : '');
    item.dataset.index = i;
    item.setAttribute('role', 'option');
    item.setAttribute('tabindex', '0');
    if (i === currentTabIndex) {
      item.setAttribute('aria-selected', 'true');
    }

    // Favicon
    if (tab.favIconUrl) {
      const img = document.createElement('img');
      img.src = tab.favIconUrl;
      img.alt = '';
      img.onerror = function () {
        // Replace broken favicon with default speaker icon
        this.replaceWith(createFaviconPlaceholder());
      };
      item.appendChild(img);
    } else {
      item.appendChild(createFaviconPlaceholder());
    }

    // Title
    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || 'Unknown Tab';
    item.appendChild(title);

    // Accessible name: indicate current tab via aria-label
    const label = (i === currentTabIndex ? 'Current tab: ' : 'Switch to: ') + (tab.title || 'Unknown Tab');
    item.setAttribute('aria-label', label);

    // Speaker icon for active tab
    if (i === currentTabIndex) {
      const speaker = document.createElement('span');
      speaker.className = 'tab-speaker-icon';
      speaker.appendChild(createActiveSpeakerIcon());
      item.appendChild(speaker);
    }

    const activate = () => {
      hideTabList();
      if (i !== currentTabIndex) {
        switchToTab(i);
      }
    };

    item.addEventListener('click', activate);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        activate();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = item.nextElementSibling;
        if (next && next.classList.contains('tab-list-item')) next.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = item.previousElementSibling;
        if (prev && prev.classList.contains('tab-list-item')) prev.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        const first = tabListItems.firstElementChild;
        if (first) first.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        const last = tabListItems.lastElementChild;
        if (last) last.focus();
      }
    });

    tabListItems.appendChild(item);
  });

  tabListOverlay.classList.add('visible');

  // Focus first item (or the currently-active one, if present)
  const activeItem = tabListItems.querySelector('.tab-list-item.active');
  const firstItem = activeItem || tabListItems.firstElementChild;
  openDialog(tabListOverlay, {
    initialFocus: firstItem,
    returnFocusTo: tabListBtn
  });
}

// Hide the tab list overlay
function hideTabList() {
  tabListOverlay.classList.remove('visible');
  closeDialog(tabListOverlay);
}

// Tab list button click handler
if (tabListBtn) {
  tabListBtn.addEventListener('click', showTabList);
}

// Backdrop click to dismiss
if (tabListOverlay) {
  tabListOverlay.addEventListener('click', (e) => {
    if (e.target === tabListOverlay) {
      hideTabList();
    }
  });
}

// Escape key to dismiss
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && tabListOverlay && tabListOverlay.classList.contains('visible')) {
    hideTabList();
  }
});
