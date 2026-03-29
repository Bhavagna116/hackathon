import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database.connection import connect_db, close_db
from routers import auth, officers, incidents, websocket, stations

app = FastAPI(title="Election Patrol API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await connect_db()

@app.on_event("shutdown")
async def shutdown():
    await close_db()

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(officers.router, prefix="/officers", tags=["officers"])
app.include_router(incidents.router, prefix="/incidents", tags=["incidents"])
app.include_router(websocket.router, prefix="/websocket", tags=["websocket"])
app.include_router(stations.router, prefix="/stations", tags=["stations"])

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
