#!/usr/bin/env node
/**
 * Turn a saved Moodle course page into a test fixture without personal data.
 *
 *   node scripts/sanitize_fixture.js <saved-page.html> <output.html> [--names <names.txt>]
 *   node scripts/sanitize_fixture.js --check <fixture.html>... [--names <names.txt>]
 *
 * Names found in the page itself (logged-in user, contacts widget, forum widget)
 * are replaced automatically. People who only appear inside activity titles have
 * to be listed in a names file, one person per line, aliases separated by "|":
 *
 *   Jane Citizen | Jane | Prof Citizen
 *
 * Keep that file out of version control (*.local.txt is git-ignored).
 */
const fs = require('node:fs');
const path = require('node:path');

const PLACEHOLDER_EMAIL_DOMAIN = 'example.edu';
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const REMOVED_TEXT = '[text removed]';

const REMOVED_ELEMENTS = [
  'script', 'style', 'link', 'noscript', 'template', 'base', 'iframe', 'svg',
  'object', 'embed', 'video', 'audio', 'source', 'canvas', 'input[type="hidden"]',
  'meta:not([charset])'
].join(',');

// Page chrome that carries the logged-in user's identity and nothing the scanner reads.
const REMOVED_REGIONS = [
  'nav.navbar', '#page-footer', '#goto-top-link', '#user-notifications',
  '.popover-region', '.usermenu', '.message-app', '.toast-wrapper',
  '[data-region="footer-container-popover"]', '.logininfo'
].join(',');

const KEPT_PAGE_WRAPPER_CHILDREN = ['#courseindex', '#block-region-side-pre', '#page'];

function sanitizeDocument(document, options = {}) {
  const people = createPeopleRegistry(options.names || []);
  collectPeopleFromPage(document, people);

  removeAll(document, REMOVED_ELEMENTS);
  removeComments(document);
  removeAll(document, REMOVED_REGIONS);
  removeDrawersWithoutCourseContent(document);

  rewriteContactsWidget(document, people);
  rewriteForumWidget(document);
  removeInlineProse(document);
  resetCompletionState(document);
  scrubAttributes(document);
  scrubText(document, people);
  collapseWhitespace(document);

  if (options.sourceUrl) setSourceUrl(document, options.sourceUrl);
  return { peopleCount: people.count() };
}

