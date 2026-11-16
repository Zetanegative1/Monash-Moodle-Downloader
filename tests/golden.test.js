/**
 * Golden tests: each saved unit page in tests/fixtures must produce exactly the
 * downloads listed in its reviewed `<unit>.expected.json`.
 *
 * The network is replaced by tests/helpers/fake-moodle.js, which decides what a
 * resource's real file type is and what a folder contains.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { loadFixture, scanAndDownload } = require('./helpers/extension-harness.js');
const { EMBEDDED_FILE_BYTES, MB, folderFiles, resourceFile } = require('./helpers/fake-moodle.js');

const UNITS = ['CHE5883-CHE6883', 'ENG5100-ENG6100', 'ENG5105-ENG5106', 'MTE5886-MTE6886'];

const dashboardRuns = new Map();
function dashboardRun(unit) {
  if (!dashboardRuns.has(unit)) {
    const { html, expected } = loadFixture(unit);
    dashboardRuns.set(unit, scanAndDownload({ html, url: expected.pageUrl }));
  }
  return dashboardRuns.get(unit);
}

/** Every file the reviewed manifest says should land on disk, given what the fake server holds. */
function expectedFiles(expected) {
  const files = [];
  for (const folder of expected.folders) {
    const base = `${expected.courseFolder}/${folder.name}`;
    for (const item of folder.items) {
      const cmId = new URL(item.url).searchParams.get('id');
      if (item.kind === 'file') {
        const served = resourceFile(cmId);
        files.push({
          path: `${base}/${item.name}.${served.extension}`,
          fileGroup: served.fileGroup,
          bytes: served.bytes
        });
      } else if (item.kind === 'folder') {
        for (const served of folderFiles(cmId)) {
          files.push({
            path: `${base}/${item.name}/${served.relativePath}`,
            fileGroup: served.fileGroup,
            bytes: served.bytes
          });
        }
      } else if (item.kind === 'link') {
        files.push({ path: `${base}/${item.name}.url`, fileGroup: 'link', bytes: null, target: item.url });
      } else if (item.kind === 'embedded-file') {
        files.push({
          path: `${base}/${item.name}`,
          fileGroup: /\.pdf$/i.test(item.name) ? 'pdf' : 'other',
          bytes: EMBEDDED_FILE_BYTES
        });
      } else {
        throw new Error(`Unknown expected item kind: ${item.kind}`);
      }
    }
  }
  return files;
}

function comparePaths(actualPaths, expectedPaths) {
  const remaining = new Map();
  for (const expectedPath of expectedPaths) remaining.set(expectedPath, (remaining.get(expectedPath) || 0) + 1);

  const unexpected = [];
  for (const actualPath of actualPaths) {
    const count = remaining.get(actualPath) || 0;
    if (count === 0) unexpected.push(actualPath);
    else if (count === 1) remaining.delete(actualPath);
    else remaining.set(actualPath, count - 1);
  }

  const missing = [...remaining].flatMap(([expectedPath, count]) => Array(count).fill(expectedPath));
  return { missing: missing.sort(), unexpected: unexpected.sort() };
}

function assertDownloads(run, files) {
  assert.equal(run.scan.response?.success, true, 'scan failed');
  assert.deepEqual(
    comparePaths(run.downloads.map(download => download.filename), files.map(file => file.path)),
    { missing: [], unexpected: [] }
  );
  assert.deepEqual(run.consoleErrors, []);
}

function decodeShortcut(dataUrl) {
  const [, base64] = dataUrl.match(/^data:[^,]*;base64,(.*)$/) || [];
  return base64 ? Buffer.from(base64, 'base64').toString('utf8') : '';
}

for (const unit of UNITS) {
  test(`${unit}: a dashboard scan downloads exactly the expected files`, async () => {
    const { expected } = loadFixture(unit);
    assertDownloads(await dashboardRun(unit), expectedFiles(expected));
  });

  test(`${unit}: folders follow the order of the Moodle course index`, async () => {
    const { expected } = loadFixture(unit);
    const run = await dashboardRun(unit);

    const folderOrder = [];
    for (const download of run.downloads) {
      const [courseFolder, folder] = download.filename.split('/');
      assert.equal(courseFolder, expected.courseFolder);
      if (!folderOrder.includes(folder)) folderOrder.push(folder);
    }
    assert.deepEqual(folderOrder, expected.folders.map(folder => folder.name));
  });

  test(`${unit}: link activities become shortcuts to the activity`, async () => {
    const { expected } = loadFixture(unit);
    const run = await dashboardRun(unit);

    for (const link of expectedFiles(expected).filter(file => file.target)) {
      const matches = run.downloads.filter(download => download.filename === link.path);
      assert.ok(matches.length > 0, `no shortcut was created at ${link.path}`);
      assert.ok(
        matches.some(download => decodeShortcut(download.url).includes(`URL=${link.target}`)),
        `${link.path} does not point to ${link.target}`
      );
    }
  });

  test(`${unit}: the UNIT DASHBOARD tab address (section=0) scans like the dashboard`, async () => {
    const { html, expected } = loadFixture(unit);
    const run = await scanAndDownload({ html, url: `${expected.pageUrl}&section=0` });
    assertDownloads(run, expectedFiles(expected));
  });
}

test('excluding the link group drops every shortcut and nothing else', async () => {
  const { html, expected } = loadFixture('ENG5100-ENG6100');
  const run = await scanAndDownload({
    html,
    url: expected.pageUrl,
    settings: { excludedFileGroups: ['link'] }
  });

  const files = expectedFiles(expected);
  assertDownloads(run, files.filter(file => file.fileGroup !== 'link'));
  assert.equal(run.downloadResponse.skipped, files.filter(file => file.fileGroup === 'link').length);
});

test('excluding PDFs uses the real type of resources and of files inside folders', async () => {
  const { html, expected } = loadFixture('CHE5883-CHE6883');
  const run = await scanAndDownload({
    html,
    url: expected.pageUrl,
    settings: { excludedFileGroups: ['pdf'] }
  });

  const files = expectedFiles(expected);
  assertDownloads(run, files.filter(file => file.fileGroup !== 'pdf'));
  assert.equal(run.downloadResponse.skipped, files.filter(file => file.fileGroup === 'pdf').length);
});

test('a 20 MB limit skips larger files and keeps shortcuts', async () => {
  const { html, expected } = loadFixture('MTE5886-MTE6886');
  const limit = 20 * MB;
  const run = await scanAndDownload({
    html,
    url: expected.pageUrl,
    settings: { maxFileSizeBytes: limit }
  });

  const files = expectedFiles(expected);
  const tooLarge = files.filter(file => file.bytes !== null && file.bytes > limit);
  assert.ok(tooLarge.length > 0, 'the fixture should contain files above the limit');
  assertDownloads(run, files.filter(file => !tooLarge.includes(file)));
  assert.equal(run.downloadResponse.skipped, tooLarge.length);
});
