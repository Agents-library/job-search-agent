// content.js — runs on linkedin.com/jobs/* pages. Waits for the results list,
// then walks through job cards one at a time: clicks each card, waits for the
// detail pane to update, extracts structured fields, and reports them back to
// the background service worker.
//
// IMPORTANT: LinkedIn changes its markup/class names periodically (redesigns,
// A/B tests). The selectors below are best-effort as of when this was written —
// they are NOT guaranteed to match today. If capture stops finding jobs:
//   1. Open the LinkedIn jobs page, right-click a job card / job title / company
//      name / description block, choose "Inspect".
//   2. Find a stable attribute to key off (data-job-id, aria-label, a semantic
//      tag) rather than a generated class hash like "jobs-abc123xyz".
//   3. Add the new selector to the relevant array in SELECTORS below — the code
//      tries each candidate in order and uses the first one that matches, so old
//      selectors don't need to be removed.

const SELECTORS = {
  jobCard: [
    'div[data-job-id]',
    'li.jobs-search-results__list-item',
    '.job-card-container',
  ],
  cardLink: ['a.job-card-container__link', 'a.job-card-list__title', 'a'],
  paginationNext: [
    'button[aria-label="View next page"]',
    'button.jobs-search-pagination__button--next',
  ],
  resultsList: [
    '.jobs-search-results-list',
    '.scaffold-layout__list',
  ],
  detailPane: [
    '.jobs-search__job-details--container',
    '.job-details-jobs-unified-top-card__container',
    '.jobs-details',
  ],
  detailTitle: [
    '.job-details-jobs-unified-top-card__job-title',
    'h2.t-24',
  ],
  detailCompany: [
    '.job-details-jobs-unified-top-card__company-name',
    '.jobs-unified-top-card__company-name',
  ],
  detailLocation: [
    '.job-details-jobs-unified-top-card__primary-description-container',
    '.jobs-unified-top-card__bullet',
  ],
  detailDescription: [
    '#job-details',
    '.jobs-description__content .jobs-box__html-content',
    '.jobs-description-content__text',
  ],
  applicants: ['.jobs-unified-top-card__applicant-count', '.num-applicants__caption'],
};

let running = false;
let stopRequested = false;
const seenJobIds = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minSec, maxSec) {
  const ms = (minSec + Math.random() * (maxSec - minSec)) * 1000;
  return sleep(ms);
}

function queryFirst(root, selectorList) {
  for (const sel of selectorList) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function queryAllFirst(root, selectorList) {
  for (const sel of selectorList) {
    const els = root.querySelectorAll(sel);
    if (els.length) return Array.from(els);
  }
  return [];
}

function textOf(el) {
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
}

function waitFor(selectorList, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const existing = queryFirst(document, selectorList);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const found = queryFirst(document, selectorList);
      if (found) {
        observer.disconnect();
        resolve(found);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timed out waiting for: ${selectorList.join(', ')}`));
    }, timeoutMs);
  });
}

function report(type, payload) {
  chrome.runtime.sendMessage({ type, ...payload }).catch(() => {});
}

function extractCardMeta(card) {
  const link = queryFirst(card, SELECTORS.cardLink);
  const jobId = card.getAttribute('data-job-id') || (link && link.href.match(/(\d{6,})/) || [])[1];
  return { jobId, link };
}

async function extractDetail(jobId, cardTitle) {
  const pane = await waitFor(SELECTORS.detailPane, 10000);
  // Give LinkedIn's SPA a moment to finish swapping content in.
  await sleep(600);

  const title = textOf(queryFirst(pane, SELECTORS.detailTitle)) || cardTitle;
  const company = textOf(queryFirst(pane, SELECTORS.detailCompany));
  const location = textOf(queryFirst(pane, SELECTORS.detailLocation));
  const description = textOf(queryFirst(pane, SELECTORS.detailDescription));
  const applicants = textOf(queryFirst(pane, SELECTORS.applicants));

  return {
    jobId,
    title,
    company,
    location,
    description,
    applicants,
    url: `https://www.linkedin.com/jobs/view/${jobId}/`,
  };
}

async function scrollListForMore() {
  const list = queryFirst(document, SELECTORS.resultsList);
  if (list) {
    list.scrollTop = list.scrollHeight;
    return true;
  }
  const nextBtn = queryFirst(document, SELECTORS.paginationNext);
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.click();
    return true;
  }
  return false;
}

async function runScrape(settings) {
  running = true;
  stopRequested = false;
  let captured = 0;
  let staleAttempts = 0;

  try {
    await waitFor(SELECTORS.jobCard, 20000);
  } catch (e) {
    report('scrape-error', { message: 'Could not find the job results list — LinkedIn may have changed its layout, or the page is showing a checkpoint/login prompt.' });
    running = false;
    return;
  }

  while (!stopRequested && captured < settings.maxResults && staleAttempts < 4) {
    const cards = queryAllFirst(document, SELECTORS.jobCard);
    let newThisPass = 0;

    for (const card of cards) {
      if (stopRequested || captured >= settings.maxResults) break;

      const { jobId } = extractCardMeta(card);
      if (!jobId || seenJobIds.has(jobId)) continue;
      seenJobIds.add(jobId);
      newThisPass++;

      report('scrape-progress', { phase: `opening job ${jobId}…` });
      card.scrollIntoView({ block: 'center' });
      await randomDelay(0.4, 1.0);
      card.click();

      try {
        const cardTitle = textOf(queryFirst(card, SELECTORS.cardLink));
        const detail = await extractDetail(jobId, cardTitle);
        report('job-captured', { job: detail });
        captured++;
      } catch (e) {
        report('scrape-progress', { phase: `skipped job ${jobId} (detail pane didn't load in time)` });
      }

      await randomDelay(settings.minDelay, settings.maxDelay);
    }

    if (newThisPass === 0) {
      staleAttempts++;
      report('scrape-progress', { phase: `no new cards, scrolling for more (attempt ${staleAttempts}/4)…` });
      const scrolled = await scrollListForMore();
      if (!scrolled) break;
      await randomDelay(1.5, 3);
    } else {
      staleAttempts = 0;
    }
  }

  running = false;
  report('scrape-done', {
    reason: stopRequested
      ? 'stopped by user'
      : captured >= settings.maxResults
        ? 'reached max results'
        : 'no more results found',
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'begin' && !running) {
    runScrape(msg.settings);
  } else if (msg.type === 'stop') {
    stopRequested = true;
  }
});
