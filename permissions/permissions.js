// Permissions page - requests microphone access to enable audio device enumeration
// Cross-browser compatible (Chrome & Firefox)
// Note: browserAPI, isFirefox loaded from ../shared/browser-api.js

const grantBtn = document.getElementById('grantBtn');
const skipBtn = document.getElementById('skipBtn');
const skipNote = document.getElementById('skipNote');
const status = document.getElementById('status');
const deviceList = document.getElementById('deviceList');
const devicesContainer = document.getElementById('devices');
const closeHint = document.getElementById('closeHint');
const autoCloseHint = document.getElementById('autoCloseHint');
const countdownSpan = document.getElementById('countdown');
const blockedSection = document.getElementById('blockedSection');

// Start auto-close countdown
function startAutoClose(seconds) {
  let countdown = seconds;
  autoCloseHint.style.display = 'block';
  countdownSpan.textContent = countdown;

  const countdownInterval = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      countdownSpan.textContent = countdown;
    } else {
      clearInterval(countdownInterval);
      window.close();
    }
  }, 1000);
}

async function requestPermission() {
  grantBtn.disabled = true;
  grantBtn.textContent = 'Requesting...';

  try {
    // Request microphone permission
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Stop the stream immediately - we just needed the permission
    stream.getTracks().forEach(track => track.stop());

    // Now enumerate devices to show the user what's available
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

    // Show success
    status.className = 'status success';
    status.textContent = `✓ Permission granted! Found ${audioOutputs.length} audio output device(s).`;

    // Display devices (use replaceChildren for safe clearing)
    devicesContainer.replaceChildren();
    audioOutputs.forEach(device => {
      const div = document.createElement('div');
      div.className = 'device-item';
      div.textContent = device.label || `Unknown Device (${device.deviceId.slice(0, 8)}...)`;
      devicesContainer.appendChild(div);
    });
    deviceList.classList.add('show');

    // Show close hint
    closeHint.style.display = 'block';

    // Hide skip option since permission is now granted
    skipBtn.style.display = 'none';
    skipNote.style.display = 'none';

    // Update button
    grantBtn.textContent = 'Permission Granted';

    // Notify background script that permission was granted
    browserAPI.runtime.sendMessage({ type: 'PERMISSION_GRANTED' });

    // Start 30 second auto-close
    startAutoClose(30);

  } catch (e) {
    status.className = 'status error';
    if (e.name === 'NotAllowedError') {
      status.textContent = '✗ Permission denied. Please click "Allow" when prompted.';
      // Show unblock instructions
      blockedSection.style.display = 'block';
    } else {
      status.textContent = `✗ Error: ${e.message}`;
    }
    grantBtn.disabled = false;
    grantBtn.textContent = 'Try Again';
  }
}

grantBtn.addEventListener('click', requestPermission);

// Skip button - close tab without granting permission
skipBtn.addEventListener('click', () => {
  // Mark that user explicitly skipped permission
  browserAPI.storage.local.set({ permissionSkipped: true });
  window.close();
});

// Check if permission is already granted
async function checkExistingPermission() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

    // Check if we have real labels (indicates permission is granted)
    const hasLabels = audioOutputs.some(d => d.label && d.label.length > 0);

    if (hasLabels) {
      status.className = 'status success';
      status.textContent = '✓ Permission already granted!';

      devicesContainer.replaceChildren();
      audioOutputs.forEach(device => {
        const div = document.createElement('div');
        div.className = 'device-item';
        div.textContent = device.label;
        devicesContainer.appendChild(div);
      });
      deviceList.classList.add('show');
      closeHint.style.display = 'block';
      grantBtn.textContent = 'Refresh Devices';
      // Hide skip option since permission is already granted
      skipBtn.style.display = 'none';
      skipNote.style.display = 'none';

      // Start 30 second auto-close
      startAutoClose(30);
    }
  } catch (e) {
    // Permission not granted yet, that's fine
  }
}

checkExistingPermission();
