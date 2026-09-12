# ============================================================
# PhysicsHub — build_search_index.py
# Google Colab READY
#
# Run this single file in Google Colab. It will:
#   1. ask you to upload questions.json
#   2. build exact/canonical + TF-IDF + formula index
#   3. generate all-MiniLM-L6-v2 vectors
#   4. write a headered analysis-vectors.bin
#   5. package the runtime files into a downloadable ZIP
#
# NO WebLLM
# NO API
# NO server
# ============================================================

import sys
import subprocess

subprocess.check_call([
    sys.executable, "-m", "pip", "install", "-q",
    "sentence-transformers>=3.0,<6",
    "numpy>=1.26,<3"
])

import hashlib
import json
import math
import re
import struct
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

from google.colab import files


MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
VECTOR_DIMENSIONS = 384
VECTOR_MAGIC = 0x50585631  # ASCII "PXV1"
VECTOR_VERSION = 1

STOPWORDS = set("""
a an and are as at be been being by can could did do does for from had has have
how i if in into is it its may more most of on or our should than that the their
them then there these they this to under was we were what when where which who why
will with would you your
""".split())


def normalize_text(value):
    import unicodedata

    text = unicodedata.normalize(
        "NFKC",
        str(value or "")
    )

    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(
        r"!\[[^\]]*\]\([^)]*\)",
        " ",
        text
    )
    text = re.sub(
        r"\[([^\]]+)\]\([^)]*\)",
        r"\1",
        text
    )

    text = text.lower()

    text = re.sub(
        r"\\(?:left|right|rm|mathbf|mathrm|text|vec|hat|bar|cdot|times|frac|dfrac|sqrt|operatorname)\b",
        " ",
        text
    )

    text = re.sub(
        r"\\[a-z]+",
        " ",
        text
    )

    text = re.sub(
        r"[^a-z0-9]+",
        " ",
        text
    )

    return re.sub(
        r"\s+",
        " ",
        text
    ).strip()


def tokenize(value):
    return [
        token
        for token in normalize_text(value).split()
        if len(token) > 1 and token not in STOPWORDS
    ]


def canonical_text(value):
    """
    Conservative canonical representation for exact repetition.

    Removes formatting, markdown, question numbering, exam/year/marks
    noise, and LaTeX command syntax while preserving physics wording.
    """

    text = str(value or "")

    text = re.sub(r"<[^>]+>", " ", text)

    text = re.sub(
        r"!\[[^\]]*\]\([^)]*\)",
        " ",
        text
    )

    text = re.sub(
        r"\[([^\]]+)\]\([^)]*\)",
        r"\1",
        text
    )

    text = re.sub(
        r"[*_~`]",
        "",
        text
    )

    text = re.sub(
        r"\\[,;!: ]",
        "",
        text
    )

    text = re.sub(
        r"\$\$|\$|\\\(|\\\)|\\\[|\\\]",
        " ",
        text
    )

    # Handles:
    # (i), (ii)
    # - (i), * (i), • (i)
    # 1., 2.
    text = re.sub(
        r"(^|\n)\s*(?:[-*•]\s*)?"
        r"\((?:i{1,3}|iv|v|vi{0,3})\)\s*",
        r"\1",
        text,
        flags=re.I
    )

    text = re.sub(
        r"(^|\n)\s*(?:[-*•]\s*)?"
        r"\d+\s*[\.\):\-]\s*",
        r"\1",
        text
    )

    text = re.sub(
        r"\b(?:cse|ifos)\b",
        " ",
        text,
        flags=re.I
    )

    text = re.sub(
        r"\b(?:19|20)\d{2}\b",
        " ",
        text
    )

    text = re.sub(
        r"\b\d+\s*m(?:arks?)?\b",
        " ",
        text,
        flags=re.I
    )

    return normalize_text(text)


def formula_normalize(value):
    return (
        str(value or "")
        .lower()
        .replace("−", "-")
        .replace("·", "*")
        .replace("×", "*")
    )


def extract_formulas(value):
    formulas = []

    pattern = (
        r"(\$\$[\s\S]*?\$\$|"
        r"\$[^$\n]+\$|"
        r"\\\([\s\S]*?\\\)|"
        r"\\\[[\s\S]*?\\\])"
    )

    for match in re.findall(
        pattern,
        str(value or "")
    ):
        formula = formula_normalize(match)

        formula = re.sub(
            r"\\(?:left|right|rm|mathrm|mathbf|vec|hat|bar|cdot|times|frac|dfrac|sqrt|text)\b",
            "",
            formula
        )

        formula = re.sub(
            r"[\s{}$()[\]]+",
            "",
            formula
        )

        formula = re.sub(
            r"[^a-z0-9=+\-*/^.,_:<>]",
            "",
            formula
        )

        if len(formula) >= 3:
            formulas.append(formula)

    return sorted(set(formulas))


