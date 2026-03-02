#!/usr/bin/env python3
import json
import sys
from typing import Any


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


def fail(code: str, message: str, exit_code: int = 1) -> int:
    emit(
        {
            "ok": False,
            "error": {
                "code": code,
                "message": message,
            },
        }
    )
    return exit_code


def parse_payload() -> tuple[str, list[dict[str, str]], str] | None:
    try:
        payload = json.load(sys.stdin)
    except Exception as error:
        fail("INVALID_INPUT", f"Failed to parse JSON input: {error}")
        return None

    if not isinstance(payload, dict):
        fail("INVALID_INPUT", "Input payload must be a JSON object.")
        return None

    text = payload.get("text")
    candidates = payload.get("candidates")
    model = payload.get("model") or "sentence-transformers/all-MiniLM-L6-v2"

    if not isinstance(text, str) or len(text.strip()) == 0:
        fail("INVALID_INPUT", "text is required and must be a non-empty string.")
        return None
    if not isinstance(model, str) or len(model.strip()) == 0:
        fail("INVALID_INPUT", "model must be a non-empty string.")
        return None
    if not isinstance(candidates, list):
        fail("INVALID_INPUT", "candidates must be an array.")
        return None

    normalized_candidates: list[dict[str, str]] = []
    for row in candidates:
        if not isinstance(row, dict):
            continue
        tag = row.get("tag")
        descriptor = row.get("descriptor")
        if not isinstance(tag, str) or not isinstance(descriptor, str):
            continue
        if len(tag.strip()) == 0 or len(descriptor.strip()) == 0:
            continue
        normalized_candidates.append({"tag": tag.strip(), "descriptor": descriptor.strip()})

    return text, normalized_candidates, model


def run() -> int:
    parsed = parse_payload()
    if parsed is None:
        return 1

    text, candidates, model_name = parsed
    if len(candidates) == 0:
        emit({"ok": True, "scores": []})
        return 0

    try:
        from sentence_transformers import SentenceTransformer
    except Exception as error:
        return fail(
            "DEPENDENCY_MISSING",
            "sentence-transformers is not available. Install dependencies from docs/AUTO_TAGS_SETUP.md."
            f" ({error})",
        )

    try:
        import numpy as np
    except Exception as error:
        return fail("DEPENDENCY_MISSING", f"numpy is not available: {error}")

    try:
        model = SentenceTransformer(model_name)
    except Exception as error:
        return fail("MODEL_LOAD_FAILED", f"Failed to load model '{model_name}': {error}")

    try:
        inputs = [text] + [candidate["descriptor"] for candidate in candidates]
        vectors = model.encode(inputs, normalize_embeddings=True)
        base = vectors[0]
        scores = []
        for idx, candidate in enumerate(candidates):
            candidate_vec = vectors[idx + 1]
            score = float(np.dot(base, candidate_vec))
            scores.append({"tag": candidate["tag"], "score": score})
    except Exception as error:
        return fail("INFERENCE_FAILED", f"Failed while scoring tags: {error}")

    emit({"ok": True, "scores": scores})
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
