"""Keep the frozen TypeScript display constants in step with server tuning."""

import ast
import io
import re
import tokenize
from pathlib import Path

import pytest

from apps.server.town import constants

ROOT = Path(__file__).resolve().parents[3]
CLIENT = ROOT / "apps/web/src/app/town/town.constants.ts"
SHARED_NAMES = sorted(name for name in vars(constants) if name.isupper())


def parse_js_literal(source: str):
    """Parse the shared literal subset; only bare object keys are rewritten."""
    tokens = list(tokenize.generate_tokens(io.StringIO(source).readline))
    rewritten = []
    for index, token in enumerate(tokens):
        kind, value = token.type, token.string
        if kind == tokenize.NAME and tokens[index + 1].string == ":":
            kind, value = tokenize.STRING, repr(value)
        rewritten.append((kind, value))
    return ast.literal_eval(tokenize.untokenize(rewritten).strip())


def test_js_keys_are_tokenized_without_rewriting_strings():
    assert parse_js_literal("{bare: 'word: value', 'quoted': {inner: 2},}") == {
        "bare": "word: value",
        "quoted": {"inner": 2},
    }
    with pytest.raises((ValueError, SyntaxError)):
        parse_js_literal("{key: execute()}")


@pytest.mark.parametrize("server_name", SHARED_NAMES)
def test_client_constants_match_server(server_name: str):
    client_name = "TOWN_CONSTANTS_VERSION" if server_name == "CONSTANTS_VERSION" else server_name
    match = re.search(
        rf"^export const {client_name} = Object\.freeze\((.*?) as const\);$",
        CLIENT.read_text(),
        re.MULTILINE | re.DOTALL,
    )
    assert match is not None, f"Missing frozen literal: {client_name}"
    actual = parse_js_literal(match[1])
    expected = getattr(constants, server_name)
    if isinstance(expected, tuple):
        expected = list(expected)
    elif isinstance(expected, frozenset):
        assert len(actual) == len(set(actual)), f"Duplicate values in {client_name}"
        actual = frozenset(actual)
    assert actual == expected, client_name
