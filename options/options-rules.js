// Per-Tab Audio Control - Options Rules
// Site volume rules, storage quota, disabled domains, native mode refresh

// ==================== Site Volume Rules ====================

const rulesListContent = document.getElementById('rulesListContent');
const clearAllRulesBtn = document.getElementById('clearAllRulesBtn');
const quotaValueEl = document.getElementById('quotaValue');
const quotaFillEl = document.getElementById('quotaFill');
const cleanupOldRulesBtn = document.getElementById('cleanupOldRulesBtn');

// Update storage quota display
async function updateQuotaDisplay() {
  try {
    const bytesInUse = await browserAPI.storage.sync.getBytesInUse(null);
    const percentUsed = bytesInUse / SYNC_QUOTA_BYTES;
    const percentDisplay = Math.round(percentUsed * 100);
    const kbUsed = (bytesInUse / 1024).toFixed(1);
    const kbTotal = (SYNC_QUOTA_BYTES / 1024).toFixed(0);

    if (quotaValueEl) {
      quotaValueEl.textContent = `${percentDisplay}% (${kbUsed}KB / ${kbTotal}KB)`;
      quotaValueEl.className = 'quota-value';
      if (percentUsed >= QUOTA_CRITICAL_THRESHOLD) {
        quotaValueEl.classList.add('critical');
      } else if (percentUsed >= QUOTA_WARNING_THRESHOLD) {
        quotaValueEl.classList.add('warning');
      }
    }

    if (quotaFillEl) {
      quotaFillEl.style.width = `${Math.min(percentDisplay, 100)}%`;
      quotaFillEl.className = 'quota-fill';
      if (percentUsed >= QUOTA_CRITICAL_THRESHOLD) {
        quotaFillEl.classList.add('critical');
      } else if (percentUsed >= QUOTA_WARNING_THRESHOLD) {
        quotaFillEl.classList.add('warning');
      }
    }
  } catch (e) {
    if (quotaValueEl) {
      quotaValueEl.textContent = 'Unable to check';
    }
  }
}

// Clean up rules unused for 90+ days
async function cleanupOldRules() {
  const result = await browserAPI.storage.sync.get(['siteVolumeRules']);
  const rules = result.siteVolumeRules || [];

  const now = Date.now();
  const cutoffTime = now - (CLEANUP_DAYS * 24 * 60 * 60 * 1000); // 90 days in ms

  // Find old rules (rules without lastUsed are treated as current to give them grace period)
  const oldRules = rules.filter(r => r.lastUsed && r.lastUsed < cutoffTime);

  if (oldRules.length === 0) {
    alert('No rules older than 90 days found.');
    return;
  }

  // Confirm deletion
  const confirmMsg = `Remove ${oldRules.length} rule${oldRules.length > 1 ? 's' : ''} unused for 90+ days?`;
  if (!confirm(confirmMsg)) {
    return;
  }

  // Filter out old rules
  const newRules = rules.filter(r => !r.lastUsed || r.lastUsed >= cutoffTime);
  await browserAPI.storage.sync.set({ siteVolumeRules: newRules });

  alert(`Removed ${oldRules.length} old rule${oldRules.length > 1 ? 's' : ''}.`);

  // Refresh displays
  await loadRules();
  await updateQuotaDisplay();
}

// Cleanup button handler
if (cleanupOldRulesBtn) {
  cleanupOldRulesBtn.addEventListener('click', cleanupOldRules);
}

