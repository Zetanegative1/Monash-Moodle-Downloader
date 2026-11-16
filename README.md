# 📚 Monash Moodle Downloader

> One-click batch download for Monash University Moodle course resources — auto-sorted by section. Stop right-clicking 40 PDFs the night before finals. 😮‍💨

[![Version](https://img.shields.io/badge/version-4.7.0-6366f1)](./docs/CHANGELOG.md)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-8b5cf6)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](./LICENSE)

---

## ✨ What it does

- 🎯 **Two scan modes** — Unit Dashboard (grab everything, every section) or a single section page (just this week, thanks)
- 📁 **Auto-foldered** — one folder per Moodle section, in Moodle's order: `Unit information/`, `Week 1/`, `Week 2/`, … `Assessments/`
- 🧭 **Works across unit layouts** — reads Moodle's own page structure instead of looking for particular section titles
- 🗂️ **Moodle folders expanded** — files inside _Lecture notes_, _After class reading_, and similar activities keep their folder structure
- 📝 **Assignment briefs included** — files attached to an assignment land in a folder named after it; assignments without attachments are left out
- 📏 **Size limits** — choose 10 MB, 20 MB, 50 MB, or Unlimited; oversized files are shown but skipped
- 🎛️ **Type filters** — independently include or exclude PDFs, presentations, documents, spreadsheets, video, audio, images, archives, links, and other files
- 📄 **Handles the usual suspects** — PDF, PPT, DOC, MP4, saved under the activity's name with the file's real extension; external links, pages and LTI tools (Panopto, reading lists) get saved as `.url` shortcuts
- 🌐 **Bilingual UI** — English by default, one-click switch to 中文
- ⚡ **Sidebar-powered** — pulls every resource from the course index without navigating away

## 🚀 Install

### For most users — download the ZIP

1. Open the [latest release](https://github.com/Zetanegative1/Monash-Moodle-Downloader/releases/latest).
2. Under **Assets**, download `Monash-Moodle-Downloader-vX.Y.Z.zip` and extract it to a permanent folder.
3. Open `chrome://extensions/` in Chrome and enable **Developer mode**.
4. Click **Load unpacked** and select the extracted folder that contains `manifest.json`.

Chrome does not automatically update unpacked extensions. When a new release is available, download and extract the new ZIP, then load that folder again.

### For developers — clone the repository

1. Clone or download this repo:
   ```bash
   git clone https://github.com/Zetanegative1/Monash-Moodle-Downloader.git
   ```
2. Open `chrome://extensions/` in Chrome
3. Flip on **Developer mode** (top-right)
4. Click **Load unpacked** → pick the project folder
5. Pin the extension icon to your toolbar and you're done 🎉

To build the same clean ZIP locally, run:

```bash
python scripts/package_extension.py
```

## 📖 How to use

**On a Unit Dashboard** — Click the icon → **Scan** → **Download All**
Downloads everything published in every section into:
```
Downloads/<Full Course Name>/Unit information/…
Downloads/<Full Course Name>/Week 1/…
Downloads/<Full Course Name>/Assessments/…
```
Sections whose title starts with `Week N` are saved as `Week N`; the others keep their title. Groups inside a section page (_Own-time_, _Real-time_, _Wrap-up_) are flattened into it.

**On a single section page** — Same three clicks. Only that section downloads, into:
```
Downloads/Week N/…
```

**Assignments** — each assignment with attached files gets its own folder, e.g. `Assessments/Team project report/…`. Your own submissions and feedback files are never downloaded.

**What is skipped** — quizzes, forums, choices, assignments without attachments, and activities you don't have access to.

**Language toggle** — Hit the `EN / 中文` pill in the header. Your pick sticks.

**Download settings** — Click the ⚙️ button to configure the size limit and the file-type groups that should be downloaded. Settings apply to the next scan.

## 🧩 Under the hood

| Layer | File | Job |
| --- | --- | --- |
| Content script | [`content.js`](./content.js) | Answers the popup's scan request by running the three steps below |
| ↳ page reader | [`lib/moodle-page.js`](./lib/moodle-page.js) | Reads the course index and the page body into a section tree, using Moodle's `data-for` / `data-id` / `modtype_*` attributes |
| ↳ download plan | [`lib/download-plan.js`](./lib/download-plan.js) | Decides which sections become folders and what happens to each module type |
| ↳ resolver | [`lib/resource-resolver.js`](./lib/resource-resolver.js) | Opens folders, finds each file's real name, type and size, applies the settings |
| Shared rules | [`lib/shared.js`](./lib/shared.js) | File naming and file-type groups, used by the content scripts and the service worker |
| Service worker | [`background.js`](./background.js) | Fires off `chrome.downloads.download` tasks with the right folder paths |
| Popup UI | [`popup.html`](./popup.html) / [`popup.js`](./popup.js) / [`popup.css`](./popup.css) | Renders downloads and the embedded settings view, handles actions and bilingual toggle |

**Scanning, in one paragraph:** On a Unit Dashboard the whole course index is read as a tree. Every section with its own page becomes a folder and the sections shown inside that page are flattened into it. Each activity is handled by its Moodle module type: `resource` is downloaded, `folder` is opened in the background and expanded into its real files, `assign` is opened and the files attached to its description are collected, `url` / `page` / `lti` become shortcuts, and everything else is skipped. For each `resource` one lightweight header request tells the extension the real file name, type and size, which also drives the size limit and type filters. On a section page the same steps run for that section only, and files linked from inline content in the page body are added. Both paths produce the same resource schema, which the service worker then downloads.

## 🧪 Development

The extension has no runtime dependencies and no build step. Tests need Node 22+ and `jsdom`:

```bash
npm install
```

```bash
npm test
```

`tests/fixtures/` holds saved unit pages with personal data removed, each next to a reviewed `<unit>.expected.json`; `tests/golden.test.js` checks that a scan produces exactly those downloads. To add a unit, save its page as a single HTML file and run:

```bash
node scripts/sanitize_fixture.js saved-page.html tests/fixtures/<unit>.html --names names.local.txt
```

`names.local.txt` lists people named in activity titles, one per line; keep it out of git. Checks that need a real Moodle login are in [docs/MANUAL_TESTING.md](./docs/MANUAL_TESTING.md).

## 📂 Project layout

```
moodle-downloader/
├── manifest.json
├── background.js
├── content.js
├── lib/
│   └── shared.js · moodle-page.js · download-plan.js · resource-resolver.js
├── popup.html · popup.css · popup.js
├── scripts/
│   ├── package_extension.py
│   └── sanitize_fixture.js
├── tests/
│   ├── fixtures/
│   └── helpers/
├── package.json
├── .github/
│   └── workflows/release.yml
├── icons/
│   └── icon16 · icon48 · icon128.png
└── docs/
    ├── CHANGELOG.md
    ├── INSTALL.md
    ├── DEBUG.md
    ├── MANUAL_TESTING.md
    └── fixtures-expected/
```

## ⚠️ Known quirks

- Panopto videos can only be saved as `.url` shortcuts — CORS blocks direct download 😔
- Collapsed sidebar sections aren't scanned; expand them first if needed
- Files linked inside labels and other inline content are only found when you scan that section's own page, not from the dashboard
- A scan asks Moodle about every file resource and opens every assignment page, which Moodle may record as you having viewed them
- If sub-folders don't appear after download, ensure Chrome's **Ask where to save each file before downloading** setting is disabled

## 🙏 Credits & acknowledgements

- Icon — <a href="https://www.flaticon.com/free-icons/data" title="data icons">Data icons created by Ivan Abirawa — Flaticon</a>
- Spiritual predecessor — [harsilspatel/moodle-downloader](https://github.com/harsilspatel/moodle-downloader) built the original downloader for Monash's legacy Moodle. This project is a ground-up rewrite for the new (2025+) Moodle UI on Manifest V3. Thanks for lighting the way 🕯️

## 🤝 Contributing

PRs and issues welcome. If you add a feature, please bump `docs/CHANGELOG.md`.

## 📄 License

MIT © 2026 Sichao Long — see [LICENSE](./LICENSE).

---

_Not affiliated with Monash University. Built for personal educational use — please respect the university's terms of use and copyright._
