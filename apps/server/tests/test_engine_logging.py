"""SQL parameter suppression leaves unrelated application diagnostics intact."""

import io
import logging

import pytest
from sqlalchemy import create_engine, text

from apps.server import database as database_module
from apps.server.database import _EngineParameterFilter, open_database

SECRET = "synthetic-private-value"


@pytest.mark.parametrize("message", ["Row %r", "[raw sql] %r", "[%s] %r"])
@pytest.mark.parametrize(
    "logger_name", ["site", "sqlalchemy.engine", "sqlalchemy.engine.EngineExtra"]
)
def test_application_messages_survive_engine_like_prefixes(message: str, logger_name: str) -> None:
    record = logging.LogRecord(logger_name, logging.DEBUG, __file__, 1, message, (), None)
    assert _EngineParameterFilter().filter(record)


@pytest.mark.parametrize(
    "logger_name", ["sqlalchemy.engine.Engine", "sqlalchemy.engine.Engine.named"]
)
@pytest.mark.parametrize("message", ["Row %r", "[private] Row %r", "SELECT users", {"row": SECRET}])
def test_all_engine_debug_records_are_suppressed(logger_name: str, message: object) -> None:
    record = logging.LogRecord(logger_name, logging.DEBUG, __file__, 1, message, (), None)
    assert not _EngineParameterFilter().filter(record)


@pytest.mark.parametrize("message", ["[%s] %r", "[token] [%s] %r", "[token] [raw sql] %r"])
def test_token_prefixed_engine_parameter_templates_are_suppressed(message: str) -> None:
    record = logging.LogRecord(
        "sqlalchemy.engine.Engine.named", logging.INFO, __file__, 1, message, (), None
    )
    assert not _EngineParameterFilter().filter(record)


def test_non_string_info_messages_survive_without_formatting() -> None:
    class Unformattable:
        def __str__(self) -> str:
            raise AssertionError("The filter must not format message payloads")

    record = logging.LogRecord(
        "sqlalchemy.engine.Engine", logging.INFO, __file__, 1, Unformattable(), (), None
    )
    assert _EngineParameterFilter().filter(record)


def test_root_handler_keeps_application_logs_and_drops_engine_rows() -> None:
    root = logging.getLogger()
    logger = logging.getLogger("site.sf4-regression")
    engine_logger = logging.getLogger("sqlalchemy.engine.Engine")
    previous = (logger.level, engine_logger.level)
    output = io.StringIO()
    handler = logging.StreamHandler(output)
    root.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    engine_logger.setLevel(logging.DEBUG)
    database = open_database("sqlite:///:memory:")
    try:
        logger.debug("Row %s", "application diagnostic")
        logger.info("[raw sql] %s", "application diagnostic")
        logger.info("[%s] %r", "application", "diagnostic")
        engine_logger.debug("[token] Row %r", SECRET)
        engine_logger.info("[token] [%s] %r", "generated", SECRET)
        captured = output.getvalue()
        assert "Row application diagnostic" in captured
        assert "[raw sql] application diagnostic" in captured
        assert "[application] 'diagnostic'" in captured
        assert SECRET not in captured
    finally:
        root.removeHandler(handler)
        logger.setLevel(previous[0])
        engine_logger.setLevel(previous[1])
        database.engine.dispose()


def test_named_engine_own_handler_does_not_log_token_prefixed_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    logger = logging.getLogger("sqlalchemy.engine.Engine.sf4-regression")
    output = io.StringIO()
    handler = logging.StreamHandler(output)
    logger.addHandler(handler)
    previous = (logger.level, logger.propagate, list(logger.filters))
    logger.setLevel(logging.DEBUG)
    logger.propagate = False
    monkeypatch.setattr(
        database_module,
        "create_engine",
        lambda url, **kwargs: create_engine(url, logging_name="sf4-regression", **kwargs),
    )
    database = open_database("sqlite:///:memory:")
    try:
        # Even an accidental diagnostic override must not expose bound values
        # or returned values, including SQLAlchemy's logging_token prefixes.
        database.engine.echo = "debug"
        database.engine.hide_parameters = False
        with database.engine.connect().execution_options(
            logging_token="request-token"
        ) as connection:
            assert (
                connection.execute(text("SELECT :value"), {"value": SECRET}).scalar_one() == SECRET
            )
        captured = output.getvalue()
        assert "SELECT ?" in captured
        assert SECRET not in captured
        assert "request-token" in captured
    finally:
        database.engine.echo = False
        database.engine.dispose()
        logger.removeHandler(handler)
        logger.setLevel(previous[0])
        logger.propagate = previous[1]
        logger.filters[:] = previous[2]
