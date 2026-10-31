"""Keep the frozen TypeScript display constants in step with server tuning."""

import ast
import re
from pathlib import Path

import pytest

from apps.server.town import constants

ROOT = Path(__file__).resolve().parents[3]
CLIENT = ROOT / "apps/web/src/app/town/town.constants.ts"
SHARED_NAMES = sorted(name for name in vars(constants) if name.isupper())


@pytest.mark.parametrize("server_name", SHARED_NAMES)
def test_client_constants_match_server(server_name: str):
    client_name = "TOWN_CONSTANTS_VERSION" if server_name == "CONSTANTS_VERSION" else server_name
    match = re.search(
        rf"^export const {client_name} = Object\.freeze\((.*?) as const\);$",
        CLIENT.read_text(),
        re.MULTILINE | re.DOTALL,
    )
    assert match is not None, f"Missing frozen literal: {client_name}"
    # Quote JS object keys; literal_eval accepts single quotes and trailing commas.
    literal = re.sub(r"\b([A-Za-z_]\w*)\s*:", r"'\1':", match[1])
    actual = ast.literal_eval(literal)
    expected = getattr(constants, server_name)
    if isinstance(expected, tuple):
        expected = list(expected)
    elif isinstance(expected, frozenset):
        assert len(actual) == len(set(actual)), f"Duplicate values in {client_name}"
        actual = frozenset(actual)
    assert actual == expected, client_name
