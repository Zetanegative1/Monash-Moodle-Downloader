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
  for (const name of fs.readdirSync(fixturesDir)) {
    const findings = findPersonalData(fs.readFileSync(path.join(fixturesDir, name), 'utf8'));
    assert.deepEqual(findings, [], `${name} still contains personal data`);
  }
});

test('the sanitizer flags the kinds of personal data it is meant to remove', () => {
  const leaky = [
    '<a href="https://learning.monash.edu/user/profile.php?id=12345">Jane Citizen</a>',
    '<a href="mailto:jane.citizen@monash.edu">jane.citizen@monash.edu</a>',
    '<a href="https://learning.monash.edu/login/logout.php?sesskey=AbCdEf1234">Log out</a>',
    '<div data-userid="12345"></div>'
  ].join('\n');

  const findings = findPersonalData(leaky, ['Jane Citizen | Jane']).join('\n');
  for (const label of ['email address', 'session key', 'user profile link', 'user id attribute', 'listed name']) {
    assert.match(findings, new RegExp(label));
  }
});
