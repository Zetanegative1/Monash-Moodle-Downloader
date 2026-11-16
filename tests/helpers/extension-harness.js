/**
 * Runs the extension the way Chrome does, without Chrome:
 *
 *   - the content scripts listed in manifest.json are evaluated inside a jsdom
 *     page and driven through the same `scanResources` message the popup sends;
 *   - the service worker from manifest.json is evaluated in its own context and
 *     driven through the `downloadAll` message.
 *
 * Tests only see messages and `chrome.downloads` calls, so they keep working
 * however the source files are organised internally.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const { createFakeMoodle, describeUrl } = require('./fake-moodle.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');

function readManifest() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
}

function loadFixture(unit) {
  return {
    html: fs.readFileSync(path.join(FIXTURES, `${unit}.html`), 'utf8'),
    expected: JSON.parse(fs.readFileSync(path.join(FIXTURES, `${unit}.expected.json`), 'utf8'))
  };
}

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener: listener => { listeners.push(listener); },
    removeListener: listener => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    },
    hasListener: listener => listeners.includes(listener)
  };
}

function createFakeChrome() {
  const onMessage = createEvent();
  const onDeterminingFilename = createEvent();
  const downloads = [];
  const sentMessages = [];

  const chrome = {
    runtime: {
      onMessage,
      onInstalled: createEvent(),
      lastError: undefined,
      sendMessage: message => {
        sentMessages.push(message);
        return Promise.resolve();
      }
    },
    downloads: {
      onDeterminingFilename,
      download(options, callback) {
        const id = downloads.length + 1;
        const served = options.url.startsWith('data:') ? null : describeUrl(options.url);

        // Chrome lets a listener override the name after the response headers are known.
        let filename = options.filename;
        for (const listener of onDeterminingFilename.listeners) {
          listener({
            id,
            url: options.url,
            finalUrl: served?.finalUrl || options.url,
            filename: served?.filename || '',
            mime: served?.contentType || ''
          }, suggestion => {
            if (suggestion?.filename) filename = suggestion.filename;
          });
        }

        downloads.push({
          url: options.url,
          filename: filename || served?.filename || '',
          conflictAction: options.conflictAction,
          saveAs: options.saveAs
        });

        if (typeof callback === 'function') {
          callback(id);
          return undefined;
        }
        return Promise.resolve(id);
      }
    },
    contextMenus: { create: () => {}, onClicked: createEvent() },
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      sync: { get: async () => ({}), set: async () => {} }
    },
    tabs: { sendMessage: async () => undefined, query: async () => [] }
  };

  /** Delivers a message like chrome.runtime.sendMessage / chrome.tabs.sendMessage would. */
  function dispatch(message) {
    return new Promise((resolve, reject) => {
      let expectsAsyncResponse = false;
      for (const listener of onMessage.listeners) {
        try {
          const result = listener(structuredCopy(message), { id: 'test' }, response => resolve(structuredCopy(response)));
          if (result === true) expectsAsyncResponse = true;
        } catch (error) {
          reject(error);
          return;
        }
      }
      if (!expectsAsyncResponse) resolve(undefined);
    });
  }

  return { chrome, dispatch, downloads, sentMessages };
}

// Messages cross a process boundary in Chrome, so only JSON-compatible data survives.
function structuredCopy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function runFile(relativePath, context) {
  const filename = path.join(ROOT, relativePath);
  new vm.Script(fs.readFileSync(filename, 'utf8'), { filename }).runInContext(context);
}

/** Loads the content scripts into `html` served at `url` and performs a scan. */
async function scanPage({ html, url, settings = {}, moodle = createFakeMoodle() }) {
  const manifest = readManifest();
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const extension = createFakeChrome();

  dom.window.chrome = extension.chrome;
  dom.window.fetch = moodle.fetch;

  try {
    const context = dom.getInternalVMContext();
    for (const entry of manifest.content_scripts) {
      for (const file of entry.js) runFile(file, context);
    }

    const response = await extension.dispatch({
      action: 'scanResources',
      maxFileSizeBytes: settings.maxFileSizeBytes ?? null,
      excludedFileGroups: settings.excludedFileGroups ?? []
    });
    return { response, requests: moodle.requests, progress: extension.sentMessages };
  } finally {
    dom.window.close();
  }
}

/** Loads the service worker and asks it to download a scan result. */
async function downloadResources(resources, { moodle = createFakeMoodle() } = {}) {
  const manifest = readManifest();
  if (manifest.background.type === 'module') {
    throw new Error('The test harness does not support module service workers');
  }

  const extension = createFakeChrome();
  const consoleErrors = [];
  const sandbox = {
    chrome: extension.chrome,
    fetch: moodle.fetch,
    console: { log() {}, info() {}, warn() {}, debug() {}, error: (...args) => consoleErrors.push(args) },
    URL,
    URLSearchParams,
    AbortController,
    TextEncoder,
    TextDecoder,
    Blob,
    btoa,
    atob,
    setTimeout,
    clearTimeout
  };
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox);
  sandbox.importScripts = (...files) => files.forEach(file => runFile(file, context));

  runFile(manifest.background.service_worker, context);
  const response = await extension.dispatch({ action: 'downloadAll', resources });
  return { response, downloads: extension.downloads, consoleErrors };
}

/** Scan a page and download everything the scan found, as one click-through of the popup. */
async function scanAndDownload({ html, url, settings }) {
  const moodle = createFakeMoodle();
  const scan = await scanPage({ html, url, settings, moodle });
  if (!scan.response?.success) return { scan, downloads: [], consoleErrors: [] };

  const { response, downloads, consoleErrors } = await downloadResources(scan.response.resources, { moodle });
  return { scan, downloadResponse: response, downloads, consoleErrors };
}

module.exports = {
  downloadResources,
  loadFixture,
  scanAndDownload,
  scanPage
};
