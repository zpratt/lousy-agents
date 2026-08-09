# Python adapter and catalogue

Load this file only when `metadata.language` is `python`. This is the authoritative Python adapter and Python-only mutation list. Apply these in addition to the shared catalogue in `SKILL.md`.

## Adapter

- **Package root:** directory of the controlling `pyproject.toml` / `setup.py` / `setup.cfg` / requirements file, else workspace root. Run baseline/test from that root; honor mise/asdf Python pins when present.
- **Baseline/test command:** Prefer `pytest`, or `python -m pytest`; if pytest is absent, use `python -m unittest`. Select the available command before the baseline and use that same command for every mutation.
- **Discovery (default, no `--target`):** all eligible production `*.py` files:

  ```bash
  find . -name "*.py" \
    ! -name "test_*.py" ! -name "*_test.py" \
    ! -path "*/tests/*" ! -path "*/test/*" \
    ! -path "*/testdata/*" ! -path "*/fixtures/*" \
    ! -path "*/__pycache__/*" ! -path "*/migrations/*" \
    ! -path "*/.venv/*" ! -path "*/venv/*" ! -path "*/site-packages/*" \
    ! -name "conftest.py" \
    | sort
  ```

- **When `--target` is set:** expand the glob, then apply the same exclusions.
- **Priority paths, when present:**
  1. Importable package directories: `src/<package>/` (preferred layout) or a top-level package directory that contains `__init__.py` and is not a test/venv tree.
  2. Other modules under `src/` that hold business logic.
  3. Prefer package modules over thin CLI/script entrypoints (`__main__.py`, top-level `cli.py`, `manage.py`) when higher-value packages exist.
- **Exclusions:** `test_*.py`, `*_test.py`, `conftest.py`, files under `tests/`, `test/`, `testdata/`, `fixtures/`, `__pycache__/`, `migrations/`, `.venv/`, `venv/`, `site-packages/`, and generated files.
- **Empty discovery:** abort with a clear error.
- **Default `--target`:** all eligible `*.py` subject to the exclusions above.
- **Runtime/syntax failures:** `SyntaxError` or `ImportError` during the selected test command counts as killed.
- **Return-value zero values:** `None`, `0`, `""`, `False`, `[]`, and `{}` appropriate to the function's result.

## Python-only mutations

| Original | Mutated |
|:---|:---|
| `is` | `is not` |
| `is not` | `is` |
| `in` | `not in` |
| `not in` | `in` |
| `True` | `False` |
| `False` | `True` |
| `and` | `or` |
| `or` | `and` |
| `break` | `continue` |
| `continue` | `break` |

For `if x is None` guards, remove or invert only the defensive early-return as one semantic mutation. Do not combine guard removal with a second edit in the same trial.
