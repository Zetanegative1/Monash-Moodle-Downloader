const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyResource,
  classifyResourceType,
  createTaskLimiter,
  deriveFolderRelativePath,
  finalizeResources,
  normalizeExcludedFileGroups,
  parseMoodleFolderDocument,
  probeFileSize,
  sanitizePathSegment
} = require('../content.js');

const {
  appendFolderPath,
  handleDownloadAll
} = require('../background.js');

test('derives nested Moodle folder paths from pluginfile URLs', () => {
  const result = deriveFolderRelativePath(
    'https://learning.monash.edu/pluginfile.php/123/mod_folder/content/0/Topic%20A/Book%201.pdf?forcedownload=1'
  );

  assert.deepEqual(result, {
    directories: ['Topic A'],
    filename: 'Book 1.pdf'
  });
});

test('parses folder files and preserves the activity directory', () => {
  const links = [
    fakeLink('/pluginfile.php/123/mod_folder/content/0/Lecture%201.pdf?forcedownload=1', 'Lecture 1.pdf'),
    fakeLink('/pluginfile.php/123/mod_folder/content/0/Videos/Topic%201.mp4?forcedownload=1', 'Topic 1.mp4')
  ];
  const folderDocument = {
    querySelectorAll: () => links,
    querySelector: selector => selector === '.filemanager, .foldertree' ? {} : null
  };

  const result = parseMoodleFolderDocument(
    folderDocument,
    'https://learning.monash.edu/mod/folder/view.php?id=456',
    'Lecture notes'
  );

  assert.equal(result.hasFileManager, true);
  assert.equal(result.resources.length, 2);
  assert.equal(result.resources[0].folderPath, 'Lecture notes');
  assert.equal(result.resources[0].type, 'PDF');
  assert.equal(result.resources[1].folderPath, 'Lecture notes/Videos');
  assert.equal(result.resources[1].type, 'VIDEO');
});

test('classifies common course file formats', () => {
  assert.equal(classifyResourceType('https://example.test/file', 'slides.pptx'), 'PPT');
  assert.equal(classifyResourceType('https://example.test/recording.webm'), 'VIDEO');
  assert.equal(classifyResourceType('https://example.test/archive.zip'), 'ARCHIVE');
  assert.equal(classifyResource('https://example.test/data.xlsx').fileGroup, 'spreadsheet');
  assert.equal(classifyResource('https://example.test/audio.mp3').fileGroup, 'audio');
  assert.equal(classifyResource('https://example.test/download', '', 'application/pdf').fileGroup, 'pdf');
});

test('normalizes supported exclusion groups', () => {
  assert.deepEqual(
    [...normalizeExcludedFileGroups(['video', 'spreadsheet', 'invalid'])],
    ['video', 'spreadsheet']
  );
});

test('skips a known excluded file group before size probing', async () => {
  const context = policyContext(['video']);
  const [resource] = await finalizeResources([{
    name: 'lecture.mp4',
    type: 'VIDEO',
    fileGroup: 'video',
    url: 'https://learning.monash.edu/pluginfile.php/123/lecture.mp4'
  }], context);

  assert.equal(resource.downloadable, false);
  assert.equal(resource.skipReason, 'file-type');
  assert.equal(context.sizeProgress.total, 0);
});

test('uses response metadata to classify extensionless Moodle resources', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async url => fakeResponse(url, {
    'content-length': '1024',
    'content-type': 'application/pdf',
    'content-disposition': 'attachment; filename="lecture.pdf"'
  });

  const context = policyContext(['pdf']);
  const [resource] = await finalizeResources([{
    name: 'Lecture handout',
    type: 'FILE',
    fileGroup: 'other',
    url: 'https://learning.monash.edu/mod/resource/view.php?id=123'
  }], context);

  assert.equal(resource.fileGroup, 'pdf');
  assert.equal(resource.type, 'PDF');
  assert.equal(resource.downloadable, false);
  assert.equal(resource.skipReason, 'file-type');
});

test('sanitizes path traversal and Windows-invalid characters', () => {
  assert.equal(sanitizePathSegment(' Topic: A / notes. '), 'Topic- A - notes');
  assert.equal(sanitizePathSegment('Lecture notes_v2.pdf'), 'Lecture notes_v2.pdf');
  assert.equal(appendFolderPath('Course/Week 1', '../Lecture\\Topic:A'), 'Course/Week 1/Lecture/Topic-A');
});

test('task limiter never exceeds the requested concurrency', async () => {
  const limit = createTaskLimiter(3);
  let active = 0;
  let peak = 0;

  const results = await Promise.all(Array.from({ length: 12 }, (_, index) => limit(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active -= 1;
    return index;
  })));

  assert.equal(peak, 3);
  assert.deepEqual(results, Array.from({ length: 12 }, (_, index) => index));
});

test('reads file size from a HEAD response without downloading the body', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const methods = [];

  global.fetch = async (url, options) => {
    methods.push(options.method);
    return fakeResponse(url, { 'content-length': '20971520' });
  };

  const result = await probeFileSize('https://learning.monash.edu/pluginfile.php/123/file.pdf');
  assert.deepEqual(result, { status: 'known', bytes: 20971520 });
  assert.deepEqual(methods, ['HEAD']);
});

test('falls back to a one-byte range response when HEAD has no size', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const methods = [];

  global.fetch = async (url, options) => {
    methods.push(options.method);
    if (options.method === 'HEAD') return fakeResponse(url, {});
    return fakeResponse(url, { 'content-range': 'bytes 0-0/52428800', 'content-length': '1' });
  };

  const result = await probeFileSize('https://learning.monash.edu/pluginfile.php/123/video.mp4');
  assert.deepEqual(result, { status: 'known', bytes: 52428800 });
  assert.deepEqual(methods, ['HEAD', 'GET']);
});

test('background skips resources rejected during scanning', async () => {
  const result = await handleDownloadAll([{
    name: 'Course',
    scanType: 'courseindex',
    weeks: [{
      name: 'Week_1',
      weekNumber: 1,
      resources: [{
        name: 'large-book.pdf',
        type: 'PDF',
        url: 'https://learning.monash.edu/pluginfile.php/123/large-book.pdf',
        downloadable: false,
        skipReason: 'size-limit'
      }]
    }]
  }]);

  assert.deepEqual(result, { success: true, count: 0, skipped: 1, failed: 0 });
});

function fakeLink(href, textContent) {
  return {
    href,
    textContent,
    getAttribute: name => name === 'href' ? href : null
  };
}

function fakeResponse(url, headerValues) {
  return {
    ok: true,
    status: 200,
    url,
    headers: {
      get: name => headerValues[name.toLowerCase()] ?? null
    },
    body: {
      cancel: async () => {}
    }
  };
}

function policyContext(excludedGroups = []) {
  return {
    maxFileSizeBytes: null,
    excludedFileGroups: new Set(excludedGroups),
    processedFileUrls: new Set(),
    sizeLimiter: task => task(),
    sizeProgress: { current: 0, total: 0 }
  };
}
