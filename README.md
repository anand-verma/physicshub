# Physics PYQ Repository

A static, client-side UPSC Physics Optional PYQ repository for CSE and IFoS.

## Performance architecture
- Questions are fetched once and cached in memory.
- Search text, year and exam rank are precomputed once at startup.
- The source question array is never re-sorted during filtering.
- Filtering is a single linear pass over the cached array.
- Search is debounced by 120 ms.
- Filter dropdowns are rebuilt only when their option signature changes.
- MathJax is **not** typeset for all questions on every interaction. An IntersectionObserver typesets question equations only as rows approach the viewport.
- Images use lazy loading and async decoding.
- All matching questions remain available; rendering is kept lightweight until equations are actually visible.

## Features
- Search questions, topics, units, sections and metadata
- Exam selector: CSE only / IFoS only / CSE + IFoS
- Year + Unit mode
- Unit + Section + Topic mode
- Chronological descending order, with CSE before IFoS for the same year
- MathJax equation rendering
- Question images from `data/images/`
- Copy question to clipboard
- ChatGPT solution link
- Gemini button copies the ready-made solution prompt and opens Gemini. Gemini's public web UI does not expose a stable supported URL parameter for pre-filling arbitrary prompts, so the clipboard-first approach is used instead of silently failing.

## Run locally
Because browsers restrict `fetch()` from `file://`, serve the folder with a static server:

```bash
python -m http.server
```

Then open the shown localhost URL.

## Deployment
The folder can be deployed directly to GitHub Pages, Netlify, Vercel static hosting, Cloudflare Pages, or any static web server.
