# 📚 Monash Moodle Downloader

> One-click batch download for Monash University Moodle course resources — auto-sorted by week. Stop right-clicking 40 PDFs the night before finals. 😮‍💨

[![Version](https://img.shields.io/badge/version-4.4.0-6366f1)](./docs/CHANGELOG.md)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-8b5cf6)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](./LICENSE)

---

## ✨ What it does

- 🎯 **Two scan modes** — Unit Dashboard (grab everything, every week) or single Week page (just this week, thanks)
- 📁 **Auto-foldered** — files land in `Week 1/`, `Week 2/`, … so your Downloads folder stays sane
- 📄 **Handles the usual suspects** — PDF, PPT, DOC, MP4; Panopto and external links get saved as `.url` shortcuts
- 🌐 **Bilingual UI** — English by default, one-click switch to 中文
- ⚡ **Sidebar-powered** — pulls every resource from the course index without navigating away

## 🚀 Install

1. Clone or download this repo:
   ```bash
   git clone https://github.com/<your-username>/monash-moodle-downloader.git
   ```
2. Open `chrome://extensions/` in Chrome
3. Flip on **Developer mode** (top-right)
4. Click **Load unpacked** → pick the project folder
5. Pin the extension icon to your toolbar and you're done 🎉

## 📖 How to use

**On a Unit Dashboard** — Click the icon → **Scan** → **Download All**
Downloads everything published across every week into:
```
Downloads/<Full Course Name>/Week 1/…
Downloads/<Full Course Name>/Week 2/…
```

**On a single Week page** — Same three clicks. Only that week downloads, into:
```
Downloads/Week N/…
```

**Language toggle** — Hit the `EN / 中文` pill in the header. Your pick sticks.

## 🧩 Under the hood

| Layer | File | Job |
| --- | --- | --- |
| Content script | [`content.js`](./content.js) | Walks the Moodle DOM and returns a structured resource tree |
| Service worker | [`background.js`](./background.js) | Fires off `chrome.downloads.download` tasks with the right folder paths |
| Popup UI | [`popup.html`](./popup.html) / [`popup.js`](./popup.js) / [`popup.css`](./popup.css) | Renders the tree, handles actions, bilingual toggle |

**Scanning, in one paragraph:** On a Unit Dashboard, it finds the `Learning` section in the sidebar, treats each direct child as a week, and flattens nested groups like _Own-time_ / _Real-time_ into that week. On a single Week page, it walks `li[data-sectionid]` and pulls the week number from the title. Both paths converge on the same resource schema, which the service worker then downloads.

## 📂 Project layout

```
moodle-downloader/
├── manifest.json
├── background.js
├── content.js
├── popup.html · popup.css · popup.js
├── icons/
│   └── icon16 · icon48 · icon128.png
└── docs/
    ├── CHANGELOG.md
    ├── INSTALL.md
    └── DEBUG.md
```

## ⚠️ Known quirks

- Panopto videos can only be saved as `.url` shortcuts — CORS blocks direct download 😔
- Collapsed sidebar sections aren't scanned; expand them first if needed
- If sub-folders don't appear after download, check Chrome's "always ask where to save" setting

## 🙏 Credits & acknowledgements

- Icon — <a href="https://www.flaticon.com/free-icons/data" title="data icons">Data icons created by Ivan Abirawa — Flaticon</a>
- Spiritual predecessor — [harsilspatel/moodle-downloader](https://github.com/harsilspatel/moodle-downloader) built the original downloader for Monash's legacy Moodle. This project is a ground-up rewrite for the new (2025+) Moodle UI on Manifest V3. Thanks for lighting the way 🕯️

## 🤝 Contributing

PRs and issues welcome. If you add a feature, please bump `docs/CHANGELOG.md`.

## 📄 License

MIT © 2026 Sichao Long — see [LICENSE](./LICENSE).

---

_Not affiliated with Monash University. Built for personal educational use — please respect the university's terms of use and copyright._