// Load and display rules
async function loadRules() {
  const result = await browserAPI.storage.sync.get(['siteVolumeRules']);
  const rules = result.siteVolumeRules || [];

  // Clear existing content safely
  while (rulesListContent.firstChild) {
    rulesListContent.removeChild(rulesListContent.firstChild);
  }

  // Show/hide clear all button based on rule count
  if (clearAllRulesBtn) {
    clearAllRulesBtn.style.display = rules.length >= 2 ? 'block' : 'none';
  }

  if (rules.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'rules-empty-placeholder';
    placeholder.textContent = 'No site rules configured. Use the extension popup to create rules.';
    rulesListContent.appendChild(placeholder);
    return;
  }

  rules.forEach((rule, index) => {
    const item = document.createElement('div');
    item.className = 'rule-item';

    // Build details string
    const details = [];
    details.push(rule.isDomain ? 'Entire domain' : 'Exact URL');
    details.push(rule.deviceLabel || 'Default device');

    // Add bass/treble/voice boost if present
    const bassLevel = formatEffectLevel(rule.bassBoost);
    const trebleLevel = formatEffectLevel(rule.trebleBoost);
    const voiceLevel = formatEffectLevel(rule.voiceBoost);
    if (bassLevel) details.push(`Bass: ${bassLevel}`);
    if (trebleLevel) details.push(`Treble: ${trebleLevel}`);
    if (voiceLevel) details.push(`Voice: ${voiceLevel}`);

    // Add compressor if present
    if (rule.compressor && rule.compressor !== 'off') {
      const compressorLabel = rule.compressor.charAt(0).toUpperCase() + rule.compressor.slice(1);
      details.push(`Compress: ${compressorLabel}`);
    }

    // Add balance if present
    if (rule.balance !== undefined && rule.balance !== 0) {
      const balanceLabel = rule.balance < 0 ? `L${Math.abs(rule.balance)}` : `R${rule.balance}`;
      details.push(`Balance: ${balanceLabel}`);
    }

    // Add channel mode if present
    if (rule.channelMode && rule.channelMode !== 'stereo') {
      const channelLabel = rule.channelMode === 'mono' ? 'Mono' : 'Swapped';
      details.push(`Channels: ${channelLabel}`);
    }

    // Build DOM safely to prevent XSS from malicious rule patterns
    const ruleInfo = document.createElement('div');
    ruleInfo.className = 'rule-info';

    const patternDiv = document.createElement('div');
    patternDiv.className = 'rule-pattern';
    patternDiv.textContent = rule.pattern; // Safe: textContent escapes HTML

    const typeDiv = document.createElement('div');
    typeDiv.className = 'rule-type';
    typeDiv.textContent = details.join(' • ');

    const lastUsedDiv = document.createElement('div');
    lastUsedDiv.className = 'rule-last-used';
    lastUsedDiv.textContent = `Last used: ${formatLastUsed(rule.lastUsed)}`;

    ruleInfo.appendChild(patternDiv);
    ruleInfo.appendChild(typeDiv);
    ruleInfo.appendChild(lastUsedDiv);

    const volumeDiv = document.createElement('div');
    volumeDiv.className = `rule-volume ${getVolumeClass(rule.volume)}`;
    volumeDiv.textContent = `${rule.volume}%`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'rule-delete';
    deleteBtn.dataset.index = index;
    deleteBtn.textContent = 'Delete';

    item.appendChild(ruleInfo);
    item.appendChild(volumeDiv);
    item.appendChild(deleteBtn);

    rulesListContent.appendChild(item);
  });

  // Add delete handlers
  rulesListContent.querySelectorAll('.rule-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.dataset.index);
      await deleteRule(index);
    });
  });
}

// Delete a rule
async function deleteRule(index) {
  const result = await browserAPI.storage.sync.get(['siteVolumeRules']);
  const rules = result.siteVolumeRules || [];

  rules.splice(index, 1);
  await browserAPI.storage.sync.set({ siteVolumeRules: rules });

  loadRules();
}

// Clear all rules
async function clearAllRules() {
  if (!confirm('Are you sure you want to delete all site rules? This cannot be undone.')) {
    return;
  }

  await browserAPI.storage.sync.set({ siteVolumeRules: [] });
  loadRules();
}

// Clear all rules button handler
if (clearAllRulesBtn) {
  clearAllRulesBtn.addEventListener('click', clearAllRules);
}

// ==================== Off Mode Refresh Behavior ====================

const nativeModeRefreshRadios = document.querySelectorAll('input[name="nativeModeRefresh"]');
const nativeModeRefreshStatus = document.getElementById('nativeModeRefreshStatus');

// Load native mode refresh behavior setting
async function loadNativeModeRefreshBehavior() {
  const result = await browserAPI.storage.sync.get(['nativeModeRefresh']);
  const behavior = result.nativeModeRefresh || 'current'; // Default to 'current'

  const radio = document.querySelector(`input[name="nativeModeRefresh"][value="${behavior}"]`);
  if (radio) {
    radio.checked = true;
  }
}

// Save native mode refresh behavior setting
async function saveNativeModeRefreshBehavior(behavior) {
  await browserAPI.storage.sync.set({ nativeModeRefresh: behavior });
  showStatus(nativeModeRefreshStatus, 'Refresh behavior saved!', 'success');
}

// Add listeners to radio buttons
nativeModeRefreshRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (e.target.checked) {
      saveNativeModeRefreshBehavior(e.target.value);
    }
  });
});

// Load native mode refresh behavior on init
loadNativeModeRefreshBehavior();