def corpus_text(question):
    topics = question.get("syllabus_topic") or []

    if not isinstance(topics, list):
        topics = [topics]

    return " ".join([
        str(question.get("question_markdown", "")),
        str(question.get("unit", "")),
        str(question.get("section", "")),
        *[str(topic) for topic in topics]
    ])


def repository_fingerprint(questions):
    payload = [
        (
            q.get("id"),
            q.get("question_markdown", ""),
            q.get("exam"),
            q.get("year"),
            q.get("marks"),
            q.get("unit"),
            q.get("section"),
            q.get("syllabus_topic", [])
        )
        for q in questions
    ]

    raw = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":")
    )

    return hashlib.sha256(
        raw.encode("utf-8")
    ).hexdigest()


def build_index(questions):

    documents = []
    exact_groups = defaultdict(list)
    formula_list = []

    for index, question in enumerate(questions):

        text = question.get(
            "question_markdown",
            ""
        )

        if not text:
            raise ValueError(
                f"Question {index} has an empty question_markdown."
            )

        corpus = corpus_text(question)
        documents.append(tokenize(corpus))

        key = canonical_text(text)

        if len(key) >= 18:
            exact_groups[key].append(index)

        formula_list.append(
            extract_formulas(text)
        )

    # --------------------------------------------------------
    # TF-IDF
    # --------------------------------------------------------

    document_frequency = Counter()

    for tokens in documents:
        document_frequency.update(set(tokens))

    count = len(documents)

    idf = {
        token:
        math.log(
            (count + 1) /
            (frequency + 1)
        ) + 1
        for token, frequency
        in document_frequency.items()
    }

    postings = defaultdict(list)
    document_norms = [0.0] * count

    for doc_index, tokens in enumerate(documents):

        frequencies = Counter(tokens)
        squared_sum = 0.0

        for token, frequency in frequencies.items():

            weight = (
                (1 + math.log(frequency))
                * idf[token]
            )

            squared_sum += weight * weight

            postings[token].append([
                doc_index,
                round(weight, 6)
            ])

        document_norms[doc_index] = round(
            math.sqrt(squared_sum) or 1.0,
            6
        )

    exact_groups_list = [
        indices
        for indices in exact_groups.values()
        if len(indices) > 1
    ]

    return {
        "version": 4,
        "count": count,
        "questionFingerprint": repository_fingerprint(
            questions
        ),

        "embeddingModel": MODEL_NAME,
        "embeddingDimensions": VECTOR_DIMENSIONS,

        "documents": [
            {
                "id": str(q["id"]),
                "question": q["question_markdown"],
                "exam": q["exam"],
                "year": q["year"],
                "marks": q["marks"],
                "unit": q["unit"],
                "section": q["section"],
                "syllabus_topic": q.get(
                    "syllabus_topic",
                    []
                ),
                "exact_key": canonical_text(
                    q["question_markdown"]
                ),
                "formulas": formula_list[i]
            }
            for i, q in enumerate(questions)
        ],

        "exactGroups": exact_groups_list,

        "tfidf": {
            "idf": idf,
            "postings": dict(postings),
            "docNorms": document_norms
        }
    }


def build_vectors(questions, output_path):

    from sentence_transformers import SentenceTransformer
    import numpy as np

    print()
    print("=" * 72)
    print("Loading:", MODEL_NAME)
    print("=" * 72)
    print()

    model = SentenceTransformer(
        MODEL_NAME,
        device="cpu"
    )

    texts = [
        corpus_text(question)
        for question in questions
    ]

    print(
        f"Generating vectors for "
        f"{len(texts):,} PYQs..."
    )
    print()

    embeddings = model.encode(
        texts,
        batch_size=64,
        show_progress_bar=True,
        normalize_embeddings=True,
        convert_to_numpy=True
    )

    embeddings = np.asarray(
        embeddings,
        dtype=np.float32,
        order="C"
    )

    if embeddings.ndim != 2:
        raise RuntimeError(
            f"Unexpected embedding shape: "
            f"{embeddings.shape}"
        )

    if embeddings.shape[0] != len(questions):
        raise RuntimeError(
            "Vector count does not match "
            "question count."
        )

    if embeddings.shape[1] != VECTOR_DIMENSIONS:
        raise RuntimeError(
            f"Expected {VECTOR_DIMENSIONS} dimensions, "
            f"got {embeddings.shape[1]}."
        )

    # --------------------------------------------------------
    # PXV1:
    #
    # uint32 magic
    # uint32 version
    # uint32 row count
    # uint32 dimensions
    # float32[row_count * dimensions]
    # --------------------------------------------------------

    with open(
        output_path,
        "wb"
    ) as file:

        file.write(
            struct.pack(
                "<IIII",
                VECTOR_MAGIC,
                VECTOR_VERSION,
                embeddings.shape[0],
                embeddings.shape[1]
            )
        )

        file.write(
            embeddings.tobytes(
                order="C"
            )
        )

    print()
    print(
        f"Vector file: {output_path}"
    )

    print(
        f"Size: "
        f"{output_path.stat().st_size / 1024 / 1024:.2f} MiB"
    )


