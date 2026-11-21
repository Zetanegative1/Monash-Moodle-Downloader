# Changelog

All notable changes to this project will be documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [4.7.1] — 2026-11-21

### Removed
- The right-click menu item `Download course resources`, which started a scan but showed no result, and the `contextMenus` permission it needed.
- The unused `activeTab` permission; the host permission for `learning.monash.edu` already covers injecting the content scripts.
- Development notes that no longer describe the code: `docs/FOLDER_RESOURCE_DOWNLOAD_PLAN.md` and the per-unit checklists in `docs/fixtures-expected/`.
- Tests, test fixtures, `scripts/sanitize_fixture.js`, `docs/MANUAL_TESTING.md` and the Node dev dependencies are no longer published in the repository; they stay in local development. The release workflow now only checks JavaScript syntax before building the ZIP.

### Added
- `PRIVACY.md` and an unofficial-project notice in the extension description and README, in preparation for the Chrome Web Store.
- Chrome Web Store install link in the README and `docs/INSTALL.md`.

## [4.7.0] — 2026-11-16

### Changed
- Scanning now reads Moodle's page structure (`data-for`, `data-id`, `data-number`, `modtype_*`) instead of looking for a section titled `Learning`, so units that arrange their sections differently are scanned the same way.
- A Unit Dashboard scan covers every section, including `Unit information`, `Assessments` and `Support`, and keeps the order of the course index.
- File resources are saved under the activity name with the extension of the file Moodle actually serves, including resources that Moodle shows inside a page.
- LTI tools and Moodle pages are saved as `.url` shortcuts in the link group; LTI activities are no longer labelled as video.
- Names no longer end in `-` when the Moodle title ends in `*` or `?`.
- The content script is split into `lib/shared.js`, `lib/moodle-page.js`, `lib/download-plan.js` and `lib/resource-resolver.js`; the service worker shares the naming rules through `lib/shared.js`.

### Fixed
- File resources were saved with a `.php` extension.
- Forums, quizzes and choices were downloaded as if they were files.
- Restricted activities were downloaded as the course page, and several of them collapsed into one entry.
- Scanning from the `UNIT DASHBOARD` tab (`…&section=0`) found nothing.
- Sections that are not weeks were moved to the end of the list.
- A file linked from inline content on the dashboard was missed.
- The popup's fallback injection only loaded one of the content scripts.

### Added
- Assignments are opened like folders: files attached to the assignment description are downloaded into a folder named after the assignment. Assignments without attachments produce nothing, and submission and feedback files are never touched.
- Four sanitized unit dashboards, one section page and one assignment page as test fixtures, golden tests that drive the extension through its message interfaces, and `scripts/sanitize_fixture.js` for adding more.
- `docs/MANUAL_TESTING.md` with the checks that need a real Moodle login.
- The popup counter is labelled `Sections` instead of `Weeks`.
- `docs/INSTALL.md` and `docs/DEBUG.md` rewritten for the current extension.

## [4.6.1] — 2026-08-10

### Added
- A reproducible packaging script that creates a clean extension ZIP containing only runtime files and the license.
- A tag-driven GitHub Actions workflow that tests the extension and attaches the ZIP to a GitHub Release.
- Simple ZIP installation instructions for users who do not use Git or GitHub source checkouts.

### Changed
- Clarified that Chrome's per-download location prompt must be disabled for nested download folders to work reliably.

## [4.6.0] — 2026-08-10

### Added
- A bilingual settings view embedded directly in the popup and opened from its gear button.
- Download filters for PDF, presentations, documents, spreadsheets/data, video, audio, images, archives, links/shortcuts, and other files.
- Response-header classification for extensionless Moodle resource links when type filters are active.

### Changed
- The file-size limit moved from the popup homepage to its compact settings view.
- Type exclusions are applied before size probing whenever the file type is already known, reducing unnecessary requests.
- Excluded resources remain visible in scan results and are marked as skipped.

### Fixed
- Removed the redundant single-course counter and fully collapsed the popup status area when no message is visible.

## [4.5.0] — 2026-08-10

### Added
- Expand Moodle `mod/folder` activities and download their individual files while preserving activity and nested folder paths.
- Per-file download limits with 10 MB, 20 MB, 50 MB, and Unlimited settings persisted in Chrome storage.
- File-size probing through `HEAD`, with a one-byte range fallback when `Content-Length` is unavailable.
- Scan progress, file sizes, skipped-file counts, and folder warnings in the popup.

### Changed
- Resource scanning is now asynchronous with bounded concurrency and partial-failure handling.
- Download counts now distinguish successfully queued, skipped, and failed resources.

### Fixed
- Folder activity links are no longer downloaded as HTML pages instead of their contained resources.
- Download paths sanitize every nested path segment and avoid duplicate video extensions.
- Long course, path, week, and resource labels now wrap within the popup instead of overflowing horizontally.
- Spaces in Moodle course, folder, and file names are preserved in both the popup and downloaded paths.

## [4.4.0] — 2026-04-19

### Added
- Bilingual UI (English / Chinese) with a toggle pill in the popup header; preference persists across sessions.
- Full course-name extraction for the main download folder (previously only a 4-letter + 4-digit code).
- Clearer empty-state hint explaining what Unit Dashboard vs. Week-page scanning downloads.

### Changed
- Sidebar scanner now tree-walks the `Learning` container instead of flat-iterating sidebar links; all cm_name resources under _Own-time_ / _Real-time_ subgroups are flattened into their parent week.
- Week-page downloads go directly to `Downloads/Week N/…` with **no** parent course folder.
- Extension icon redesigned with a modern minimalist style (rounded-square gradient + download-into-document mark).
- Project restructured: icons moved to `icons/`, docs consolidated into `docs/`.

### Fixed
- Courses without a `Learning` sidebar section (or without the "Week" keyword in section titles) now scan correctly instead of returning zero resources.

## [4.3.0] — 2026-03-12

### Changed
- Declared stable; removed experimental sub-folder creation, batch-script generation, and Panopto iframe scraping after they proved unreliable in the user's environment.
- All files now download to the Downloads root (no sub-folders) as a pragmatic fallback.

## [4.2.0] — 2026-03-11

- Attempted batch-script (.bat) generation. Rolled back — generated `.txt` output instead of runnable scripts.

## [4.1.0] — 2026-03-11

- Attempted Panopto video detection. Rolled back — CORS blocked iframe content access.

## [4.0.0] — 2026-03-11

- Attempted automatic sub-folder creation via Chrome Downloads API. Rolled back — API did not create sub-folders in target environment.

## [1.0.0] — 2026-03-11

- Initial release: sidebar + week-page scanning, PDF/PPT/DOC/video/URL detection, `.url` shortcuts for embedded videos.
