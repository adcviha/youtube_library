# CLAUDE.md

The YouTube Library — a static website that presents YouTube as a Windows 95-themed nested file directory. Replaces the algorithmic home feed with intentional, path-based discovery.

## Tech Stack
- **Frontend:** Plain HTML/CSS/JS + [98.css](https://jdan.github.io/98.css/) for Win95 chrome
- **Hosting:** GitHub Pages (free)
- **Compute:** GitHub Actions on cron (free tier)
- **Storage:** JSON files committed to the repo — no backend, no database
- **APIs:** YouTube Data API v3, GifCities (Internet Archive), Wikipedia page scraping
- **Backend scripts:** Python 3

## Project Conventions
- No frameworks. No build step. No npm. HTML/CSS/JS directly served.
- JSON files are the database. Read them, write them, commit them.
- API keys live in GitHub Actions secrets, never in code or committed files.
- Folder-first ordering everywhere: subfolders alphabetically, then videos alphabetically.
- Video quality score is internal (`_score` field) — never shown in the UI.
- Broken/missing GIFs are acceptable, even welcome. The early-internet aesthetic embraces imperfection.
- No artificial caps on folder contents. A folder with 47 videos shows 47.

## File Structure
```
/
├── index.html              # Desktop entry point — the "My Computer" of the library
├── styles.css              # Win95 theming (98.css) + custom overrides
├── app.js                  # Folder navigation, lazy JSON loading, video embed popup
├── /data/
│   ├── tree.json           # Full folder tree — all nodes, their metadata, child refs
│   └── /folders/
│       ├── Science.json
│       ├── Science/Physics.json
│       └── ... (flat files, path-encoded names)
├── /assets/
│   └── /icons/             # Static Win95 chrome icons (folder, desktop, etc.)
└── /scripts/
    ├── scrape_vital_articles.py   # Build tree.json from Wikipedia Vital Articles
    ├── build_folders.py           # Populate folder contents via YouTube API
    ├── refresh_picks.py           # Weekly editor's picks refresh
    └── find_gifs.py               # Query GifCities, write GIF URLs to folder JSONs
```

## Scripts Quick Reference

### scrape_vital_articles.py (yearly, manual)
Scrapes Wikipedia Vital Articles, builds the folder tree. Assigns editor names to Level 1 categories randomly (one-time, persisted). Outputs `data/tree.json`.

### build_folders.py (weekly cron)
Reads `data/tree.json`, finds folders due for refresh (no `last_updated` or oldest first). For each: searches YouTube with the folder's Wikipedia article title as keyword, filters by `topicCategories` overlap with the folder's wiki URL path, scores results, writes `data/folders/{path}.json`.

### refresh_picks.py (weekly cron)
For each Level 1 category's editor, searches YouTube for recent videos in their territory. Writes to `data/folders/{Category}/{Editor}'s Picks.json`.

### find_gifs.py (runs alongside build_folders)
Queries GifCities API for each folder, writes the best-match GIF URL into the folder's JSON. GIFs are hotlinked from archive.org — not committed to the repo.

## Key Design Decisions
- **tree.json = structure, folder JSONs = content.** tree.json holds the full nested tree with metadata. Per-folder JSONs hold only the video arrays for that node.
- **Videos belong to the most specific matching folder.** A video matching both "Biology" and "Genetics" goes into "Genetics." Editor's Picks are the exception — they pull from anywhere in their category.
- **Quality filter relaxes with depth.** Top-level folders use the full quality score formula. Each level down, the score threshold decreases. Deepest leaves accept any topic-matched video.
- **GIFs are hotlinked, not stored.** Saves repo space. Broken images when archive.org is slow = part of the aesthetic.

## Working Style & Collaboration Protocol

### Code conventions
- **Readable code over clever code.** No minification, no one-liners flexing. Comments explain *why*, not *what*.
- **Hackable.** Someone with intermediate skill in the language should be able to open the source files, find the relevant section, and modify it without setup.
- `const` declarations before any code that uses them, even within a file.
- Functions short and named for what they do.
- Internals exposed on a global for console hacking (e.g. `window.DEBUG`).

### Version incrementing (SemVer)

We use **Major.Minor.Patch** as strings, not decimals. `0.9.10` comes after `0.9.9`.

- **Patch** (0.9.0 → 0.9.1): Bug fixes, polish, small tweaks. No new features.
- **Minor** (0.9.0 → 0.10.0): New feature, tool, or system. This is the only thing that moves the "feature number" forward.
- **Major** (0.9.0 → 1.0.0): Breaking change to the data format, data model, or core workflow.

**DESIGN.md milestones are Minor targets.** When DESIGN.md says "v0.9 — Selection transform," that means the 0.9.x series delivers selection transform. Ship it as `0.9.0`. Bug fixes after that are `0.9.1`, `0.9.2`, etc. Do NOT bump the Minor digit for bug fixes.

Git commits are tagged with the version. Push to master auto-deploys.

### Working protocol (every task, every time)

Before writing any code, follow these four steps in order:

1. **Translate the Vibe.** The user describes behavior in plain English. Before touching code, translate into technical terms and state your approach in one sentence. If the description is ambiguous, ask the one clarifying question that matters most.
2. **Version bump.** State the new version number based on SemVer.
3. **The GO Gate.** List every file you will modify or create. State the plan in 2-3 sentences. Then **stop and wait** for the user to say "GO" before writing any code. Do not output code, diffs, or implementations until you hear "GO."
4. **No reinventing wheels.** If a request can be handled by an existing library method, browser API, or a function already in the codebase, say so and use it.

### When making changes
- Always follow the Working Protocol. Never skip the GO Gate.
- Test in-browser. There is no lint or build step to lean on.
- Don't introduce a build step "to make things cleaner." The build step IS the cost.
- If a feature is getting complex, that's a signal to redesign the workflow, not pile on code.
- Match the user's pace. They are in early prototyping. Don't over-engineer ahead of decisions they haven't made.
- One commit per version increment. Don't batch unrelated changes.

### When to push back
- A user request that would require adding a framework, build chain, or large dependency — flag the tradeoff before doing it.
- A feature that conflicts with the project's stated aesthetic or simplicity targets.
- Anything cascading or recursive (prefabs containing prefabs, nested editors) — the user may explicitly want a flat mental model.

### When to confirm before coding
- The user describes a behavior change imprecisely (vague language, contradictory signals, "I'm not sure how to describe this"). Pause, replay what you understood in your own words, and get explicit confirmation before touching any code.
- Examples: "I'm not exactly sure how to describe that," "it's like... but also...," "I can't imagine exactly without trying," or when they describe a fix but also describe behavior that contradicts the fix.
- Once confirmed, implement exactly what was agreed. Don't add "while I was in there" changes.

## Core Principles (non-negotiable)
1. Path-as-experience. No search bar. No related-video sidebar.
2. The library catalogs — it does not algorithm. Videos sorted alphabetically by title.
3. Win95 file explorer aesthetic. Pixel icons, GeoCities GIFs, folder-first layout.
4. Static architecture, zero hosting cost. No backend server.
5. Hand-framed shell, auto-populated guts. Tree from Wikipedia, content from YouTube.
6. No artificial caps. Asymmetry is honest data about human creative output.
7. Restraint at the folder level — no thumbnails, view counts, durations, or like counts.
8. Imperfection is on-brand. Bad GIFs, miscategorized videos = early-internet discovery feel.
