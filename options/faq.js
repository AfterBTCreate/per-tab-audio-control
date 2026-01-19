// Per-Tab Audio Control - FAQ Script
// Cross-browser compatible (Chrome & Firefox)
// Note: browserAPI loaded from ../shared/browser-api.js

// ==================== Theme Toggle ====================

const themeToggle = document.getElementById('themeToggle');

// Load saved theme (synced across devices)
async function loadTheme() {
  const result = await browserAPI.storage.sync.get(['theme']);
  // Default to dark mode for new users (only add light-mode if explicitly set)
  if (result.theme === 'light') {
    document.body.classList.add('light-mode');
  }
}

// Toggle theme
async function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  await browserAPI.storage.sync.set({ theme: isLight ? 'light' : 'dark' });
}

// Load theme immediately
loadTheme();

// Theme toggle handler
themeToggle.addEventListener('click', toggleTheme);

// ==================== FAQ Subsection Toggle ====================

// Update expand all button state
function updateExpandAllButton() {
  const expandAllToggle = document.getElementById('expandAllToggle');
  const expandedSubsections = document.querySelectorAll('.faq-subsection.expanded');
  const anyExpanded = expandedSubsections.length > 0;

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
  const allSubsections = document.querySelectorAll('.faq-subsection');
  const expandedSubsections = document.querySelectorAll('.faq-subsection.expanded');
  const anyExpanded = expandedSubsections.length > 0;

  allSubsections.forEach(subsection => {
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

  updateExpandAllButton();
}

// FAQ subsection toggle handlers
document.querySelectorAll('.faq-subsection-header').forEach(header => {
  header.addEventListener('click', () => {
    const subsection = header.closest('.faq-subsection');
    if (subsection) {
      subsection.classList.toggle('expanded');
      const isExpanded = subsection.classList.contains('expanded');
      header.setAttribute('aria-expanded', isExpanded);
      updateExpandAllButton();
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

// Initialize expand all button state
updateExpandAllButton();
