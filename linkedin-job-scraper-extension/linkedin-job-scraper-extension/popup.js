// popup.js — reads/writes settings, starts/stops a scrape run, shows live status.

const els = {
  keywords: document.getElementById('keywords'),
  location: document.getElementById('location'),
  maxResults: document.getElementById('maxResults'),
  minDelay: document.getElementById('minDelay'),
  maxDelay: document.getElementById('maxDelay'),
  datePosted: document.getElementById('datePosted'),
  expLevel: document.getElementById('expLevel'),
  workplaceType: document.getElementById('workplaceType'),
  easyApply: document.getElementById('easyApply'),
  companyIds: document.getElementById('companyIds'),
  resetFilters: document.getElementById('resetFilters'),
  start: document.getElementById('start'),
  stop: document.getElementById('stop'),
  status: document.getElementById('status'),
};

const DEFAULTS = {
  keywords: '',
  location: '',
  maxResults: 25,
  minDelay: 3,
  maxDelay: 7,
  datePosted: '',
  expLevel: [],
  workplaceType: [],
  easyApply: false,
  companyIds: '',
};

function checkboxGroup(container) {
  return Array.from(container.querySelectorAll('input[type="checkbox"]'));
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  els.keywords.value = stored.keywords;
  els.location.value = stored.location;
  els.maxResults.value = stored.maxResults;
  els.minDelay.value = stored.minDelay;
  els.maxDelay.value = stored.maxDelay;
  els.datePosted.value = stored.datePosted;
  els.easyApply.checked = !!stored.easyApply;
  els.companyIds.value = stored.companyIds;

  for (const cb of checkboxGroup(els.expLevel)) {
    cb.checked = stored.expLevel.includes(cb.value);
  }
  for (const cb of checkboxGroup(els.workplaceType)) {
    cb.checked = stored.workplaceType.includes(cb.value);
  }
}

function currentSettings() {
  return {
    keywords: els.keywords.value.trim(),
    location: els.location.value.trim(),
    maxResults: Math.max(1, parseInt(els.maxResults.value, 10) || 25),
    minDelay: Math.max(1, parseFloat(els.minDelay.value) || 3),
    maxDelay: Math.max(1, parseFloat(els.maxDelay.value) || 7),
    datePosted: els.datePosted.value,
    expLevel: checkboxGroup(els.expLevel).filter((cb) => cb.checked).map((cb) => cb.value),
    workplaceType: checkboxGroup(els.workplaceType).filter((cb) => cb.checked).map((cb) => cb.value),
    easyApply: els.easyApply.checked,
    companyIds: els.companyIds.value.trim(),
  };
}

async function refreshStatus() {
  const { runState } = await chrome.storage.local.get('runState');
  if (!runState || runState.phase === 'idle') {
    els.status.textContent = 'Idle.';
    return;
  }
  if (runState.phase === 'error') {
    els.status.textContent = `Stopped: ${runState.message || 'error'}`;
    return;
  }
  els.status.textContent =
    `${runState.phase}\nCaptured: ${runState.captured || 0} / ${runState.maxResults || '?'}`;
}

els.start.addEventListener('click', async () => {
  const settings = currentSettings();
  if (!settings.keywords) {
    els.status.textContent = 'Enter at least a keyword.';
    return;
  }
  await chrome.storage.sync.set(settings);
  chrome.runtime.sendMessage({ type: 'start-scrape', settings });
  els.status.textContent = 'Starting…';
});

els.stop.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'stop-scrape' });
  els.status.textContent = 'Stopping…';
});

els.resetFilters.addEventListener('click', () => {
  els.datePosted.value = '';
  els.easyApply.checked = false;
  els.companyIds.value = '';
  for (const cb of checkboxGroup(els.expLevel)) cb.checked = false;
  for (const cb of checkboxGroup(els.workplaceType)) cb.checked = false;
});

loadSettings();
refreshStatus();
setInterval(refreshStatus, 1000);
