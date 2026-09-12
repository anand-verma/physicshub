# Physics PYQ Repository — UPSC PhysicsHub

Static, client-side UPSC Physics Optional PYQ repository, preparation tracker, and QCAB test generator for CSE and IFoS.

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
  - [Zero-Server & Client-Side Design](#zero-server--client-side-design)
  - [Granular Cache Policy & Versioning](#granular-cache-policy--versioning)
- [Modules & Subsystems](#modules--subsystems)
  - [1. Main PYQ Repository (`/index.html`)](#1-main-pyq-repository-indexhtml)
  - [2. Analysis & Hybrid Retrieval Engine](#2-analysis--hybrid-retrieval-engine)
  - [3. Question-cum-Answer Booklet (QCAB) Test Builder (`/qcab/`)](#3-question-cum-answer-booklet-qcab-test-builder-qcab)
  - [4. Preparation & Revision Tracker (`/tracker/`)](#4-preparation--revision-tracker-tracker)
  - [5. Short Notes & Formula Sheets (`/notes/`)](#5-short-notes--formula-sheets-notes)
  - [6. Offline Data Processing & Pipelines (`/scripts/`)](#6-offline-data-processing--pipelines-scripts)
- [Repository Structure](#repository-structure)
- [Analysis Engine: Pre-Vectorized Retrieval Pipeline](#analysis-engine-pre-vectorized-retrieval-pipeline)
  - [Vector File Binary Specification](#vector-file-binary-specification)
  - [Rebuilding the Semantic Search Index (Google Colab)](#rebuilding-the-semantic-search-index-google-colab)
- [Local Development & Deployment](#local-development--deployment)

---

## Overview

**UPSC PhysicsHub** is an offline-first, client-side web application providing an archive of ~2,925 previous year questions (PYQs) for the UPSC Civil Services Examination (CSE) and Indian Forest Service Examination (IFoS) Physics Optional.

Key features include:
- **Taxonomy-driven browsing**: Browse questions mapped to the official syllabus taxonomy across Paper I and Paper II.
- **Sub-second hybrid search & analysis**: Fast exact-repetition detection and semantic vector search (`all-MiniLM-L6-v2`) running via WebAssembly in a background Web Worker.
- **QCAB Test generator**: Select, reorder, and export custom test papers into UPSC-formatted Question-cum-Answer Booklets with authentic margins and page allocations.
- **Preparation tracker**: IndexedDB-backed syllabus checklist tracking notes, formula sheets, CSE/IFoS PYQ completion, and revision iterations.
- **Short notes viewer**: Clean Markdown viewer powered by KaTeX and GitHub alert callouts.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client Browser                                │
├───────────────────────────────┬─────────────────────────────────────────┤
│    Main PYQ Repository        │         QCAB Test Builder               │
│  - Filter / Smart Sort Tree   │  - Multi-select & Marks tally           │
│  - Progressive DOM (60/frame) │  - Drag & Drop test reordering          │
│  - IntersectionObserver Math  │  - A4 Page layout & UPSC Margins        │
├───────────────────────────────┼─────────────────────────────────────────┤
│    Hybrid Retrieval Engine    │       Preparation Tracker               │
│  - Exact repetition hashing   │  - Unit & Section progress tree         │
│  - Lexical TF-IDF cosine score│  - Color-coded revision counts (0-4+)   │
│  - Web Worker + MiniLM (WASM) │  - IndexedDB persistence                │
├───────────────────────────────┼─────────────────────────────────────────┤
│    Short Notes & Formulas     │         Browser Storage                 │
│  - Marked.js + KaTeX viewer   │  - IndexedDB: Bookmarks & Progress      │
│  - Sequential prev/next nav   │  - SessionStorage: Active QCAB Test     │
└───────────────────────────────┴─────────────────────────────────────────┘
```

### Zero-Server & Client-Side Design
- **No Backend**: All search, filtering, vector mathematics, rendering, and state management run client-side using Vanilla ES Modules (`<script type="module">`).
- **Zero API Dependency**: There is no runtime generative LLM and no server API call needed to use the application.
- **Privacy & Portability**: User bookmarks, selections, and tracker progress remain stored in the user's browser storage.

### Granular Cache Policy & Versioning
Managed via `assets/js/config.js`:
- The master configuration (`CONFIG`) controls asset version tags for styles, modules, and datasets (`questions.json`, `syllabus.json`, `analysis-vectors.bin`, etc.).
- `CONFIG.assetUrl(path, assetKey)` automatically generates cache-busting URLs (`?v=...`) to ensure immediate client updates when datasets are redeployed without requiring users to clear browser caches.

---

## Modules & Subsystems

### 1. Main PYQ Repository (`/index.html`)

- **Progressive DOM Rendering**: To handle 2,900+ questions without frame drops, `app.js` splits rendering into chunks of 60 items mounted per animation frame (`requestAnimationFrame`).
- **Viewport-Aware MathJax Typesetting**: An `IntersectionObserver` with a 700px margin observes questions as they approach the viewport and triggers MathJax 3 SVG rendering via a sequential Promise queue.
- **Taxonomy Hierarchical Sorting**: Questions can be browsed by **Year + Unit** or **Unit + Section + Topic**. The "Smart order" sorting groups items along syllabus taxonomy first, followed by year descending (CSE prioritized before IFoS).
- **Rich-Text Clipboard Copy**: Clicking the copy action fetches any referenced image diagrams in the question, encodes them as Base64 Data URLs, and writes both formatted HTML and Markdown into the system clipboard for one-click pasting into Word, OneNote, or ChatGPT.
- **IndexedDB Bookmarks**: Questions can be bookmarked at any time. The bookmarks store operates on a dedicated `PhysicsHubBookmarks` IndexedDB database, with full deep-linking support (`?bookmarks=1`).

### 2. Analysis & Hybrid Retrieval Engine

When the user clicks the **Analysis** button on any question:
1. **Full-Repository Scope**: The engine searches the entire question archive independently of active page filters.
2. **Exact Repetition**: Questions with matching normalized canonical text are grouped together. The question text is rendered once, followed by all corresponding years, exams, and marks.
3. **Lexical Retrieval (TF-IDF)**: Matches keywords against build-time postings and precomputed document norms (`data/analysis-index.json`).
4. **Formula Matching**: Extracts TeX mathematical expressions, normalizes symbols, and calculates a formula overlap score.
5. **Semantic Inference (Web Worker)**:
   - `assets/js/analysis-worker.js` runs in a background thread using `@huggingface/transformers` (`all-MiniLM-L6-v2` quantized to 8-bit Q8 on WebAssembly).
   - The browser embeds **only the clicked question**, then computes cosine similarity across the 2,900+ precomputed float32 vectors in `data/analysis-vectors.bin`.
6. **Hybrid Fusion**:
   $$\text{Score} = 0.57 \times \text{Semantic} + 0.25 \times \text{Lexical} + 0.10 \times \text{Formula} + 0.05 \times \text{Jaccard} + \text{Taxonomy Proximity}$$

### 3. Question-cum-Answer Booklet (QCAB) Test Builder (`/qcab/`)

- **Selection (`qcab/index.html`, `qcab-selection.js`)**: Search, filter, and multi-select questions. Live summary tallies total questions, total marks, and paper composition (e.g., `10M × 3 · 15M × 2`).
- **Test Editor (`qcab/qcab-test.html`, `qcab-test.js`)**: Interactive drag-and-drop ordering and quick move/delete controls. Test state is maintained in `sessionStorage` (`physicshub.qcab.selection.v2`).
- **Print Engine (`qcab/print.html`, `qcab-print.js`)**:
  - **Question List Pages**: Dynamically calculates DOM height to paginate the test questions across 1 or more cover pages before the answer sheets.
  - **Dynamic Answer Pages**: Dynamically calculates required blank answer sheets per question based on marks:
    $$\text{Answer Pages} = \max\left(1, \left\lceil \frac{\text{Marks}}{6} \right\rceil\right)$$
  - **UPSC Margin Formatting**: Renders A4 page borders with official margin lines and text: *"Candidates must not write on this margin"*.

### 4. Preparation & Revision Tracker (`/tracker/`)

- **State Persistence**: Uses the `PhysicsHubTracker` IndexedDB database (`progress` store) to track progress across sessions.
- **Syllabus Hierarchy**: Ingests `data/syllabus.json` to produce an interactive checklist for all units and sections in Paper I and Paper II.
- **Tracking Dimensions**:
  - Unit level: Formula Sheet completion.
  - Section level: Short Notes, CSE PYQs solved, IFoS PYQs solved.
  - Revision Counter: Increment/decrement counter supporting 0 to 4+ iterations with color-coded badges (`rev-0` to `rev-4`).
- **Real-Time Aggregates**: Displays live completion percentages, category ratios, and unit-by-unit averages.

### 5. Short Notes & Formula Sheets (`/notes/`)

- **Manifest Architecture**: `notes/notes-manifest.json` tracks available short notes and formula sheets across all syllabus sections.
- **Fast Lightweight Rendering**: Employs `marked.js` with **KaTeX auto-render** for immediate equation rendering without the heavier initialization footprint of full SVG MathJax.
- **GitHub-Style Alerts**: Parses blockquotes (`> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, etc.) into styled callout components.
- **Sequential Navigation**: Automatically constructs previous and next section buttons based on syllabus order.

### 6. Offline Data Processing & Pipelines (`/scripts/`)

- **`build_search_index.py`**:
  - Reads `data/questions.json` and `data/syllabus.json`.
  - Normalizes text and mathematical expressions.
  - Generates inverted TF-IDF postings and document norms (`analysis-index.json`).
  - Uses PyTorch and `sentence-transformers/all-MiniLM-L6-v2` to precompute 384-dimensional embeddings into `analysis-vectors.bin`.
- **`pyq_topic_tagger.py`**: Batch AI pipeline utilizing the Google GenAI SDK (`gemini-3.5-flash-lite`) to classify questions against official syllabus topics.
- **`pyq_json_cleaner.py`**: AI-powered script to correct OCR errors, standardize LaTeX expressions, and validate image attachments.
- **`pyq_repository_processor.py`**: Validates taxonomy consistency and generates deterministic display IDs (e.g. `PH-U1-S1-CSE2026-01`).

---

## Repository Structure

```text
PhysicsHub/
├── assets/
│   ├── favicon.jpg
│   ├── site.css                   # Global design tokens, navigation, dropdowns
│   ├── styles.css                 # Main PYQ repository layout and components
│   └── js/
│       ├── config.js              # Release versions, asset tags, cache policies
│       ├── data.js                # Dataset fetchers and syllabus hierarchy builder
│       ├── filters.js             # Filter state management, dynamic options, sorting
│       ├── renderer.js            # Markdown-to-HTML parser, MathJax hooks, clipboard
│       ├── bookmarks.js           # IndexedDB bookmark storage manager
│       ├── analysis.js            # Hybrid scoring, exact match, lexical search
│       ├── analysis-worker.js     # Transformers.js WASM embedding Web Worker
│       ├── site.js                # Shared site header, mobile menu, scroll-to-top
│       └── app.js                 # Main application orchestrator
├── data/
│   ├── questions.json             # UPSC Physics PYQ dataset
│   ├── syllabus.json              # UPSC Physics syllabus taxonomy
│   ├── analysis-index.json        # Precomputed TF-IDF index & doc norms
│   ├── analysis-vectors.bin       # Precomputed MiniLM float32 binary vectors
│   └── images/                    # Question figures and diagrams
├── notes/
│   ├── index.html                 # Notes hub page (Paper I & Paper II)
│   ├── viewer.html                # Markdown notes viewer
│   ├── notes.css                  # Notes styles, KaTeX layout, alerts
│   ├── notes-manifest.json        # Content mapping manifest
│   ├── notes-index.js             # Notes index renderer
│   ├── notes.js                   # Markdown fetcher & KaTeX integration
│   └── content/                   # Markdown note files organized by unit
├── qcab/
│   ├── index.html                 # Question selection view
│   ├── qcab-test.html             # Test arrangement and editor view
│   ├── print.html                 # UPSC-formatted printable booklet
│   ├── qcab.css                   # QCAB styling & print page media queries
│   ├── qcab-selection.js          # Selection table controller
│   ├── qcab-state.js              # Session storage and marks calculator
│   ├── qcab-test.js               # Test reordering and drag-and-drop controller
│   └── qcab-print.js              # A4 pagination and margin layout builder
├── tracker/
│   ├── index.html                 # Preparation tracking dashboard
│   ├── tracker.css                # Tracker table and revision badge styling
│   └── tracker.js                 # IndexedDB progress state & aggregate logic
├── scripts/
│   ├── build_search_index.py      # Vector & TF-IDF indexing script
│   ├── pyq_topic_tagger.py        # Gemini-assisted syllabus topic classifier
│   ├── pyq_json_cleaner.py        # Gemini-assisted OCR & LaTeX cleaner
│   └── pyq_repository_processor.py# Taxonomy mapper & ID assigner
├── build_search_index_colab.py    # Self-contained Colab search index generator
├── requirements-search-colab.txt  # Dependencies for Colab indexing
├── index.html                     # Primary entry point (PYQ Repository)
└── README.md                      # Project documentation
```

---

## Analysis Engine: Pre-Vectorized Retrieval Pipeline

### Vector File Binary Specification

`data/analysis-vectors.bin` uses a custom binary structure:

| Offset | Type | Field | Description |
|---|---|---|---|
| `0x00` | `uint32` (little-endian) | `magic` | `0x50585631` (ASCII `"PXV1"`) |
| `0x04` | `uint32` (little-endian) | `version` | `1` |
| `0x08` | `uint32` (little-endian) | `rows` | Number of question vectors (e.g. `2925`) |
| `0x0C` | `uint32` (little-endian) | `dimensions` | Vector dimensionality (`384` for MiniLM) |
| `0x10` | `float32[...]` | `vectors` | Contiguous array of length `rows * dimensions` |

The browser loads this binary file into an `ArrayBuffer` and accesses it via a `Float32Array` view starting at byte offset 16.

### Rebuilding the Semantic Search Index (Google Colab)

Whenever `data/questions.json` is modified or updated:

1. Open a new notebook in [Google Colab](https://colab.research.google.com/) (free GPU or CPU runtime).
2. Upload `build_search_index_colab.py`.
3. Run the script:
   ```python
   !python build_search_index_colab.py
   ```
4. Upload your current `questions.json` when prompted.
5. The script will automatically compute vectors and download three files:
   - `analysis-index.json`
   - `analysis-vectors.bin`
   - `analysis-index-status.json`
6. Copy these three files into `PhysicsHub/data/` and commit/deploy.

---

## Local Development & Deployment

Because ES modules and Web Workers are subject to CORS restrictions on the `file://` protocol, run a local HTTP server for testing:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .
```

Then visit `http://localhost:8000`.

### Production Deployment
The repository can be deployed directly as static files to GitHub Pages, Cloudflare Pages, Vercel Static, or Netlify with zero build step.
