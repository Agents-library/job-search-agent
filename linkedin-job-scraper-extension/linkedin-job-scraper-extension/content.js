// content.js — runs on linkedin.com/jobs/* pages. Clicks each card in the LEFT
// results list (staying on the search split view), then reads the RIGHT detail
// pane for that job.
//
// IMPORTANT: LinkedIn changes its markup/class names periodically (redesigns,
// A/B tests). The selectors below are best-effort as of when this was written —
// they are NOT guaranteed to match today. If capture stops finding jobs:
//   1. Open the LinkedIn jobs page, right-click a job card / job title / company
//      name, choose "Inspect".
//   2. Find a stable attribute to key off (data-job-id, aria-label, a semantic
//      tag) rather than a generated class hash like "jobs-abc123xyz".
//   3. Add the new selector to the relevant array in SELECTORS below — the code
//      tries each candidate in order and uses the first one that matches, so old
//      selectors don't need to be removed.

if (globalThis.__linkedinJobScraperInjected) {
  // Second inject (background fallback) must not add another listener.
} else {
globalThis.__linkedinJobScraperInjected = true;

const SELECTORS = {
  jobCard: [
    'li[data-occludable-job-id]',
    'div[data-job-id]',
    'li.jobs-search-results__list-item',
    '.job-card-container',
    '.scaffold-layout__list-item',
  ],
  cardTitle: [
    'a.job-card-container__link span[aria-hidden="true"]',
    'a.job-card-list__title--link span[aria-hidden="true"]',
    '.artdeco-entity-lockup__title span[aria-hidden="true"]',
    'a.job-card-container__link',
    'a.job-card-list__title--link',
    'a.job-card-list__title',
    '.artdeco-entity-lockup__title',
    '.job-card-list__title',
  ],
  cardCompany: [
    '.artdeco-entity-lockup__subtitle',
    '.job-card-container__primary-description',
    '.job-card-container__company-name',
  ],
  cardLocation: [
    '.job-card-container__metadata-wrapper',
    '.job-card-container__metadata-item',
    '.artdeco-entity-lockup__caption',
  ],
  detailPane: [
    '.jobs-search__job-details--container',
    '.jobs-search__job-details',
    '.scaffold-layout__detail',
    '.jobs-details__main-content',
    '.job-details-jobs-unified-top-card__container',
    '.jobs-details',
  ],
  detailTitle: [
    '.job-details-jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__job-title',
    '.scaffold-layout__detail h1',
    'h1.t-24',
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
    '.jobs-description__content',
    'article.jobs-description__container',
  ],
  seeMore: [
    'button.jobs-description__footer-button',
    'button[aria-label*="see more description" i]',
    'button[aria-label*="Click to see more" i]',
  ],
  applicants: ['.jobs-unified-top-card__applicant-count', '.num-applicants__caption'],
  paginationNext: [
    'button[aria-label="View next page"]',
    'button[aria-label="Next"]',
    'button.jobs-search-pagination__button--next',
    'button.artdeco-pagination__button--next',
  ],
  paginationPageButtons: [
    'button[aria-label^="Page "]',
    '.jobs-search-pagination__indicator button',
    'li.artdeco-pagination__indicator button',
  ],
  resultsList: [
    'ul.scaffold-layout__list-container',
    '.jobs-search-results-list',
    'div.scaffold-layout__list > ul',
    '.scaffold-layout__list',
  ],
  noResults: ['.jobs-search-no-results-banner', '.jobs-search-no-results'],
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

function queryAllUnion(root, selectorList) {
  const matched = [];
  const seen = new Set();
  for (const sel of selectorList) {
    for (const el of root.querySelectorAll(sel)) {
      if (seen.has(el)) continue;
      seen.add(el);
      matched.push(el);
    }
  }
  return matched.filter((el) => !matched.some((other) => other !== el && other.contains(el)));
}

function textOf(el) {
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
}

function isEnabled(el) {
  if (!el) return false;
  if (el.disabled) return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  if (el.classList.contains('artdeco-button--disabled')) return false;
  return true;
}

function report(type, payload) {
  chrome.runtime.sendMessage({ type, ...payload }).catch(() => {});
}

function jobIdFromElement(el) {
  let node = el;
  while (node && node !== document.documentElement) {
    const raw =
      (node.getAttribute && (node.getAttribute('data-job-id') || node.getAttribute('data-occludable-job-id'))) || '';
    const attrMatch = String(raw).match(/(\d{5,})/);
    if (attrMatch) return attrMatch[1];
    node = node.parentElement;
  }
  const href =
    (el.querySelector && (el.querySelector('a[href*="/jobs/view/"]') || el.querySelector('a[href*="currentJobId="]')))
      ?.href || '';
  const hrefMatch = href.match(/(?:jobs\/view\/|currentJobId=)(\d{5,})/);
  return hrefMatch ? hrefMatch[1] : null;
}

function cardFallback(card, jobId) {
  return {
    title: textOf(queryFirst(card, SELECTORS.cardTitle)),
    company: textOf(queryFirst(card, SELECTORS.cardCompany)),
    location: textOf(queryFirst(card, SELECTORS.cardLocation)),
    url: jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : '',
  };
}

function titlesRoughlyMatch(a, b) {
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na.includes(nb.slice(0, 20)) || nb.includes(na.slice(0, 20));
}

function urlHasJobId(jobId) {
  return (
    location.search.includes(`currentJobId=${jobId}`) ||
    location.href.includes(`currentJobId=${jobId}`)
  );
}

function readRightPane(jobId, fallback) {
  const pane = queryFirst(document, SELECTORS.detailPane) || document;
  const title = textOf(queryFirst(pane, SELECTORS.detailTitle)) || fallback.title;
  const company = textOf(queryFirst(pane, SELECTORS.detailCompany)) || fallback.company;
  const locationText = textOf(queryFirst(pane, SELECTORS.detailLocation)) || fallback.location;
  const description = textOf(queryFirst(pane, SELECTORS.detailDescription));
  const applicants = textOf(queryFirst(pane, SELECTORS.applicants));
  return {
    jobId,
    title,
    company,
    location: locationText,
    description,
    applicants,
    url: fallback.url,
  };
}

function rightPaneReady(jobId, cardTitle) {
  if (/\/jobs\/view\//i.test(location.pathname)) return false;
  const pane = queryFirst(document, SELECTORS.detailPane);
  if (!pane) return false;
  const title = textOf(queryFirst(pane, SELECTORS.detailTitle));
  if (!title) return false;
  if (urlHasJobId(jobId)) return true;
  if (cardTitle && titlesRoughlyMatch(title, cardTitle)) return true;
  return false;
}

async function expandDescription() {
  const btn = queryFirst(document, SELECTORS.seeMore);
  if (!btn) return;
  const label = (btn.getAttribute('aria-label') || textOf(btn)).toLowerCase();
  if (label.includes('see less')) return;
  btn.click();
  await sleep(400);
}

async function extractRightPane(jobId, fallback) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (/\/jobs\/view\//i.test(location.pathname)) {
      history.back();
      await sleep(900);
    }
    if (rightPaneReady(jobId, fallback.title)) break;
    await sleep(250);
  }

  await expandDescription();

  const job = readRightPane(jobId, fallback);
  if (!job.title) throw new Error('right pane did not load');
  if (!urlHasJobId(jobId) && fallback.title && !titlesRoughlyMatch(job.title, fallback.title)) {
    throw new Error('right pane did not switch to this job');
  }
  return job;
}

function collectVisibleJobIds() {
  return queryAllUnion(document, SELECTORS.jobCard)
    .map((card) => jobIdFromElement(card))
    .filter(Boolean);
}

async function clickLeftCardOnly(card) {
  const clickable =
    card.querySelector('.job-card-container') ||
    card.querySelector('.artdeco-entity-lockup') ||
    card;
  clickable.click();
  await sleep(350);
  if (/\/jobs\/view\//i.test(location.pathname)) {
    history.back();
    await sleep(900);
    clickable.click();
    await sleep(350);
  }
}

function findScrollableList() {
  const card = queryFirst(document, SELECTORS.jobCard);
  let node = card ? card.parentElement : null;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    const oy = style.overflowY;
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && node.scrollHeight > node.clientHeight + 40) {
      return node;
    }
    node = node.parentElement;
  }
  return queryFirst(document, SELECTORS.resultsList);
}

