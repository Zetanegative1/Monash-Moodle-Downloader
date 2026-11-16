/**
 * Reads the structure of a Moodle course page out of the DOM.
 *
 * Nothing here decides what gets downloaded or where it is saved, and nothing
 * touches the network. Elements are found through the attributes Moodle's own
 * JavaScript relies on (`data-for`, `data-id`, `data-number`, `modtype_*`), not
 * through section titles, so a unit can name and arrange its sections freely.
 */
(function (exports) {
  'use strict';

  const SECTION = '[data-for="section"]';
  const CONTENT_SECTION = '[data-for="section"], li.section';
  const CONTENT_MODULE = '[data-for="cmitem"], li.activity[data-id], li.activity[id^="module-"]';
  const MODULE_URL_PATTERN = /\/mod\/([a-z0-9_]+)\/view\.php$/i;

  /**
   * @returns {{
   *   url: string,
   *   courseName: string,
   *   view: { kind: 'course' } | { kind: 'section', sectionNumber?: number, sectionId?: string },
   *   index: SectionNode[],
   *   content: ContentSection[]
   * }}
   */
  function readMoodlePage(document, pageUrl) {
    const url = new URL(pageUrl);
    return {
      url: url.href,
      courseName: readCourseName(document),
      view: detectView(url),
      index: readCourseIndex(document, url),
      content: readMainContent(document, url)
    };
  }

  /** A section page shows one section; everything else is treated as the course as a whole. */
  function detectView(url) {
    if (/\/course\/section\.php$/.test(url.pathname) && url.searchParams.get('id')) {
      return { kind: 'section', sectionId: url.searchParams.get('id') };
    }
    const sectionNumber = Number(url.searchParams.get('section'));
    if (/\/course\/view\.php$/.test(url.pathname) && Number.isInteger(sectionNumber) && sectionNumber > 0) {
      return { kind: 'section', sectionNumber };
    }
    return { kind: 'course' };
  }

  function readCourseName(document) {
    const selectors = [
      '#page-header h1', '.page-header-headings h1', 'h1',
      '.page-context-header', '.course-title', '[data-region="course-title"]'
    ];
    for (const selector of selectors) {
      const name = textOf(document.querySelector(selector));
      if (name) return name;
    }
    const match = String(document.title || '').match(/[A-Z]{3,4}\d{4}/);
    return match ? match[0] : 'Course';
  }

  /**
   * The course index drawer: the only place a format-mst page lists every section.
   *
   * @returns {SectionNode[]} top-level sections, each with `children` for the sections nested in it
   */
  function readCourseIndex(document, baseUrl) {
    const root = document.querySelector('#courseindex') || document.querySelector('.courseindex');
    if (!root) return [];

    const nodes = new Map();
    const topLevel = [];

    for (const element of root.querySelectorAll(SECTION)) {
      const parent = nodes.get(element.parentElement?.closest(SECTION)) || null;
      const titleLink = ownDescendants(element, '[data-for="section_title"]', SECTION)[0] || null;
      const link = resolveUrl(titleLink?.getAttribute('href'), baseUrl);

      const node = {
        id: element.getAttribute('data-id') || '',
        number: readNumber(element.getAttribute('data-number')),
        title: textOf(titleLink),
        url: link ? link.href : '',
        depth: parent ? parent.depth + 1 : 0,
        isPage: false,
        modules: ownDescendants(element, '[data-for="cm"]', SECTION).map(item => readIndexModule(item, baseUrl)),
        children: []
      };
      node.isPage = sectionOwnsPage(node, link);

      nodes.set(element, node);
      (parent ? parent.children : topLevel).push(node);
    }

    return topLevel;
  }

  /**
   * Moodle links a section that has its own page to `…&section=<its number>`, and a
   * section shown inside another page to `…&section=<that page>#section-<its number>`.
   */
  function sectionOwnsPage(node, link) {
    if (node.depth === 0) return true;
    if (!link) return false;

    const target = link.searchParams.get('section');
    if (target !== null) return node.number !== null && Number(target) === node.number;
    if (/\/course\/section\.php$/.test(link.pathname)) return link.searchParams.get('id') === node.id;
    return !link.hash;
  }

  function readIndexModule(item, baseUrl) {
    const link = item.querySelector('a[data-for="cm_name"][href]');
    const url = resolveUrl(link?.getAttribute('href'), baseUrl);
    return {
      cmId: item.getAttribute('data-id') || '',
      name: textOf(link),
      url: url ? url.href : '',
      modType: moduleTypeOf(url),
      hasLink: Boolean(url),
      restricted: item.classList.contains('restrictions') || link?.getAttribute('data-anchor') === 'true'
    };
  }

  /**
   * The sections and activities rendered in the page body. Unlike the course index
   * this includes inline content (labels and the like) and the files linked from it.
   *
   * @returns {ContentSection[]}
   */
  function readMainContent(document, baseUrl) {
    const root = document.querySelector('#region-main') || document.body;
    if (!root) return [];

    const sections = new Map();
    for (const element of root.querySelectorAll(CONTENT_SECTION)) {
      const parentElement = element.parentElement?.closest(CONTENT_SECTION);
      const titleElement = ownDescendants(element, '[data-for="section_title"], .sectionname', CONTENT_SECTION)[0];
      sections.set(element, {
        id: element.getAttribute('data-id') || '',
        number: readNumber(element.getAttribute('data-number') ?? element.getAttribute('data-sectionnum')),
        title: textOf(titleElement) || element.getAttribute('aria-label') || '',
        parentNumber: parentElement && sections.has(parentElement) ? sections.get(parentElement).number : null,
        modules: []
      });
    }

    for (const element of root.querySelectorAll(CONTENT_MODULE)) {
      const section = sections.get(element.closest(CONTENT_SECTION));
      if (section) section.modules.push(readContentModule(element, baseUrl));
    }

    return [...sections.values()];
  }

  function readContentModule(element, baseUrl) {
    const cmId = element.getAttribute('data-id') || (element.id || '').replace(/^module-/, '');
    const classType = [...element.classList].find(name => name.startsWith('modtype_'))?.slice('modtype_'.length) || '';

    let activityLink = null;
    const fileLinks = [];
    const seenFiles = new Set();

    for (const anchor of ownDescendants(element, 'a[href]', CONTENT_MODULE)) {
      const url = resolveUrl(anchor.getAttribute('href'), baseUrl);
      if (!url) continue;

      if (MODULE_URL_PATTERN.test(url.pathname)) {
        if (!activityLink && (!cmId || url.searchParams.get('id') === cmId)) activityLink = { anchor, url };
        continue;
      }
      if (url.pathname.includes('/pluginfile.php/') && !seenFiles.has(url.href)) {
        seenFiles.add(url.href);
        fileLinks.push({ url: url.href, text: textOf(anchor) });
      }
    }

    const modType = classType || moduleTypeOf(activityLink?.url);
    const directFile = modType === 'resource'
      ? fileLinks.find(file => file.url.includes('/mod_resource/content/'))
      : null;

    return {
      cmId,
      name: readActivityName(element, activityLink?.anchor),
      url: activityLink ? activityLink.url.href : '',
      modType,
      hasLink: Boolean(activityLink),
      restricted: false,
      directFileUrl: directFile ? directFile.url : '',
      embeddedFiles: fileLinks.filter(file => file !== directFile)
    };
  }

  function readActivityName(element, anchor) {
    const instanceName = (anchor || element).querySelector('.instancename');
    if (instanceName) {
      const clone = instanceName.cloneNode(true);
      for (const hidden of clone.querySelectorAll('.accesshide, .sr-only')) hidden.remove();
      const name = textOf(clone);
      if (name) return name;
    }
    return textOf(anchor)
      || ownDescendants(element, '[data-activityname]', CONTENT_MODULE)[0]?.getAttribute('data-activityname')
      || '';
  }

  /** Descendants of `element` that are not inside a nested `boundary` element. */
  function ownDescendants(element, selector, boundary) {
    return [...element.querySelectorAll(selector)].filter(candidate => {
      const owner = candidate.matches(boundary) ? candidate.parentElement?.closest(boundary) : candidate.closest(boundary);
      return owner === element;
    });
  }

  function moduleTypeOf(url) {
    const match = url ? url.pathname.match(MODULE_URL_PATTERN) : null;
    return match ? match[1].toLowerCase() : '';
  }

  function resolveUrl(href, baseUrl) {
    if (!href) return null;
    try {
      const url = new URL(href, baseUrl);
      return /^https?:$/.test(url.protocol) ? url : null;
    } catch (error) {
      return null;
    }
  }

  function readNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function textOf(element) {
    return (element?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  Object.assign(exports, { readCourseIndex, readMainContent, readMoodlePage });
})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : (globalThis.MoodleDownloader = globalThis.MoodleDownloader || {}));
