// background.js — MV3 service worker. Orchestrates a run: opens/points a tab at the
// LinkedIn jobs search, tells the content script to start, buffers captured records,
// and writes them out as a Markdown file when the run ends (or stops early).

let activeTabId = null;
let buffer = []; // captured job records for the current run
let runSettings = null;

function buildSearchUrl(settings) {
  const params = new URLSearchParams({
    keywords: settings.keywords,
  });
  if (settings.location) params.set('location', settings.location);

  // Date posted (f_TPR): r86400 = 24h, r604800 = week, r2592000 = month
  if (settings.datePosted) params.set('f_TPR', settings.datePosted);

  // Experience level (f_E): 1 Internship, 2 Entry, 3 Associate, 4 Mid-Senior, 5 Director, 6 Executive
  if (settings.expLevel && settings.expLevel.length) {
    params.set('f_E', settings.expLevel.join(','));
  }

  // Workplace type / Remote (f_WT): 1 On-site, 2 Remote, 3 Hybrid
  if (settings.workplaceType && settings.workplaceType.length) {
    params.set('f_WT', settings.workplaceType.join(','));
  }

  // Easy Apply only (f_AL)
  if (settings.easyApply) params.set('f_AL', 'true');

  // Company (f_C): LinkedIn's internal numeric company IDs, comma-separated.
  if (settings.companyIds) {
    const ids = settings.companyIds.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length) params.set('f_C', ids.join(','));
  }

  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

async function setRunState(patch) {
  const { runState } = await chrome.storage.local.get('runState');
  await chrome.storage.local.set({ runState: { ...(runState || {}), ...patch } });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'start-scrape') {
    startRun(msg.settings);
    sendResponse({ ok: true });
  } else if (msg.type === 'stop-scrape') {
    stopRun('stopped by user');
    sendResponse({ ok: true });
  } else if (msg.type === 'job-captured') {
    buffer.push(msg.job);
    setRunState({ captured: buffer.length });
    if (runSettings && buffer.length >= runSettings.maxResults) {
      finishRun('reached max results');
    }
  } else if (msg.type === 'scrape-progress') {
    setRunState({ phase: msg.phase });
  } else if (msg.type === 'scrape-done') {
    finishRun(msg.reason || 'content script finished');
  } else if (msg.type === 'scrape-error') {
    finishRun(`error: ${msg.message}`, true);
  }
  return true;
});

async function startRun(settings) {
  buffer = [];
  runSettings = settings;
  await chrome.storage.local.set({
    runState: { phase: 'opening LinkedIn…', captured: 0, maxResults: settings.maxResults },
  });

  const url = buildSearchUrl(settings);
  const tab = await chrome.tabs.create({ url, active: true });
  activeTabId = tab.id;

  // Wait for the tab to finish loading, then tell the content script to begin.
  const listener = (tabId, info) => {
    if (tabId === activeTabId && info.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(listener);
      setTimeout(() => {
        chrome.tabs.sendMessage(activeTabId, { type: 'begin', settings }).catch(() => {
          finishRun('could not reach content script — is the extension enabled on this page?', true);
        });
      }, 1500);
    }
  };
  chrome.tabs.onUpdated.addListener(listener);
}

function stopRun(reason) {
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, { type: 'stop' }).catch(() => {});
  }
  finishRun(reason);
}

let finishing = false;
async function finishRun(reason, isError = false) {
  if (finishing) return;
  finishing = true;

  await writeMarkdown(buffer, runSettings);
  await setRunState({
    phase: isError ? 'error' : 'idle',
    message: reason,
    captured: buffer.length,
  });

  activeTabId = null;
  buffer = [];
  runSettings = null;
  finishing = false;
}

function escapeMd(text) {
  return (text || '').replace(/\r/g, '').trim();
}

async function writeMarkdown(jobs, settings) {
  if (!jobs.length) return;

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const lines = [];
  lines.push(`# LinkedIn Job Search — ${settings ? settings.keywords : ''}${settings && settings.location ? ' — ' + settings.location : ''}`);
  lines.push('');
  lines.push(`Captured ${jobs.length} listing(s) on ${now.toString()}.`);
  lines.push('');

  for (const job of jobs) {
    lines.push(`## ${escapeMd(job.title) || 'Untitled role'}`);
    lines.push('');
    lines.push(`- **Company:** ${escapeMd(job.company) || 'n/a'}`);
    lines.push(`- **Location:** ${escapeMd(job.location) || 'n/a'}`);
    if (job.postedAt) lines.push(`- **Posted:** ${escapeMd(job.postedAt)}`);
    if (job.employmentType) lines.push(`- **Type:** ${escapeMd(job.employmentType)}`);
    if (job.applicants) lines.push(`- **Applicants:** ${escapeMd(job.applicants)}`);
    lines.push(`- **URL:** ${job.url || 'n/a'}`);
    lines.push(`- **Job ID:** ${job.jobId || 'n/a'}`);
    lines.push('');
    if (job.description) {
      lines.push('**Description:**');
      lines.push('');
      lines.push(escapeMd(job.description));
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }

  const content = lines.join('\n');
  const dataUrl = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(content);
  const filename = `linkedin-jobs/linkedin-jobs-${stamp}.md`;

  await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: false,
    conflictAction: 'uniquify',
  });
}
