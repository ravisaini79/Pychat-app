from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import connect_db, close_db
from .routers import auth, chat, ws


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    yield
    await close_db()


app = FastAPI(
    title="AI Chat API",
    lifespan=lifespan,
)
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://pychat-app-steel.vercel.app",
        "capacitor://localhost",   # 🔥 Android WebView
        "http://localhost"         # 🔥 Fallback
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(ws.router)


@app.get("/")
def root():
    return {"message": "AI Chat API", "docs": "/docs"}