async function scrollListForMore() {
  const cards = queryAllUnion(document, SELECTORS.jobCard);
  if (cards.length) {
    cards[cards.length - 1].scrollIntoView({ block: 'end' });
  }
  const list = findScrollableList();
  if (list) {
    const before = list.scrollTop;
    list.scrollTop = Math.min(list.scrollHeight, list.scrollTop + Math.max(list.clientHeight * 0.9, 240));
    if (list.scrollTop !== before) return true;
  }
  return cards.length > 0;
}

function findNextPageButton() {
  const next = queryFirst(document, SELECTORS.paginationNext);
  if (isEnabled(next)) return next;

  const pageButtons = queryAllUnion(document, SELECTORS.paginationPageButtons);
  if (!pageButtons.length) return null;

  let currentIdx = pageButtons.findIndex(
    (btn) =>
      btn.getAttribute('aria-current') === 'true' ||
      btn.getAttribute('aria-label')?.toLowerCase().includes('current') ||
      btn.closest('.active, [aria-current="true"], .jobs-search-pagination__indicator--active, .artdeco-pagination__indicator--selected')
  );
  if (currentIdx < 0) {
    currentIdx = pageButtons.findIndex((btn) => btn.classList.contains('active'));
  }
  if (currentIdx >= 0 && currentIdx + 1 < pageButtons.length) {
    const candidate = pageButtons[currentIdx + 1];
    if (isEnabled(candidate)) return candidate;
  }
  return null;
}

