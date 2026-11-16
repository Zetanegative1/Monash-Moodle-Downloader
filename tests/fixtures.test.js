const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { findPersonalData } = require('../scripts/sanitize_fixture.js');

const fixturesDir = path.join(__dirname, 'fixtures');
const pages = fs.readdirSync(fixturesDir).filter(name => name.endsWith('.html'));

test('every fixture page has a reviewed expected-result file', () => {
  assert.ok(pages.length > 0);
  for (const page of pages) {
    const expectedPath = path.join(fixturesDir, page.replace(/\.html$/, '.expected.json'));
    assert.ok(fs.existsSync(expectedPath), `missing ${path.basename(expectedPath)}`);
    const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
    assert.match(expected.pageUrl, /^https:\/\/learning\.monash\.edu\/course\/view\.php\?id=\d+/);
    assert.ok(expected.folders.length > 0);
  }
});

test('fixture pages and expected results contain no personal data', () => {
  const files = fs.readdirSync(fixturesDir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.join(entry.parentPath, entry.name));

  assert.ok(files.length > pages.length);
  for (const file of files) {
    const findings = findPersonalData(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(findings, [], `${path.relative(fixturesDir, file)} still contains personal data`);
  }
});

test('the sanitizer flags the kinds of personal data it is meant to remove', () => {
  const leaky = [
    '<a href="https://learning.monash.edu/user/profile.php?id=12345">Jane Citizen</a>',
    '<a href="mailto:jane.citizen@monash.edu">jane.citizen@monash.edu</a>',
    '<a href="https://learning.monash.edu/login/logout.php?sesskey=AbCdEf1234">Log out</a>',
    '<div data-userid="12345"></div>',
    '<div class="submitted-badge" neth-status="Graded"></div>',
    '<a href="https://learning.monash.edu/pluginfile.php/9/assignsubmission_file/submission_files/77/My%20report.pdf">x</a>'
  ].join('\n');

  const findings = findPersonalData(leaky, ['Jane Citizen | Jane']).join('\n');
  for (const label of [
    'email address', 'session key', 'user profile link', 'user id attribute', 'listed name',
    'submission state', 'submitted file'
  ]) {
    assert.match(findings, new RegExp(label));
  }
});
