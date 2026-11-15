"""Static sprite contract and safety gates, including the Clinic emblem rule."""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
SPRITES = ROOT / "apps/web/public/town"
FILES = sorted(SPRITES.glob("*.svg"))
FORBIDDEN = re.compile(
    r"script|foreignObject|href|on[a-z]+=|url\(|<!DOCTYPE\b|<!ENTITY\b|<\s*(?:set\b|animate)",
    re.IGNORECASE,
)


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
