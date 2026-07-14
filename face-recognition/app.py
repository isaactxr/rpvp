import io
import json
import math
from numbers import Real
from typing import Any, List

import face_recognition
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel

app = FastAPI(title="RPVP Face Recognition")


class Candidate(BaseModel):
    usuarioId: int
    faceId: int
    embedding: List[float]


def _validate_candidate_embeddings(candidate_models: list[Candidate]) -> None:
    for index, candidate in enumerate(candidate_models):
        embedding = candidate.embedding
        if len(embedding) != 128 or any(
            isinstance(value, bool)
            or not isinstance(value, Real)
            or not math.isfinite(float(value))
            for value in embedding
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Embedding do candidato {index} invalido: "
                    "deve conter exatamente 128 valores numericos finitos."
                ),
            )


def _load_rgb_image(raw: bytes) -> np.ndarray:
    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Imagem invalida.") from exc
    return np.array(image)


def _single_encoding(raw: bytes) -> list[float]:
    image = _load_rgb_image(raw)
    locations = face_recognition.face_locations(image, model="hog")

    if len(locations) == 0:
        raise HTTPException(status_code=422, detail="Nenhuma face encontrada na imagem.")

    if len(locations) > 1:
        raise HTTPException(status_code=422, detail="Mais de uma face encontrada na imagem.")

    encodings = face_recognition.face_encodings(image, known_face_locations=locations)
    if not encodings:
        raise HTTPException(status_code=422, detail="Nao foi possivel gerar embedding facial.")

    return [float(value) for value in encodings[0]]


@app.get("/health")
def health() -> dict[str, Any]:
    return {"success": True, "engine": "face_recognition"}


@app.post("/encode")
async def encode(file: UploadFile = File(...)) -> dict[str, Any]:
    raw = await file.read()
    embedding = _single_encoding(raw)
    return {
        "success": True,
        "faceFound": True,
        "embedding": embedding,
        "dimensions": len(embedding),
    }


@app.post("/recognize")
async def recognize(
    file: UploadFile = File(...),
    candidates: str = Form(...),
    tolerance: float = Form(0.6),
) -> dict[str, Any]:
    raw = await file.read()
    unknown = np.array(_single_encoding(raw), dtype=np.float64)

    try:
        parsed = json.loads(candidates)
        candidate_models = [Candidate(**item) for item in parsed]
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Lista de candidatos invalida.") from exc

    if not candidate_models:
        return {
            "success": True,
            "faceFound": True,
            "recognized": False,
            "message": "Nenhum candidato cadastrado.",
        }

    _validate_candidate_embeddings(candidate_models)
    known = np.array([item.embedding for item in candidate_models], dtype=np.float64)
    distances = face_recognition.face_distance(known, unknown)
    best_index = int(np.argmin(distances))
    best_distance = float(distances[best_index])
    best = candidate_models[best_index]

    if best_distance > tolerance:
        return {
            "success": True,
            "faceFound": True,
            "recognized": False,
            "distance": best_distance,
        }

    return {
        "success": True,
        "faceFound": True,
        "recognized": True,
        "usuarioId": best.usuarioId,
        "faceId": best.faceId,
        "distance": best_distance,
    }
