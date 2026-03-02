# Auto Tags Setup (Local Python Backend)

`stash` auto-tags uses a local Python helper with `sentence-transformers`.

## 1) Install Python dependencies

Recommended Python: `3.11+`

### Recommended (works with Homebrew Python / PEP 668)

Create a small local virtualenv just for auto-tags:

```bash
python3 -m venv .venv-auto-tags
source .venv-auto-tags/bin/activate
python -m pip install --upgrade pip
python -m pip install sentence-transformers numpy torch
```

If `torch` installation differs for your platform, follow official PyTorch install instructions and then install `sentence-transformers`.

### Optional (global install)

If your Python allows global `pip` installs, this also works:

```bash
python3 -m pip install --upgrade pip
python3 -m pip install sentence-transformers numpy torch
```

If you get `error: externally-managed-environment`, use the virtualenv flow above.

## 2) Optional runtime overrides

You can set these in `.env`:

```bash
STASH_AUTO_TAGS_BACKEND=python
STASH_AUTO_TAGS_PYTHON=.venv-auto-tags/bin/python
STASH_AUTO_TAGS_HELPER=./scripts/auto-tags-embed.py
STASH_AUTO_TAGS_MODEL=sentence-transformers/all-MiniLM-L6-v2
STASH_AUTO_TAGS_ENABLED=false
STASH_AUTO_TAGS_MAX=3
STASH_AUTO_TAGS_MIN_SCORE=0.62
```

Notes:
- `STASH_AUTO_TAGS_PYTHON` is optional, but recommended when using a venv.
- Use an absolute path if you run `stash` from different working directories.

## 3) Verify setup

```bash
stash tags doctor --json
```

Expected:
- `healthy: true`
- checks for `python`, `helper_script`, `sentence_transformers`, and `helper_runtime` are `ok: true`

## 4) Usage

```bash
stash save https://example.com --auto-tags --json
stash extract 1 --auto-tags --json
```

Auto-tagging remains opt-in by default unless you set `STASH_AUTO_TAGS_ENABLED=true`.
