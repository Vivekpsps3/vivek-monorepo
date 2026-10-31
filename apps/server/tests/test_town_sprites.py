"""Static sprite contract and safety gates, including the Clinic emblem rule."""

import re
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
SPRITES = ROOT / "apps/web/public/town"
FILES = sorted(SPRITES.glob("*.svg"))
FORBIDDEN = re.compile(r"script|foreignObject|href|on[a-z]+=|url\(", re.IGNORECASE)


def test_sprite_filenames_match_the_29_exported_ids():
    source = (ROOT / "apps/web/src/app/town/town-sprites.ts").read_text()
    match = re.search(r"TOWN_SPRITE_IDS = Object\.freeze\(\[(.*?)\] as const\)", source, re.DOTALL)
    assert match is not None, "Missing frozen TOWN_SPRITE_IDS list"
    ids = re.findall(r"'([^']+)'", match[1])
    assert len(ids) == len(set(ids)) == 29
    assert {path.name for path in FILES} == {f"{sprite_id}.svg" for sprite_id in ids}


@pytest.mark.parametrize("path", FILES, ids=lambda path: path.name)
def test_sprite_has_no_active_content_or_external_references(path: Path):
    assert FORBIDDEN.search(path.read_text()) is None, path.name


@pytest.mark.parametrize("path", sorted(SPRITES.glob("clinic-*.svg")), ids=lambda path: path.name)
def test_clinic_contains_no_red_emblem_color(path: Path):
    assert path.read_text().lower().count("#d8434a") == 0, path.name


@pytest.mark.parametrize("path", FILES, ids=lambda path: path.name)
def test_sprite_is_32_by_32(path: Path):
    root = ET.fromstring(path.read_text())
    assert root.tag == "{http://www.w3.org/2000/svg}svg"
    view_box = root.get("viewBox")
    dimensions = (root.get("width"), root.get("height"))
    assert view_box is not None or all(dimensions), path.name
    if view_box is not None:
        assert [float(value) for value in view_box.replace(",", " ").split()] == [0, 0, 32, 32]
    if any(dimensions):
        assert dimensions == ("32", "32"), path.name
