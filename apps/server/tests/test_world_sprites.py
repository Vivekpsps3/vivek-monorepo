"""Static world sprite contract. Same forbidden-pattern grammar as the Town sprites."""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
SPRITES = ROOT / "apps/web/public/world"
WORLD_IDS = (
    "flower",
    "rock",
    "oak",
    "pine",
    "snowrock",
    "cactus",
    "bones",
    "palm",
    "fern",
    "signpost",
    "pier",
    "tome",
    "reel",
    "scroll",
    "gem",
    "beacon",
    "pile",
    "guide",
    "vivekbot",
    "terrarian",
    "manager",
    "chest-sealed",
    "chest-gold",
)
FILES = sorted(SPRITES.glob("*.svg"))
SVG = "{http://www.w3.org/2000/svg}"
FORBIDDEN = re.compile(
    r"script|foreignObject|href|on[a-z]+=|url\(|<!DOCTYPE\b|<!ENTITY\b|<\s*(?:set\b|animate)",
    re.IGNORECASE,
)
HEX = re.compile(r"#[0-9a-fA-F]{6}")


@pytest.mark.parametrize(
    "markup",
    [
        "<!DOCTYPE svg>",
        '<!ENTITY x "value">',
        "<set/>",
        "<animate/>",
        "<animateMotion/>",
        "<animateTransform/>",
        "<animateColor/>",
        "<SET/>",
        "<!doctype svg>",
    ],
)
def test_sprite_safety_rejects_declarations_and_smil(markup: str):
    assert FORBIDDEN.search(markup) is not None
