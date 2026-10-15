import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config import DEFAULT_ALLOWED_ORIGINS, configured_allowed_origins  # noqa: E402


def test_origin_config_defaults_to_local_site_development():
    assert configured_allowed_origins() == DEFAULT_ALLOWED_ORIGINS


def test_origin_config_parses_explicit_comma_separated_origins():
    assert configured_allowed_origins(" https://site.example, http://localhost:4300 ") == (
        "https://site.example",
        "http://localhost:4300",
    )


@pytest.mark.parametrize(
    "origin",
    [
        "*",
        "https://*.example.com",
        "ftp://site.example",
        "https://site.example/path",
        "https://user:password@site.example",
        "https://site.example?query=value",
        "https://site.example#fragment",
        "https://site.example:99999",
    ],
)
def test_origin_config_rejects_wildcards_and_non_origin_urls(origin):
    with pytest.raises(ValueError):
        configured_allowed_origins([origin])
