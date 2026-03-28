import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env before importing app modules so MONGODB_URI is set for connect_db
load_dotenv(Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import database.connection as db
from database.connection import close_db, connect_db
from routers.auth import router as auth_router
from routers.incidents import router as incidents_router
from routers.officers import router as officers_router
from routers.stations import router as stations_router
from routers.websocket import router as websocket_router

PORT = int(os.environ.get("PORT", "8000"))

app = FastAPI(title="Election Patrol API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],  # includes Connection, Upgrade for WebSocket when clients use CORS preflight
)


@app.on_event("startup")
async def startup_event() -> None:
    await connect_db()


@app.on_event("shutdown")
async def shutdown_event() -> None:
    await close_db()


@app.get("/")
def root():
    return {
        "service": "Election Patrol API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    """Sync JSON so browsers always show body; reflects whether Motor collections are wired."""
    ok = db.officers_collection is not None and db._client is not None
    return {
        "status": "ok" if ok else "degraded",
        "service": "Election Patrol API",
        "database": "connected" if ok else "not_connected",
        "hint": None
        if ok
        else "Set MONGODB_URI in election_patrol_backend/.env, restart the API, and allow your IP in MongoDB Atlas.",
    }


app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(officers_router, prefix="/officers", tags=["officers"])
app.include_router(incidents_router, prefix="/incidents", tags=["incidents"])
app.include_router(stations_router, prefix="/stations", tags=["stations"])
app.include_router(websocket_router, prefix="/ws", tags=["websocket"])
