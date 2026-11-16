/**
 * Behaviour the saved unit dashboards cannot show: section pages, pages without
 * a course index, and resources Moodle refuses to describe. The pages here are
 * hand-written in the markup Moodle 4 uses, not captured from a real unit.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const { loadFixture, scanAndDownload, scanPage } = require('./helpers/extension-harness.js');
const { resourceFile } = require('./helpers/fake-moodle.js');
const {
  buildDownloadPlan,
  describeSectionFolder,
  findResourceFileInDocument,
  readMoodlePage,
  sanitizePathSegment,
  withExtension
} = require('../content.js');
const { getDownloadableExtension, handleDownloadAll } = require('../background.js');

const ORIGIN = 'https://learning.monash.edu';
const COURSE_URL = `${ORIGIN}/course/view.php?id=500`;
const COURSE_NAME = 'ABC1234 - Synthetic unit - S1 2026';

function indexModule(id, type, name) {
  if (!type) return `<li class="courseindex-item d-flex-noedit" data-for="cm" data-id="${id}"></li>`;
  return `<li class="courseindex-item d-flex" data-for="cm" data-id="${id}">
    <a class="courseindex-link" data-for="cm_name" href="${ORIGIN}/mod/${type}/view.php?id=${id}">${name}</a>
    <span class="courseindex-locked" data-for="cm_name"></span>
  </li>`;
}

function indexSection({ id, number, title, href, modules = '', children = '' }) {
  return `<div class="courseindex-section" data-for="section" data-id="${id}" data-number="${number}">
    <div class="courseindex-item courseindex-section-title" data-for="section_item">
      <a class="courseindex-link" data-for="section_title" href="${href}">${title}</a>
    </div>
    <div class="courseindex-item-content">
      <ul data-for="cmlist">${modules}</ul>
      <div class="courseindex-sectioncontent-children" data-for="subsectionlist">${children}</div>
    </div>
  </div>`;
}

function courseIndex({ weekSevenHref = `${COURSE_URL}&section=7` } = {}) {
  return `<nav id="courseindex" class="courseindex"><div id="courseindex-content"><div class="courseindex" role="tree">
    ${indexSection({ id: 1000, number: 0, title: 'Unit dashboard', href: '#section-0' })}
    ${indexSection({
      id: 1003,
      number: 3,
      title: 'Learning',
      href: `${COURSE_URL}&section=3`,
      children: [
        indexSection({
          id: 1006,
          number: 6,
          title: 'Week 6 - Casting',
          href: `${COURSE_URL}&section=6`,
          modules: indexModule(601, 'resource', 'Week 6 slides')
        }),
        indexSection({
          id: 1007,
          number: 7,
          title: 'Week 7 - Additive basics',
          href: weekSevenHref,
          modules: [
            indexModule(701, 'resource', 'Week 7 slides'),
            indexModule(702),
            indexModule(703, 'folder', 'Lecture notes'),
            indexModule(704, 'forum', 'Week 7 discussion')
          ].join(''),
          children: indexSection({
            id: 1021,
            number: 21,
            title: 'Own-time',
            href: '#section-21',
            modules: indexModule(705, 'url', 'Extra reading')
          })
        })
      ].join('')
    })}
  </div></div></nav>`;
}

function contentModule(id, type, name) {
  return `<li id="module-${id}" class="activity activity-wrapper ${type} modtype_${type}" data-for="cmitem" data-id="${id}">
    <div class="activity-item" data-activityname="${name}">
      <a class="aalink stretched-link" href="${ORIGIN}/mod/${type}/view.php?id=${id}">
        <span class="instancename">${name} <span class="accesshide"> Activity</span></span>
      </a>
    </div>
  </li>`;
}

const WEEK_SEVEN_CONTENT = `<section id="region-main"><ul data-for="course_sectionlist">
  <li id="section-7" class="section course-section main" data-for="section" data-id="1007" data-number="7">
    <div class="course-section-header" data-for="section_title"><h3 class="sectionname">Week 7 - Additive basics</h3></div>
    <ul data-for="cmlist">
      ${contentModule(701, 'resource', 'Week 7 slides')}
      <li id="module-702" class="activity activity-wrapper label modtype_label" data-for="cmitem" data-id="702">
        <div class="activity-item activityinline" data-activityname="Before the lecture">
          <div class="activity-altcontent"><p>Read
            <a href="${ORIGIN}/pluginfile.php/9702/mod_label/intro/Reading%20guide.pdf">the guide</a> first.</p></div>
        </div>
      </li>
      ${contentModule(703, 'folder', 'Lecture notes')}
      ${contentModule(704, 'forum', 'Week 7 discussion')}
      <li id="section-21" class="section course-section" data-for="section" data-id="1021" data-number="21">
        <div class="course-section-header" data-for="section_title"><h4 class="sectionname">Own-time</h4></div>
        <ul data-for="cmlist">${contentModule(705, 'url', 'Extra reading')}</ul>
      </li>
    </ul>
  </li>
</ul></section>`;

function page(body) {
  return `<!DOCTYPE html><html><head><title>Unit: ${COURSE_NAME}</title></head>
<body id="page-course-view-mst" class="format-mst">
<header id="page-header"><h1>${COURSE_NAME}</h1></header>
${body}
</body></html>`;
}

const WEEK_SEVEN_FILES = [
  `Week 7 slides.${resourceFile(701).extension}`,
  'Reading guide.pdf',
  'Lecture notes/Folder 703 notes.pdf',
  'Lecture notes/Data/Folder 703 data.xlsx',
  'Extra reading.url'
];

test('a section page downloads only that section, without a course folder', async () => {
  const run = await scanAndDownload({
    html: page(courseIndex() + WEEK_SEVEN_CONTENT),
    url: `${COURSE_URL}&section=7`
  });

  assert.equal(run.scan.response.resources[0].scanType, 'weekpage');
  assert.deepEqual(run.downloads.map(download => download.filename), WEEK_SEVEN_FILES.map(file => `Week 7/${file}`));
});

test('a subsection address scans the page that contains it', async () => {
  const run = await scanAndDownload({
    html: page(courseIndex({ weekSevenHref: '#section-7' }) + WEEK_SEVEN_CONTENT),
    url: `${COURSE_URL}&section=7#section-21`
  });

  assert.deepEqual(run.downloads.map(download => download.filename), WEEK_SEVEN_FILES.map(file => `Week 7/${file}`));
});

test('a course page adds files linked from inline content to the section that owns it', async () => {
  const run = await scanAndDownload({ html: page(courseIndex() + WEEK_SEVEN_CONTENT), url: COURSE_URL });

  assert.equal(run.scan.response.resources[0].scanType, 'courseindex');
  assert.deepEqual(run.downloads.map(download => download.filename), [
    `${COURSE_NAME}/Week 6/Week 6 slides.${resourceFile(601).extension}`,
    ...WEEK_SEVEN_FILES.map(file => `${COURSE_NAME}/Week 7/${file}`)
  ]);
});

test('a page without a course index is grouped by the sections in its body', async () => {
  const run = await scanAndDownload({ html: page(WEEK_SEVEN_CONTENT), url: COURSE_URL });

  assert.deepEqual(run.downloads.map(download => download.filename), WEEK_SEVEN_FILES.map(file => `Week 7/${file}`));
});

test('a page with nothing to download returns an empty result', async () => {
  const { response } = await scanPage({ html: page('<section id="region-main"></section>'), url: COURSE_URL });
  assert.deepEqual(response, { success: true, resources: [], warnings: [] });
});

test('a resource Moodle will not describe keeps its name and never gains .php', async () => {
  const offline = { requests: [], fetch: async () => { throw new Error('offline'); } };
  const html = page(courseIndex());
  const scan = await scanPage({ html, url: COURSE_URL, moodle: offline });

  const slides = scan.response.resources[0].weeks
    .flatMap(week => week.resources)
    .find(resource => resource.name.startsWith('Week 6 slides'));
  assert.equal(slides.name, 'Week 6 slides');
  assert.equal(slides.url, `${ORIGIN}/mod/resource/view.php?id=601`);
  assert.equal(slides.downloadable, true);
});

test('every activity in a fixture is either planned or counted as skipped', () => {
  for (const unit of ['CHE5883-CHE6883', 'ENG5100-ENG6100', 'ENG5105-ENG5106', 'MTE5886-MTE6886']) {
    const { html, expected } = loadFixture(unit);
    const dom = new JSDOM(html, { url: expected.pageUrl });
    const plan = buildDownloadPlan(readMoodlePage(dom.window.document, expected.pageUrl));
    dom.window.close();

    const restricted = expected.excluded.filter(item => item.reason === 'restricted').length;
    assert.equal(plan.skipped.restricted, restricted, `${unit}: restricted`);
    assert.equal(plan.skipped.unsupported, expected.excluded.length - restricted, `${unit}: unsupported`);
    assert.equal(plan.layout, 'courseindex');
    assert.deepEqual(plan.groups.map(group => group.title), expected.folders.map(folder => folder.section));
  }
});

test('finds the file on a resource page whichever way Moodle embeds it', () => {
  const pageUrl = `${ORIGIN}/mod/resource/view.php?id=9`;
  const cases = {
    '<div class="resourceworkaround"><a href="/pluginfile.php/9/mod_resource/content/2/a.pdf">a.pdf</a></div>':
      `${ORIGIN}/pluginfile.php/9/mod_resource/content/2/a.pdf`,
    '<object data="/pluginfile.php/9/mod_resource/content/1/b.pdf"></object>':
      `${ORIGIN}/pluginfile.php/9/mod_resource/content/1/b.pdf`,
    '<video><source src="/pluginfile.php/9/mod_resource/content/1/c.mp4"></video>':
      `${ORIGIN}/pluginfile.php/9/mod_resource/content/1/c.mp4`,
    '<p>Nothing to see</p>': null
  };

  for (const [body, expectedUrl] of Object.entries(cases)) {
    const dom = new JSDOM(`<body>${body}</body>`);
    assert.equal(findResourceFileInDocument(dom.window.document, pageUrl), expectedUrl);
    dom.window.close();
  }
});

test('names stay valid and never end in a separator', () => {
  assert.equal(sanitizePathSegment('Week 1 lecture pdf*'), 'Week 1 lecture pdf');
  assert.equal(sanitizePathSegment('What are Australian values?'), 'What are Australian values');
  assert.equal(sanitizePathSegment('RA_DMF_CHE5883/6883'), 'RA_DMF_CHE5883-6883');
  assert.equal(sanitizePathSegment('Week 3-1'), 'Week 3-1');
  assert.equal(sanitizePathSegment(`${'x'.repeat(119)} y`), 'x'.repeat(119));
});

test('only titles that start with a week number become Week folders', () => {
  assert.deepEqual(describeSectionFolder('Week 3 - Mechanical Properties'), { folderName: 'Week 3', weekNumber: 3 });
  assert.deepEqual(describeSectionFolder('week10'), { folderName: 'Week 10', weekNumber: 10 });
  assert.deepEqual(
    describeSectionFolder('Revision for week 3'),
    { folderName: 'Revision for week 3', weekNumber: undefined }
  );
  assert.deepEqual(describeSectionFolder('During the break'), { folderName: 'During the break', weekNumber: undefined });
});

test('extensions are appended once', () => {
  assert.equal(withExtension('Lecture 1', 'pdf'), 'Lecture 1.pdf');
  assert.equal(withExtension('Lecture 1.PDF', 'pdf'), 'Lecture 1.PDF');
  assert.equal(withExtension('Notes v2.1', 'docx'), 'Notes v2.1.docx');
  assert.equal(withExtension('Lecture 1', ''), 'Lecture 1');
});

test('the service worker never takes an extension from a Moodle script address', async t => {
  assert.equal(getDownloadableExtension(`${ORIGIN}/mod/resource/view.php?id=1`, 'Slides'), '');
  assert.equal(getDownloadableExtension(`${ORIGIN}/pluginfile.php/1/mod_folder/content/0/a.pdf`, 'Slides'), 'pdf');

  const filenames = [];
  const originalChrome = global.chrome;
  t.after(() => { global.chrome = originalChrome; });
  global.chrome = {
    runtime: {},
    downloads: { download: (options, callback) => { filenames.push(options.filename); callback(1); } }
  };

  const resource = (name, extension) => ({
    name,
    type: 'FILE',
    extension,
    url: `${ORIGIN}/mod/resource/view.php?id=1`
  });
  await handleDownloadAll([{
    name: 'Course',
    scanType: 'courseindex',
    weeks: [
      { name: 'Week 2 - Topic', folderName: 'Week 2', weekNumber: 2, resources: [resource('Slides', 'pdf')] },
      { name: 'Assessments', folderName: 'Assessments', resources: [resource('Unknown file', '')] },
      { name: 'Legacy week', weekNumber: 4, resources: [resource('Notes v2.1', 'docx')] }
    ]
  }]);

  assert.deepEqual(filenames, [
    'Course/Week 2/Slides.pdf',
    'Course/Assessments/Unknown file',
    'Course/Week 4/Notes v2.1.docx'
  ]);
});
