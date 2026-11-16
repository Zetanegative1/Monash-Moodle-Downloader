/**
 * Content script entry point: answers the popup's `scanResources` request.
 *
 *   lib/moodle-page.js        DOM -> page structure
 *   lib/download-plan.js      page structure -> folders and activities to fetch
 *   lib/resource-resolver.js  activities -> downloadable resources (network)
 *
 * Wrapped in a function so the popup can inject the scripts again into a tab
 * that was open before the extension loaded without redeclaring anything.
 */
(function () {
  'use strict';

  const lib = typeof module !== 'undefined' && module.exports
    ? {
      ...require('./lib/shared.js'),
      ...require('./lib/moodle-page.js'),
      ...require('./lib/download-plan.js'),
      ...require('./lib/resource-resolver.js')
    }
    : globalThis.MoodleDownloader;

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action !== 'scanResources') return false;

      scanPageResources({
        maxFileSizeBytes: request.maxFileSizeBytes,
        excludedFileGroups: request.excludedFileGroups
      })
        .then(result => sendResponse({ success: true, ...result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    });
  }

  async function scanPageResources(options = {}) {
    const warnings = [];

    const page = lib.readMoodlePage(document, window.location.href);
    const plan = lib.buildDownloadPlan(page);
    if (plan.groups.length === 0) return { resources: [], warnings };

    const weeks = await lib.resolvePlan(plan, lib.createScanContext({
      ...options,
      warnings,
      reportProgress: reportScanProgress
    }));

    const resources = weeks.length > 0
      ? [{ name: lib.sanitizeFileName(plan.courseName), weeks, scanType: plan.layout }]
      : [];
    return { resources, warnings };
  }

  function reportScanProgress(progress) {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    try {
      const result = chrome.runtime.sendMessage({ action: 'scanProgress', ...progress });
      if (result?.catch) result.catch(() => {});
    } catch (error) {
      // The popup may have been closed during a scan.
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ...lib, scanPageResources };
  }
})();
