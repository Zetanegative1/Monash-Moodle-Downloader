const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

test('manifest remains valid MV3 JSON with the required permissions', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '4.6.1');
  assert.ok(manifest.permissions.includes('downloads'));
  assert.ok(manifest.permissions.includes('storage'));
  assert.ok(manifest.host_permissions.includes('https://learning.monash.edu/*'));
  assert.equal(manifest.options_ui, undefined);
});

test('every popup translation key exists in both languages', () => {
  const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
  const translationBlock = `${script.slice(0, script.indexOf('let currentLang'))}\nthis.result = TRANSLATIONS;`;
  const context = {};
  vm.runInNewContext(translationBlock, context);

  const htmlKeys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map(match => match[1]);
  for (const key of htmlKeys) {
    assert.equal(typeof context.result.en[key], 'string', `missing English translation: ${key}`);
    assert.equal(typeof context.result.zh[key], 'string', `missing Chinese translation: ${key}`);
  }

  assert.deepEqual(
    Object.keys(context.result.en).sort(),
    Object.keys(context.result.zh).sort(),
    'English and Chinese translation dictionaries differ'
  );
});

test('popup JavaScript only references element IDs present in popup.html', () => {
  const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const referencedIds = [...script.matchAll(/getElementById\('([^']+)'\)/g)].map(match => match[1]);

  for (const id of referencedIds) {
    assert.ok(ids.has(id), `popup.js references missing element #${id}`);
  }
});

test('popup omits the redundant course count and hides an idle status area', () => {
  const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'popup.css'), 'utf8');

  assert.doesNotMatch(html, /id="courseCount"/);
  assert.match(css, /\.status-section\s*\{[^}]*display:\s*none;/s);
  assert.match(css, /\.status-section\.show\s*\{[^}]*display:\s*block;/s);
});

test('embedded popup settings expose every supported file group in both languages', () => {
  const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
  const setupBlock = `${script.slice(0, script.indexOf('let currentLang'))}\nthis.result = { FILE_GROUPS, TRANSLATIONS };`;
  const context = {};
  vm.runInNewContext(setupBlock, context);

  const expectedGroups = [
    'pdf', 'presentation', 'document', 'spreadsheet', 'video',
    'audio', 'image', 'archive', 'link', 'other'
  ];
  assert.deepEqual(
    [...context.result.FILE_GROUPS.map(group => group.id)],
    expectedGroups
  );

  for (const group of expectedGroups) {
    assert.equal(typeof context.result.TRANSLATIONS.en[`group_${group}`], 'string');
    assert.equal(typeof context.result.TRANSLATIONS.zh[`group_${group}`], 'string');
  }

  const htmlKeys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map(match => match[1]);
  for (const key of htmlKeys) {
    assert.equal(typeof context.result.TRANSLATIONS.en[key], 'string', `missing popup English translation: ${key}`);
    assert.equal(typeof context.result.TRANSLATIONS.zh[key], 'string', `missing popup Chinese translation: ${key}`);
  }
});

test('standalone settings page has been removed', () => {
  assert.equal(fs.existsSync(path.join(root, 'options.html')), false);
  assert.equal(fs.existsSync(path.join(root, 'options.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'options.css')), false);
});

test('release workflow tests, packages, and publishes the extension ZIP', () => {
  const workflow = fs.readFileSync(
    path.join(root, '.github', 'workflows', 'release.yml'),
    'utf8'
  );
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

  assert.match(workflow, /tags:\s*\n\s*- "v\*"/);
  assert.match(workflow, /python scripts\/package_extension\.py/);
  assert.match(workflow, /gh release create/);
  assert.match(readme, /releases\/latest/);
});
