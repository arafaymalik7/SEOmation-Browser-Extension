# SEOmation Browser Extension

SEOmation is a browser extension for on-page SEO review. It runs fully in the browser and is not coupled to the SEOmation web app.

## Features

- Audit the active page for metadata, headings, keyword density, readability, image alt coverage, internal/external links, and broken links
- Compare multiple URLs side by side using the same rule-based analyzer
- Respect `robots.txt` during competitor fetches and background link checking
- Extract emails from the current page and export them as CSV or JSON
- Export audit and comparison reports as PDF
- Save audit and comparison reports locally in browser storage

## Stack

- Manifest V3
- TypeScript
- React
- Vite
- `pdf-lib`

## Project Structure

```text
.
├── icons/
├── src/
│   ├── background/
│   ├── content/
│   ├── popup/
│   └── shared/
├── manifest.json
├── package.json
├── popup.html
├── tsconfig.json
└── vite.config.mjs
```

## Local Setup

### Requirements

- Node.js 20+
- npm 10+

### Install

```bash
npm install
```

### Type Check

```bash
npm run typecheck
```

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run dev
```

## Load Unpacked Extension

After `npm run build`, load the generated `dist/` folder in your browser.

### Chrome / Edge

1. Open `chrome://extensions` or `edge://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder:

```text
<repo-root>/dist
```

### Firefox

This project targets MV3. Firefox support depends on current MV3 support in the Firefox version you test against. For local testing you can package from `dist/` with `web-ext` if needed.

## Notes

- The extension is local-first. It does not send page content to a backend.
- Email extraction supports copy and export only. It does not persist extracted emails.
- Host permissions are currently broad (`*://*/*`) to support page comparison and link checking. These can be narrowed later before store submission.
- Broken link checks are intentionally capped and configurable to avoid heavy scans.

## Prepare GitHub Repository

If you want this folder to become its own GitHub repository:

```bash
git init -b main
git add .
git commit -m "Initial standalone extension repo"
git remote add origin <your-github-repo-url>
git push -u origin main
```

## Publish Workflow

1. Run `npm install`
2. Run `npm run typecheck`
3. Run `npm run build`
4. Load `dist/` unpacked and test the main flows:
   - Audit Current Page
   - Compare Pages
   - Extract Emails
   - Export PDF
   - Save / view local reports