function createPeopleRegistry(nameLines) {
  const placeholders = new Map();
  let nextIndex = 1;

  const register = aliases => {
    const cleaned = aliases.map(alias => alias.replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (cleaned.length === 0) return;
    const existing = cleaned.map(alias => placeholders.get(alias.toLowerCase())).find(Boolean);
    const placeholder = existing || `Person ${nextIndex++}`;
    for (const alias of cleaned) {
      if (!placeholders.has(alias.toLowerCase())) placeholders.set(alias.toLowerCase(), placeholder);
    }
  };

  for (const line of nameLines) register(line.split('|'));

  return {
    add: name => register([name]),
    count: () => nextIndex - 1,
    aliases: () => [...placeholders.keys()],
    replaceIn(text) {
      if (placeholders.size === 0 || !text) return text;
      const aliases = [...placeholders.keys()].sort((a, b) => b.length - a.length);
      const pattern = new RegExp(
        `(?<![\\p{L}\\p{N}])(?:${aliases.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`,
        'giu'
      );
      return text.replace(pattern, match => placeholders.get(match.toLowerCase()));
    }
  };
}

function collectPeopleFromPage(document, people) {
  for (const link of document.querySelectorAll('.logininfo a[href*="/user/profile.php"], a.userlink, .usertext')) {
    people.add(link.textContent);
  }
  for (const details of document.querySelectorAll('.widget-contacts .contact-details')) {
    const firstText = [...details.childNodes].find(node => node.nodeType === 3 && node.textContent.trim());
    if (firstText) people.add(firstText.textContent);
  }
  for (const details of document.querySelectorAll('.forum-post-details')) {
    people.add(details.textContent.split('|')[0]);
  }
  for (const picture of document.querySelectorAll('img.userpicture, img.forum-post-userpicture')) {
    people.add(picture.getAttribute('alt') || '');
    people.add(picture.getAttribute('title') || '');
  }
}

function removeAll(document, selector) {
  for (const element of document.querySelectorAll(selector)) element.remove();
}

function removeComments(document) {
  const walker = document.createTreeWalker(document, 128 /* NodeFilter.SHOW_COMMENT */);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  for (const comment of comments) comment.remove();
}

function removeDrawersWithoutCourseContent(document) {
  const wrapper = document.querySelector('#page-wrapper');
  if (!wrapper) return;
  for (const child of [...wrapper.children]) {
    const keep = KEPT_PAGE_WRAPPER_CHILDREN.some(selector => child.matches(selector) || child.querySelector(selector));
    if (!keep) child.remove();
  }
}

function rewriteContactsWidget(document, people) {
  for (const details of document.querySelectorAll('.widget-contacts .contact-details')) {
    const firstText = [...details.childNodes].find(node => node.nodeType === 3 && node.textContent.trim());
    const placeholder = firstText ? people.replaceIn(firstText.textContent.trim()) : 'Person';
    if (firstText) firstText.textContent = placeholder;
    for (const link of details.querySelectorAll('a[href^="mailto:"]')) {
      const email = `${placeholder.toLowerCase().replace(/\s+/g, '.')}@${PLACEHOLDER_EMAIL_DOMAIN}`;
      link.setAttribute('href', `mailto:${email}`);
      link.textContent = email;
    }
  }
}

function rewriteForumWidget(document) {
  const replacements = {
    '.forum-post-discussionname a': 'Forum post',
    '.forum-post-details': 'Person | date',
    '.forum-post-message': REMOVED_TEXT
  };
  for (const [selector, text] of Object.entries(replacements)) {
    for (const element of document.querySelectorAll(selector)) element.textContent = text;
  }
}

// Label / inline-content bodies are free text written by staff; keep the markup and links, drop the prose.
// Custom HTML blocks are not course content at all, so their bodies go entirely.
function removeInlineProse(document) {
  for (const body of document.querySelectorAll('.block_html .content')) body.replaceChildren();

  for (const container of document.querySelectorAll('.activity-altcontent')) {
    const walker = document.createTreeWalker(container, 4 /* NodeFilter.SHOW_TEXT */);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (const node of textNodes) {
      if (!node.textContent.trim()) continue;
      if (node.parentElement.closest('a[href]')) continue;
      node.textContent = REMOVED_TEXT;
    }
  }
}

// Activity completion is the saving user's own progress.
function resetCompletionState(document) {
  for (const indicator of document.querySelectorAll('[data-for="cm_completion"]')) {
    const value = indicator.getAttribute('data-value');
    if (value === 'NaN' || value === '0' || value === null) continue;
    indicator.setAttribute('data-value', '0');
    indicator.className = 'completioninfo completion_incomplete';
    indicator.innerHTML = '<i aria-label="To do" class="icon fa-regular fa-circle fa-fw" role="img" title="To do"></i>';
  }
  for (const element of document.querySelectorAll('[data-region="completion-info"], .activity-completion, .completion-dialog')) {
    element.remove();
  }
}

function scrubAttributes(document) {
  for (const element of document.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;

      if (name === 'style' || name === 'srcset' || name === 'data-userid' || name === 'data-user-id'
        || name.startsWith('data-sf') || name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (/^\s*data:/i.test(value) || (element.tagName === 'IMG' && name === 'src')) {
        element.removeAttribute(attribute.name);
        continue;
      }
      const scrubbed = scrubUrlLikeValue(value);
      if (scrubbed !== value) element.setAttribute(attribute.name, scrubbed);
    }
  }
}

function scrubUrlLikeValue(value) {
  let result = value;
  if (/panopto/i.test(result) && /^[a-z]+:\/\//i.test(result)) result = result.replace(/[?#].*$/, '');
  result = result.replace(/([?&])sesskey=[^&#"']*/gi, '$1sesskey=REDACTED');
  result = result.replace(/(\/user\/(?:profile|view)\.php\?id=)\d+/gi, '$10');
  return result;
}

function scrubText(document, people) {
  const scrub = text => people.replaceIn(text.replace(EMAIL_PATTERN, match => (
    match.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`) ? match : `person@${PLACEHOLDER_EMAIL_DOMAIN}`
  )));

  const walker = document.createTreeWalker(document, 4 /* NodeFilter.SHOW_TEXT */);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const scrubbed = scrub(node.textContent);
    if (scrubbed !== node.textContent) node.textContent = scrubbed;
  }

  for (const element of document.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name === 'class' || attribute.name === 'id') continue;
      const scrubbed = scrub(attribute.value);
      if (scrubbed !== attribute.value) element.setAttribute(attribute.name, scrubbed);
    }
  }
}

function collapseWhitespace(document) {
  const walker = document.createTreeWalker(document.documentElement, 4 /* NodeFilter.SHOW_TEXT */);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  for (const node of textNodes) {
    if (node.parentElement?.closest('pre, textarea')) continue;
    const text = node.textContent;
    if (!text.trim()) node.textContent = /\n/.test(text) ? '\n' : (text ? ' ' : '');
    else node.textContent = text.replace(/\s+/g, ' ');
  }
}

function setSourceUrl(document, sourceUrl) {
  let meta = document.querySelector('meta[name="fixture-source-url"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'fixture-source-url');
    document.head.append(meta);
  }
  meta.setAttribute('content', sourceUrl);
}

/** SingleFile records the page address in a leading comment; fall back to the canonical course link. */
function detectSourceUrl(html) {
  const fromComment = html.slice(0, 4000).match(/\burl:\s*(https?:\/\/\S+)/i);
  if (fromComment) return fromComment[1];
  const fromLink = html.match(/https:\/\/[a-z0-9.-]+\/course\/view\.php\?id=\d+/i);
  return fromLink ? fromLink[0] : '';
}

/** Returns human-readable findings; an empty list means nothing personal was detected. */
function findPersonalData(html, names = []) {
  const findings = [];
  const report = (label, matches) => {
    if (matches.length > 0) findings.push(`${label}: ${[...new Set(matches)].slice(0, 5).join(', ')}`);
  };

  report('email address', (html.match(EMAIL_PATTERN) || [])
    .filter(email => !email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`)));
  report('session key', html.match(/sesskey["'=:\s]+(?!REDACTED)[A-Za-z0-9]{6,}/g) || []);
  report('user profile link', html.match(/\/user\/(?:profile|view)\.php\?id=[1-9]\d*/g) || []);
  report('user id attribute', html.match(/\bdata-user-?id=/gi) || []);
  report('login banner', html.match(/You are logged in as/gi) || []);
  report('executable or embedded content', html.match(/<(?:script|style|iframe)\b|\b(?:src|href)="data:/gi) || []);

  const aliases = names.flatMap(line => line.split('|')).map(alias => alias.trim()).filter(Boolean);
  for (const alias of aliases) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(alias)}(?![\\p{L}\\p{N}])`, 'giu');
    report('listed name', html.match(pattern) || []);
  }
  return findings;
}

function readNamesFile(filePath) {
  if (!filePath) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseArguments(argv) {
  const positional = [];
  const options = { check: false, namesFile: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--check') options.check = true;
    else if (argv[index] === '--names') options.namesFile = argv[++index] || '';
    else positional.push(argv[index]);
  }
  return { positional, options };
}

function main() {
  const { positional, options } = parseArguments(process.argv.slice(2));
  const names = readNamesFile(options.namesFile);

  if (options.check) {
    if (positional.length === 0) throw new Error('--check needs at least one fixture file');
    let failed = false;
    for (const file of positional) {
      const findings = findPersonalData(fs.readFileSync(file, 'utf8'), names);
      console.log(`${findings.length === 0 ? 'clean' : 'FOUND'}  ${path.basename(file)}`);
      for (const finding of findings) console.log(`       ${finding}`);
      failed ||= findings.length > 0;
    }
    process.exitCode = failed ? 1 : 0;
    return;
  }

  if (positional.length !== 2) {
    throw new Error('usage: sanitize_fixture.js <saved-page.html> <output.html> [--names <names.txt>]');
  }

  const { JSDOM } = require('jsdom');
  const [inputPath, outputPath] = positional;
  const html = fs.readFileSync(inputPath, 'utf8');
  const dom = new JSDOM(html);
  const { peopleCount } = sanitizeDocument(dom.window.document, {
    names,
    sourceUrl: detectSourceUrl(html)
  });

  const output = `<!DOCTYPE html>\n${dom.window.document.documentElement.outerHTML}\n`;
  const findings = findPersonalData(output, names);
  if (findings.length > 0) {
    throw new Error(`personal data is still present, nothing written:\n  ${findings.join('\n  ')}`);
  }

  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
  console.log(`${path.basename(outputPath)}: ${html.length} -> ${output.length} bytes, ${peopleCount} people replaced`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { detectSourceUrl, findPersonalData, sanitizeDocument };
