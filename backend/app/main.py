from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

app = FastAPI(title="Tab Cleaner MVP", version="0.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = Path(__file__).parent / "static"
static_dir.mkdir(exist_ok=True, parents=True)
app.mount("/public", StaticFiles(directory=static_dir, html=True), name="public")

@app.get("/")
def root():
    return {"ok": True, "message": "Hello Tab Cleaner"}
