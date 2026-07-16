This is a vibe coded app I made to help with arabic vocab study for the Andalus arabic program. Here is the vibe coded README

# Thabit
Thabit is a small Arabic vocabulary trainer built around lessons, batches, and review. It is tuned for working through textbook vocabulary a little at a time: nouns, phrases, and verb families each get their own study flow, then come back in short tests and review sessions.

The app runs fully in the browser. Progress, batch state, streaks, and missed items are kept locally.

## What it does

- Breaks each lesson into manageable vocabulary batches
- Drills new words with exposure, memory match, multiple choice, and writing tests
- Treats verbs as families during exposure and larger tests, while still drilling individual forms inside a batch
- Uses cropped Arabic images from the source material when text rendering would be unreliable
- Builds as a PWA so it can be used offline after the vocabulary assets are cached

## Running it

Install dependencies:

```sh
npm install
```

Start the dev server:

```sh
npm run dev
```

Build for production:

```sh
npm run build
```

## Netlify deployment

This repository includes `netlify.toml`, so Netlify can build and deploy it without extra configuration:

- Build command: `npm run build`
- Publish directory: `dist`
- Node version: 22

For automatic updates, import the GitHub repository into Netlify. Every push to `master` will build and deploy the latest version at the same HTTPS URL.

For a manual production deploy from this computer:

```sh
npm run deploy:netlify
```

Preview a production build without the service worker:

```sh
npm run preview
```

For testing on a phone on the same WiFi:

```sh
npm run dev:phone
```

This builds the app once, then serves a **single bundled file** on port **4173** (not the dev server on 5173). The raw dev server sends thousands of small files and usually hangs or never finishes on a phone.

Open the URL printed in the terminal **in Safari** — it will look like `http://10.x.x.x:4173/`. Use **http**, not https.

After you change code, run `npm run dev:phone` again to rebuild.

Do not use a home-screen icon while testing locally.

For a production-like build without a service worker:

```sh
npm run preview:phone:http
```

## Vocabulary data

Lesson data lives in `vocabulary/`. Each lesson folder has CSV files for nouns, verbs, and phrases, plus image assets used by the UI. See `vocabulary/README.md` for the CSV schemas and extraction notes.

The app reads those files at build time through Vite, so changing vocabulary usually just means editing the CSVs or replacing the linked images, then restarting the dev server.

## Project layout

- `src/data.ts` loads lesson CSVs and creates the lesson roadmap
- `src/exposure-cards.ts` turns nouns, phrases, and verb families into study cards
- `src/study-queue.ts` builds the quiz and writing queues
- `src/main.tsx` contains the main screens and study flow
- `src/review.ts` handles review scheduling
- `src/config.ts` holds batch sizes, timers, and repetition counts

## Notes

This is intentionally a local-first study app. There is no account system and no server sync. If you clear browser storage, you clear your progress.