async function goToNextPage() {
  const btn = findNextPageButton();
  if (!btn) return false;

  const before = new Set(collectVisibleJobIds());
  btn.scrollIntoView({ block: 'center' });
  await sleep(400);
  btn.click();

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await sleep(500);
    const after = collectVisibleJobIds();
    if (after.some((id) => !before.has(id))) return true;
  }
  return false;
}

async function waitForJobCards(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const cards = queryAllUnion(document, SELECTORS.jobCard);
    if (cards.length) return cards;
    if (queryFirst(document, SELECTORS.noResults)) {
      throw new Error('LinkedIn reported no matching jobs for this search.');
    }
    await sleep(400);
  }
  throw new Error('Timed out waiting for job cards');
}

async function runScrape(settings) {
  running = true;
  stopRequested = false;
  seenJobIds.clear();
  let captured = 0;
  let emptyPasses = 0;

  try {
    await waitForJobCards(30000);
  } catch (e) {
    report('scrape-error', {
      message: e.message || 'Could not find the job results list — LinkedIn may have changed its layout, or the page is showing a checkpoint/login prompt.',
    });
    running = false;
    return;
  }

  while (!stopRequested && captured < settings.maxResults && emptyPasses < 6) {
    const cards = queryAllUnion(document, SELECTORS.jobCard);
    let newThisPass = 0;

    for (const card of cards) {
      if (stopRequested || captured >= settings.maxResults) break;

      const jobId = jobIdFromElement(card);
      if (!jobId || seenJobIds.has(jobId)) continue;
      seenJobIds.add(jobId);
      newThisPass++;

      report('scrape-progress', { phase: `selecting job ${jobId}…` });
      card.scrollIntoView({ block: 'center' });
      await randomDelay(0.3, 0.8);
      await clickLeftCardOnly(card);

      try {
        report('scrape-progress', { phase: `reading right pane ${jobId}…` });
        const job = await extractRightPane(jobId, cardFallback(card, jobId));
        report('job-captured', { job });
        captured++;
      } catch (e) {
        report('scrape-progress', { phase: `skipped job ${jobId} (right pane didn't load)` });
      }

      await randomDelay(settings.minDelay, settings.maxDelay);
    }

    if (newThisPass > 0) {
      emptyPasses = 0;
      continue;
    }

    emptyPasses++;
    report('scrape-progress', { phase: `no new cards, loading more (attempt ${emptyPasses}/6)…` });
    await scrollListForMore();
    await randomDelay(1.2, 2.2);

    const unseenAfterScroll = queryAllUnion(document, SELECTORS.jobCard).some((c) => {
      const id = jobIdFromElement(c);
      return id && !seenJobIds.has(id);
    });
    if (unseenAfterScroll) {
      emptyPasses = 0;
      continue;
    }

    if (emptyPasses >= 2) {
      report('scrape-progress', { phase: 'opening next page…' });
      const moved = await goToNextPage();
      if (moved) {
        emptyPasses = 0;
        await randomDelay(1.5, 3);
        continue;
      }
      if (!findNextPageButton()) break;
    }
  }

  running = false;
  report('scrape-done', {
    reason: stopRequested
      ? 'stopped by user'
      : captured >= settings.maxResults
        ? 'reached max results'
        : captured === 0
          ? 'no jobs captured — layout may have changed, or results did not load'
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
}
