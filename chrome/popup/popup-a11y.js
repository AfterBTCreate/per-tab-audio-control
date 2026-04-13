// Per-Tab Audio Control - Accessibility Helpers
// Shared focus management for modal dialogs and overlays.
// WAI-ARIA Dialog Pattern: aria-modal, focus trap, focus restoration.

const _a11yFocusReturn = new Map();
const _a11yKeydownHandlers = new Map();

function _a11yGetFocusable(root) {
  return Array.from(root.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), ' +
    'select:not([disabled]), textarea:not([disabled]), ' +
    '[tabindex]:not([tabindex="-1"])'
  )).filter(el => !el.hasAttribute('hidden') && el.offsetParent !== null);
}

// Open a dialog: set aria-modal, save focus, move focus inside, trap Tab.
// opts.initialFocus — element to focus first (default: first focusable)
// opts.returnFocusTo — element to restore focus to on close (default: previously focused)
function openDialog(overlay, opts) {
  if (!overlay) return;
  opts = opts || {};

  const returnTarget = opts.returnFocusTo || document.activeElement;
  _a11yFocusReturn.set(overlay, returnTarget);

  overlay.setAttribute('aria-modal', 'true');

  // Defer focus to next tick so CSS transitions complete first
  setTimeout(() => {
    const focusables = _a11yGetFocusable(overlay);
    const initial = opts.initialFocus || focusables[0];
    if (initial && typeof initial.focus === 'function') {
      initial.focus();
    }
  }, 0);

  const onKeydown = (e) => {
    if (e.key !== 'Tab') return;
    const focusables = _a11yGetFocusable(overlay);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  overlay.addEventListener('keydown', onKeydown);
  _a11yKeydownHandlers.set(overlay, onKeydown);
}

// Close a dialog: remove focus trap, restore focus.
function closeDialog(overlay) {
  if (!overlay) return;
  const handler = _a11yKeydownHandlers.get(overlay);
  if (handler) {
    overlay.removeEventListener('keydown', handler);
    _a11yKeydownHandlers.delete(overlay);
  }
  const returnTo = _a11yFocusReturn.get(overlay);
  _a11yFocusReturn.delete(overlay);
  if (returnTo && typeof returnTo.focus === 'function' && document.body.contains(returnTo)) {
    setTimeout(() => returnTo.focus(), 0);
  }
}

// Make a non-button element (e.g. div with role="button") keyboard-activatable.
// Enter and Space trigger onActivate; Space is preventDefault'd to avoid scrolling.
function makeButtonLike(el, onActivate) {
  if (!el || typeof onActivate !== 'function') return;
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      onActivate(e);
    }
  });
}

// Expose as globals (no module system in this project)
window.openDialog = openDialog;
window.closeDialog = closeDialog;
window.makeButtonLike = makeButtonLike;
