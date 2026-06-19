import asyncio
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import engine, Base
from migrations import run_migrations
from api.auth_routes import router as auth_router
from api.servers import router as servers_router
from api.alerts import router as alerts_router
from api.metrics import router as metrics_router
from api.ws import router as ws_router
from api.settings_routes import router as settings_router
from api.sms import router as sms_router
from api.callsearch import router as callsearch_router
from api.events import router as events_router
from api.services import router as services_router
from api.audit import router as audit_router
from api.notifications_routes import router as notifications_router
from seed import seed_database
from worker.monitor import monitoring_loop
from worker.retention import retention_loop
from sms.service import sms_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await run_migrations(engine)

    await seed_database()

    monitor_task = asyncio.create_task(monitoring_loop())
    sms_task = asyncio.create_task(sms_worker())
    retention_task = asyncio.create_task(retention_loop())
    yield
    monitor_task.cancel()
    sms_task.cancel()
    retention_task.cancel()
    for task in (monitor_task, sms_task, retention_task):
        try:
            await task
        except asyncio.CancelledError:
            pass
    await engine.dispose()


app = FastAPI(title="Station Monitor API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173", "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router,     prefix="/api/auth",    tags=["auth"])
app.include_router(callsearch_router,                      tags=["calls"])   # before servers — has own prefix
app.include_router(services_router,                        tags=["services"]) # before servers — has own full paths
app.include_router(servers_router,  prefix="/api/servers", tags=["servers"])
app.include_router(alerts_router,   prefix="/api/alerts",  tags=["alerts"])
app.include_router(metrics_router,  prefix="/api/metrics", tags=["metrics"])
app.include_router(settings_router,                        tags=["settings"])
app.include_router(sms_router,                             tags=["sms"])
app.include_router(events_router,                          tags=["events"])
app.include_router(audit_router,                           tags=["audit"])
app.include_router(notifications_router,                   tags=["notifications"])
app.include_router(ws_router,                              tags=["websocket"])


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Ensure CORS headers are present even on unhandled 500s."""
    origin = request.headers.get("origin", "*")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={"Access-Control-Allow-Origin": origin},
    )


@app.get("/api/health")
async def health():
    return {"status": "ok"}
