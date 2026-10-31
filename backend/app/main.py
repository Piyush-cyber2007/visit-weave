from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine

from .config import Settings, get_settings
from .database import create_engine, create_session_factory
from .errors import AuthError
from .router import router

logger = logging.getLogger("visitweave.auth")


def create_app(settings: Settings | None = None, engine: AsyncEngine | None = None) -> FastAPI:
    runtime_settings = settings or get_settings()
    runtime_engine = engine or create_engine(runtime_settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        runtime_settings.validate_runtime()
        async with runtime_engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
            if runtime_settings.environment.lower() == "production":
                tables = await connection.run_sync(lambda sync_connection: set(inspect(sync_connection).get_table_names()))
                if "users" not in tables or "alembic_version" not in tables:
                    raise RuntimeError("Auth database migrations are missing. Run Alembic upgrade before startup.")
        yield
        await runtime_engine.dispose()

    app = FastAPI(title="VisitWeave Authentication", version="1.0.0", lifespan=lifespan)
    app.state.settings = runtime_settings
    app.state.engine = runtime_engine
    app.state.session_factory = create_session_factory(runtime_engine)
    app.include_router(router)

    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.exception_handler(AuthError)
    async def auth_error_handler(_request: Request, error: AuthError) -> JSONResponse:
        return JSONResponse(status_code=error.status_code, content={"error": {"code": error.code, "message": error.message}})

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_request: Request, error: RequestValidationError) -> JSONResponse:
        details = [
            {"field": ".".join(str(part) for part in item.get("loc", ())), "message": item.get("msg", "Invalid value.")}
            for item in error.errors()
        ]
        return JSONResponse(status_code=422, content={"error": {"code": "VALIDATION_ERROR", "message": "Request validation failed.", "details": details}})

    @app.exception_handler(SQLAlchemyError)
    async def database_error_handler(_request: Request, _error: SQLAlchemyError) -> JSONResponse:
        logger.error(
            "Authentication database operation failed (%s; original %s).",
            type(_error).__name__,
            type(_error.orig).__name__,
        )
        return JSONResponse(status_code=503, content={"error": {"code": "DATABASE_UNAVAILABLE", "message": "Authentication is temporarily unavailable."}})

    @app.exception_handler(Exception)
    async def unexpected_error_handler(_request: Request, _error: Exception) -> JSONResponse:
        logger.error("Unexpected authentication service error.")
        return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL_ERROR", "message": "Authentication is temporarily unavailable."}})

    return app


app = create_app()
