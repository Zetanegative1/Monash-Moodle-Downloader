/**
 * Decides what a scan covers: which sections become folders, which activities
 * are worth downloading and in what order. Pure data in, pure data out.
 *
 * Rules:
 *   - Every section that has its own page becomes one folder; sections shown
 *     inside that page (Own-time / Real-time / Wrap-up, "1. Written", …) are
 *     flattened into it. Folders keep the order of the Moodle course index.
 *   - On a course page the whole course is in scope; on a section page only
 *     that section is.
 *   - What happens to an activity depends on its Moodle module type alone.
 */
(function (exports) {
  'use strict';

  const shared = typeof module !== 'undefined' && module.exports
    ? require('./shared.js')
    : globalThis.MoodleDownloader;

  /**
   * Module types that hold something to keep. An assignment is done online, but
   * staff attach the brief, templates and data to it, so those files are fetched.
   * Everything else is an activity to do online.
   */
  const MODULE_HANDLING = {
    resource: 'file',
    folder: 'folder',
    url: 'link',
    page: 'link',
    lti: 'link',
    assign: 'attachments'
  };

  /**
   * @param page result of `readMoodlePage`
   * @returns {{
   *   courseName: string,
   *   layout: 'courseindex' | 'weekpage',
   *   groups: Array<{ title: string, folderName: string, weekNumber?: number, activities: Activity[] }>,
   *   skipped: { inline: number, restricted: number, unsupported: number }
   * }}
   */
  function buildDownloadPlan(page) {
    const plan = createPlanBuilder();
    const sectionScope = page.view.kind === 'section';

    const indexRoots = sectionScope ? findSectionInIndex(page.index, page.view) : page.index;
    for (const node of indexRoots) addIndexSection(plan, node, null);

    const usesIndex = plan.groups.length > 0;
    if (!usesIndex) addContentSections(plan, page.content, sectionScope ? page.view : null);
    mergeContentModules(plan, page.content, usesIndex);

    const groups = plan.groups
      .map(group => ({
        title: group.title,
        folderName: group.folderName,
        weekNumber: group.weekNumber,
        activities: group.activities
          .sort((a, b) => a.order - b.order)
          .map(({ order, ...activity }) => activity)
      }))
      .filter(group => group.activities.length > 0);

    return {
      courseName: page.courseName,
      layout: usesIndex && !sectionScope ? 'courseindex' : 'weekpage',
      groups,
      skipped: plan.skipped
    };
  }

  function createPlanBuilder() {
    return {
      groups: [],
      groupOfModule: new Map(),
      orderOfModule: new Map(),
      plannedModules: new Set(),
      plannedFiles: new Set(),
      skipped: { inline: 0, restricted: 0, unsupported: 0 },
      nextOrder: 0
    };
  }

  function createGroup(plan, title, sectionNumber) {
    const group = {
      title,
      ...shared.describeSectionFolder(title),
      sectionNumbers: new Set(sectionNumber === null ? [] : [sectionNumber]),
      activities: []
    };
    plan.groups.push(group);
    return group;
  }

  /** The section being viewed, or the page it belongs to when it is a subsection. */
  function findSectionInIndex(index, view) {
    const search = (nodes, page) => {
      for (const node of nodes) {
        const owner = node.isPage ? node : page;
        const matches = view.sectionId ? node.id === view.sectionId : node.number === view.sectionNumber;
        if (matches) return owner ? [owner] : [node];
        const found = search(node.children, owner);
        if (found) return found;
      }
      return null;
    };
    return search(index, null) || [];
  }

  function addIndexSection(plan, node, currentGroup) {
    const group = node.isPage || !currentGroup ? createGroup(plan, node.title, node.number) : currentGroup;
    if (node.number !== null) group.sectionNumbers.add(node.number);

    for (const module of node.modules) addModule(plan, group, module);
    for (const child of node.children) addIndexSection(plan, child, group);
  }

  /** Without a course index, group by the sections rendered in the page body. */
  function addContentSections(plan, sections, view) {
    const groupOfSection = new Map();

    for (const section of sections) {
      const parentGroup = section.parentNumber === null ? null : groupOfSection.get(section.parentNumber);
      const shownAlone = view && plan.groups.length > 0;
      const group = parentGroup || (shownAlone ? plan.groups[0] : createGroup(plan, section.title, section.number));
      if (section.number !== null) {
        group.sectionNumbers.add(section.number);
        groupOfSection.set(section.number, group);
      }
      for (const module of section.modules) addModule(plan, group, module);
    }
  }

  /**
   * The page body knows things the course index does not: activities missing
   * from the index, direct file links, and files linked from inline content.
   */
  function mergeContentModules(plan, sections, usesIndex) {
    for (const section of sections) {
      for (const module of section.modules) {
        const group = plan.groupOfModule.get(module.cmId)
          || plan.groups.find(candidate => candidate.sectionNumbers.has(section.number))
          || (usesIndex ? null : plan.groups[0]);
        if (!group) continue;

        if (usesIndex && !plan.groupOfModule.has(module.cmId)) addModule(plan, group, module);

        const planned = group.activities.find(activity => activity.cmId === module.cmId && activity.kind === 'file');
        if (planned && module.directFileUrl) planned.directFileUrl = module.directFileUrl;

        if (module.modType === 'resource' || module.modType === 'folder') continue;
        const baseOrder = plan.orderOfModule.get(module.cmId) ?? plan.nextOrder++;
        module.embeddedFiles.forEach((file, position) => {
          const key = shared.normalizeUrlForDedupe(file.url);
          if (plan.plannedFiles.has(key)) return;
          plan.plannedFiles.add(key);
          group.activities.push({
            cmId: module.cmId,
            kind: 'embedded-file',
            modType: module.modType,
            name: shared.lastPathSegment(file.url) || file.text,
            url: file.url,
            order: baseOrder + (position + 1) / (module.embeddedFiles.length + 1)
          });
        });
      }
    }
  }

  function addModule(plan, group, module) {
    const order = plan.nextOrder++;
    if (module.cmId) {
      if (plan.groupOfModule.has(module.cmId)) return;
      plan.groupOfModule.set(module.cmId, group);
      plan.orderOfModule.set(module.cmId, order);
    }

    if (!module.hasLink) {
      plan.skipped.inline += 1;
      return;
    }
    if (module.restricted) {
      plan.skipped.restricted += 1;
      return;
    }
    const kind = MODULE_HANDLING[module.modType];
    if (!kind) {
      plan.skipped.unsupported += 1;
      return;
    }

    group.activities.push({
      cmId: module.cmId,
      kind,
      modType: module.modType,
      name: module.name,
      url: module.url,
      directFileUrl: module.directFileUrl || '',
      order
    });
  }

  Object.assign(exports, { MODULE_HANDLING, buildDownloadPlan });
})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : (globalThis.MoodleDownloader = globalThis.MoodleDownloader || {}));
