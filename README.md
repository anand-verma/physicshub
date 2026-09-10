# Physics PYQ Repository — PhysicsHub

Static, client-side UPSC Physics Optional PYQ repository for CSE and IFoS.

## Analysis — build-time pre-vectorized architecture

The **Analysis** button searches the complete repository, independent of the active filters.

**WebLLM is not used.** There is no generative LLM and no server/API dependency.

### Retrieval pipeline

1. **Exact repetition** — normalized question text is grouped deterministically. The exact question is displayed only once, followed by every CSE/IFoS appearance with its **year and marks**.
2. **Pre-indexed lexical retrieval** — TF-IDF postings, document norms and formula fingerprints are generated at build time.
3. **Formula matching** — mathematical expressions receive an explicit fusion signal.
4. **Semantic vectors** — `all-MiniLM-L6-v2` embeddings for the complete repository are generated once at build time and stored as a compact binary file.
5. **Query-time semantic inference** — the browser embeds **only the clicked question**, not the complete repository.
6. **Hybrid fusion** — semantic similarity + TF-IDF + token overlap + formula overlap + unit/section proximity are combined for ranking.
7. **Web Worker** — query embedding and vector scoring run off the main UI thread.
8. **Browser/server cache** — the static vector file can be cached by the browser/server, while Transformers.js caches the runtime model assets.

## Recommended build method: Google Colab

The repository is designed so you do **not** need Python, PyTorch or sentence-transformers on your own computer.

Whenever `data/questions.json` changes, open Google Colab and upload:

```text
build_search_index_colab.py
```

Then run:

```python
!python build_search_index_colab.py
```

The script will:

1. Install `sentence-transformers` and `numpy` in the Colab runtime.
2. Ask you to upload your current **`questions.json`**.
3. Load `sentence-transformers/all-MiniLM-L6-v2`.
4. Generate one 384-dimensional normalized vector for every PYQ.
5. Build the exact/TF-IDF/formula index.
6. Generate these files:

```text
analysis-index.json
analysis-vectors.bin
analysis-index-status.json
```

7. Automatically download the generated files to your computer.

Copy all three files into:

```text
PhysicsHub/data/
```

Then deploy the PhysicsHub folder normally.

### Colab-only requirements

`requirements-search-colab.txt` is provided for reference. The Colab script installs the dependencies automatically, so you normally do not need to run a separate pip command.

### Why build-time vectors?

The browser should never spend the first Analysis click embedding 2,900+ PYQs.

Build time:

```text
questions.json
      ↓
MiniLM
      ↓
2,925 repository vectors
      ↓
analysis-vectors.bin
```

Runtime:

```text
Click Analysis
      ↓
Embed ONE query question
      ↓
Compare with precomputed vectors
      ↓
Hybrid ranking
      ↓
Show results
```

This removes the previous first-search bottleneck.

## Vector file format

`analysis-vectors.bin` contains:

```text
uint32 magic       = PXV1
uint32 version     = 1
uint32 rows
uint32 dimensions
float32[rows * dimensions]
```

For `all-MiniLM-L6-v2`, dimensions are 384.

The browser validates the row count and vector dimension before using the file.

## Exact vs related PYQs

Analysis intentionally distinguishes two cases:

### Exact repetition

The full question is shown once, then all appearances are grouped:

```text
Exact repetition
Consider a particle ...

CSE: 2018 (15 M), 2022 (20 M)
IFoS: 2021 (15 M)
```

There is no unnecessary duplicate question card for each repetition.

### Related PYQs

Conceptually related questions are listed separately. Each result contains its **full question**, exam, year and marks.

The current filter selection does not restrict Analysis; it searches the full repository.

## Updating the index

After adding/editing/removing PYQs:

1. Upload the new `questions.json` to Colab.
2. Run `build_search_index_colab.py` again.
3. Replace the three generated files in `PhysicsHub/data/`.
4. Redeploy.

The question fingerprint in `analysis-index-status.json` lets the runtime detect whether the semantic index belongs to the current question repository.

## Local/static deployment

Python is **not required for deployment**. It is required only in Google Colab when rebuilding the search index.

The `PhysicsHub/` directory can be deployed directly to GitHub Pages, Netlify, Vercel Static, Cloudflare Pages, or another static web server.

Browsers restrict module/fetch access from `file://`, so local testing should use a static server.

```bash
python -m http.server
```

## Files

```text
PhysicsHub/
├── assets/
│   ├── js/
│   │   ├── analysis.js
│   │   ├── analysis-worker.js
│   │   └── ...
│   └── styles.css
├── data/
│   ├── questions.json
│   ├── syllabus.json
│   ├── analysis-index.json
│   └── analysis-index-status.json
├── build_search_index_colab.py
├── requirements-search-colab.txt
└── index.html
```