def main():

    print("=" * 72)
    print("PhysicsHub — Analysis Index Builder")
    print("Google Colab")
    print("No WebLLM • No API • Client-side runtime")
    print("=" * 72)
    print()

    print(
        "Please upload your current "
        "questions.json file."
    )
    print()

    uploaded = files.upload()

    if not uploaded:
        raise RuntimeError(
            "No file was uploaded."
        )

    if "questions.json" in uploaded:

        filename = "questions.json"

    else:

        candidates = [
            name
            for name in uploaded
            if name.lower().endswith(".json")
        ]

        if not candidates:
            raise RuntimeError(
                "Please upload questions.json."
            )

        filename = candidates[0]

    questions_path = Path(
        "questions.json"
    )

    questions_path.write_bytes(
        uploaded[filename]
    )

    with open(
        questions_path,
        "r",
        encoding="utf-8"
    ) as file:

        questions = json.load(file)

    if (
        not isinstance(questions, list)
        or not questions
    ):

        raise RuntimeError(
            "questions.json must contain "
            "a non-empty top-level array."
        )

    # Validate the exact PhysicsHub schema.
    required = [
        "id",
        "exam",
        "year",
        "marks",
        "question_markdown",
        "unit",
        "section",
        "syllabus_topic"
    ]

    for i, question in enumerate(
        questions
    ):

        if not isinstance(question, dict):
            raise RuntimeError(
                f"Question {i} is not a JSON object."
            )

        missing = [
            field
            for field in required
            if field not in question
        ]

        if missing:
            raise RuntimeError(
                f"Question {i} "
                f"({question.get('id', 'NO-ID')}) "
                f"is missing: {missing}"
            )

    print()
    print(
        f"Loaded {len(questions):,} PYQs."
    )

    print(
        "Repository fingerprint:",
        repository_fingerprint(
            questions
        )
    )

    print()
    print(
        "Building exact + TF-IDF + formula index..."
    )

    index = build_index(
        questions
    )

    output_dir = Path(
        "physics_hub_analysis_index"
    )

    if output_dir.exists():
        import shutil
        shutil.rmtree(output_dir)

    data_dir = output_dir / "data"
    data_dir.mkdir(
        parents=True,
        exist_ok=True
    )

    index_path = (
        data_dir /
        "analysis-index.json"
    )

    vector_path = (
        data_dir /
        "analysis-vectors.bin"
    )

    index_path.write_text(
        json.dumps(
            index,
            ensure_ascii=False,
            separators=(",", ":")
        ),
        encoding="utf-8"
    )

    build_vectors(
        questions,
        vector_path
    )


    # --------------------------------------------------------
    # Deployment bundle
    # --------------------------------------------------------

    zip_path = Path(
        "physics_hub_analysis_index.zip"
    )

    if zip_path.exists():
        zip_path.unlink()

    with zipfile.ZipFile(
        zip_path,
        "w",
        compression=zipfile.ZIP_DEFLATED
    ) as archive:

        for path in data_dir.iterdir():

            archive.write(
                path,
                arcname=f"data/{path.name}"
            )

    print()
    print("=" * 72)
    print("BUILD COMPLETE")
    print("=" * 72)
    print()
    print(
        f"PYQs:             {len(questions):,}"
    )
    print(
        f"Exact groups:     {len(index['exactGroups']):,}"
    )
    print(
        f"TF-IDF terms:     {len(index['tfidf']['idf']):,}"
    )
    print(
        f"Vector dimensions:{VECTOR_DIMENSIONS}"
    )
    print(
        f"Vector file:      "
        f"{vector_path.stat().st_size / 1024 / 1024:.2f} MiB"
    )
    print(
        f"ZIP:              "
        f"{zip_path.stat().st_size / 1024 / 1024:.2f} MiB"
    )
    print()
    print(
        "Generated deployment files:"
    )
    print(
        "  data/analysis-index.json"
    )
    print(
        "  data/analysis-vectors.bin"
    )
    print()
    print(
        "Downloading deployment bundle..."
    )

    files.download(
        str(zip_path)
    )


if __name__ == "__main__":
    main()
