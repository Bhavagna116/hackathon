import asyncio
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection

# Always load election_patrol_backend/.env (cwd-independent when running from repo root)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

_client: Optional[AsyncIOMotorClient] = None

officers_auth_collection: Optional[AsyncIOMotorCollection] = None
officer_tracking_collection: Optional[AsyncIOMotorCollection] = None
incidents_collection: Optional[AsyncIOMotorCollection] = None
stations_collection: Optional[AsyncIOMotorCollection] = None


async def ensure_db_connected() -> None:
    """Reconnect if collections are unset (e.g. uvicorn reload / shutdown race)."""
    global officers_auth_collection
    if officers_auth_collection is not None:
        return
    await connect_db()


async def connect_db() -> None:
    """Initialize Motor client, wire collections, ping DB, and ensure unique indexes."""
    global _client, officers_auth_collection, officer_tracking_collection, incidents_collection, stations_collection

    uri = os.environ.get("MONGODB_URI")
    db_name = os.environ.get("MONGODB_DB_NAME", "election_patrol")
    if not uri:
        raise RuntimeError("MONGODB_URI is not set")

    last_error: Optional[BaseException] = None

    for attempt in range(1, 4):
        if attempt > 1:
            print(f"WARNING: MongoDB connection attempt {attempt}/3...")
            await asyncio.sleep(2)

        try:
            if _client is not None:
                _client.close()
                _client = None

            _client = AsyncIOMotorClient(uri)
            db = _client[db_name]

            officers_auth_collection = db["officers_auth"]
            officer_tracking_collection = db["officer_tracking"]
            incidents_collection = db["incidents"]
            stations_collection = db["stations"]

            await _client.admin.command("ping")

            await officers_auth_collection.create_index("unique_id", unique=True)
            await officers_auth_collection.create_index("username", unique=True)
            await officers_auth_collection.create_index("email", unique=True)
            
            await officer_tracking_collection.create_index("unique_id", unique=True)
            # Instruct MongoDB to automatically rip out rows from this collection if 'last_updated' is older than 3600s (1 h)
            await officer_tracking_collection.create_index("last_updated", expireAfterSeconds=3600)

            print("MongoDB connected successfully.")
            return
        except BaseException as e:
            last_error = e
            officers_auth_collection = None
            officer_tracking_collection = None
            incidents_collection = None
            stations_collection = None
            if _client is not None:
                _client.close()
                _client = None
            if attempt == 3:
                raise RuntimeError(
                    "MongoDB connection failed after 3 attempts"
                ) from last_error


async def close_db() -> None:
    """Close the MongoDB client."""
    global _client, officers_auth_collection, officer_tracking_collection, incidents_collection, stations_collection

    if _client is not None:
        _client.close()
        _client = None

    officers_auth_collection = None
    officer_tracking_collection = None
    incidents_collection = None
    stations_collection = None
