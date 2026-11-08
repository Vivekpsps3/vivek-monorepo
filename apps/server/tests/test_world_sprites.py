"""Static world sprite contract. Same forbidden-pattern grammar as the Town sprites."""

import re
import xml.etree.ElementTree as ET
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


def test_sprite_filenames_match_the_world_set():
    assert len(WORLD_IDS) == len(set(WORLD_IDS)) == 23
    assert {path.name for path in FILES} == {f"{sprite_id}.svg" for sprite_id in WORLD_IDS}


@pytest.mark.parametrize("path", FILES, ids=lambda path: path.name)
def test_sprite_has_no_active_content_or_external_references(path: Path):
    assert FORBIDDEN.search(path.read_text()) is None, path.name


@pytest.mark.parametrize("path", FILES, ids=lambda path: path.name)
def test_sprite_is_32_by_32(path: Path):
    root = ET.fromstring(path.read_text())
    assert root.tag == f"{SVG}svg"
    view_box = root.get("viewBox")
    dimensions = (root.get("width"), root.get("height"))
    assert view_box is not None or all(dimensions), path.name
    if view_box is not None:
        assert [float(value) for value in view_box.replace(",", " ").split()] == [0, 0, 32, 32]
    if any(dimensions):
        assert dimensions == ("32", "32"), path.name


@pytest.mark.parametrize("path", FILES, ids=lambda path: path.name)
def test_sprite_is_rect_pixel_art(path: Path):
    root = ET.fromstring(path.read_text())
    assert root.get("shape-rendering") == "crispEdges"
    assert root.get("aria-hidden") == "true"
    children = list(root)
    titles = [child for child in children if child.tag == f"{SVG}title"]
    assert [child.text for child in titles] == [path.stem]
    assert children
    assert {child.tag for child in children} <= {f"{SVG}title", f"{SVG}rect"}
    rects = [child for child in children if child.tag == f"{SVG}rect"]
    assert rects, path.name
    for rect in rects:
        assert HEX.fullmatch(rect.get("fill") or ""), path.name


def test_sprite_silhouettes_are_distinct():
    contents = [path.read_text() for path in FILES]
    assert len(contents) == len(set(contents))


def test_world_sources_do_not_literal_town_sprite_urls():
    """Town sprite URLs go through townSpriteUrl. The /town/world route is a page, not a sprite."""
    sprite_url = re.compile(r"""['"]/town/[^'"]+\.svg['"]""")
    world = ROOT / "apps/web/src/app/world"
    offenders = [
        str(path.relative_to(ROOT))
        for path in world.rglob("*.ts")
        if sprite_url.search(path.read_text())
    ]
    assert offenders == []
