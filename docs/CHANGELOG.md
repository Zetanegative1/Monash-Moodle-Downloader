# Changelog

All notable changes to this project will be documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
