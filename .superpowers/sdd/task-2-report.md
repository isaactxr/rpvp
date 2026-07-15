# Task 2 Report: Add Python face-recognition Service

## Status

DONE_WITH_CONCERNS

## Changes

- Created `face-recognition/app.py` with FastAPI endpoints `GET /health`, `POST /encode`, and `POST /recognize`.
- Created `face-recognition/requirements.txt` with FastAPI, Uvicorn, python-multipart, NumPy, face_recognition, and Pillow pins.
- Created `face-recognition/Dockerfile` based on `python:3.11-slim-bookworm` with dlib build/runtime dependencies.

## Verification

Command:

```text
python -m py_compile face-recognition/app.py
```

Result: passed with exit code 0.

Command:

```text
docker build -t rpvp-face-recognition ./face-recognition
```

Result: not run successfully because `docker` is not available in this shell (`docker` command not recognized).

## Concerns

Docker build still needs to be validated in an environment with Docker installed.

## Files Changed

- `face-recognition/app.py`
- `face-recognition/requirements.txt`
- `face-recognition/Dockerfile`

## Review Fix: Candidate Embedding Validation

- Added validation before constructing the NumPy candidate array in `/recognize`.
- Candidate embeddings must contain exactly 128 finite numeric values; invalid data returns HTTP 400 with a clear message.
- Successful `/recognize` response formats are unchanged.

Verification command:

```text
python -m py_compile face-recognition/app.py
```

Result: passed with exit code 0.

Verification command:

```text
@' 
import ast
import math
from pathlib import Path
from types import SimpleNamespace

source = Path('face-recognition/app.py').read_text()
tree = ast.parse(source)
helper = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == '_validate_candidate_embeddings')
namespace = {'HTTPException': type('HTTPException', (Exception,), {'__init__': lambda self, status_code, detail: (setattr(self, 'status_code', status_code), setattr(self, 'detail', detail))[-1]}), 'Real': (int, float), 'math': math}
exec(compile(ast.Module(body=[node for node in tree.body if isinstance(node, ast.ImportFrom) and node.module == 'numbers'] + [helper], type_ignores=[]), '<helper-check>', 'exec'), namespace)
validate = namespace['_validate_candidate_embeddings']
for embedding in ([0.0] * 127, [0.0] * 127 + [float('nan')]):
    try:
        validate([SimpleNamespace(embedding=embedding)])
    except Exception as exc:
        assert exc.status_code == 400
        assert '128' in exc.detail and 'finitos' in exc.detail
    else:
        raise AssertionError('invalid candidate embedding was accepted')
print('helper validation check passed')
'@ | python -
```

Result: passed; invalid length and non-finite candidate values raised HTTP 400 through the validation helper. A direct module import was not practical because the local environment does not have `face_recognition` installed.
