"""Twelve authored Town discoveries. One journal stamp each, no currency.

Hints are optional copy. Nothing in this catalog expires.
"""

from __future__ import annotations


class DiscoverySpec:
    def __init__(
        self, discovery_id: str, name: str, district: str, hint: str, reaction: str
    ) -> None:
        self.id = discovery_id
        self.name = name
        self.district = district
        self.hint = hint
        self.reaction = reaction


DISCOVERIES: tuple[DiscoverySpec, ...] = (
    DiscoverySpec(
        "tidepool-shells",
        "Tidepool shells",
        "harbor",
        "On the harbor shore, below the terminal.",
        "You lift a tidepool shell. The water left it here. This is a town toy, not a trip.",
    ),
    DiscoverySpec(
        "ferry-bell",
        "Ferry bell",
        "harbor",
        "Beside the model ferry at the terminal.",
        "You ring the model ferry bell. The sound stays in town. No trip is created.",
    ),
    DiscoverySpec(
        "library-globe",
        "Library globe",
        "culture",
        "In the Reading Hall, beside the shelves.",
        "You turn the library globe. It is a model. Nothing is added to your library.",
    ),
    DiscoverySpec(
        "theater-light-booth",
        "Theater light booth",
        "culture",
        "Above the theater doors.",
        "You try the theater light booth. The house lights answer. No show is saved.",
    ),
    DiscoverySpec(
        "music-mural",
        "Music mural",
        "culture",
        "On the music bar wall, facing the square.",
        "You trace the music mural. The paint stays put. No track is added.",
    ),
    DiscoverySpec(
        "gym-chalkboard",
        "Gym chalkboard",
        "wellness",
        "Inside the gym, on the far wall.",
        "You mark the gym chalkboard. The chalk is a toy. No workout is recorded.",
    ),
    DiscoverySpec(
        "clinic-garden",
        "Clinic garden",
        "wellness",
        "In the clinic garden, beside the path.",
        "You notice the clinic garden. The plants stay here. No health record is written.",
    ),
    DiscoverySpec(
        "hall-sundial",
        "Hall sundial",
        "civic",
        "In the Hall courtyard, in the sun.",
        "You read the Hall sundial. It names the light. Nothing is removed later.",
    ),
    DiscoverySpec(
        "courtyard-birdbath",
        "Courtyard birdbath",
        "residential",
        "In the home courtyard, near the door.",
        "You look into the courtyard birdbath. The water is only a reflection. No note is saved.",
    ),
    DiscoverySpec(
        "lantern-alley",
        "Lantern alley",
        "garden",
        "Along the garden path, between the lots.",
        "You look along lantern alley. The lanterns stay decorative. No Stamps are granted.",
    ),
    DiscoverySpec(
        "rooftop-telescope",
        "Rooftop telescope",
        "residential",
        "On the home roof, aimed over the harbor.",
        "You look through the rooftop telescope. The harbor is still there. No trip is created.",
    ),
    DiscoverySpec(
        "arcade-sign",
        "Arcade sign",
        "culture",
        "Over the arcade door.",
        "You tap the arcade sign. It blinks once. No score and no Stamps are written.",
    ),
)

_BY_ID = {item.id: item for item in DISCOVERIES}


def discovery_by_id(discovery_id: str) -> DiscoverySpec | None:
    return _BY_ID.get(discovery_id)


def discovery_check_sql() -> str:
    quoted = ", ".join(f"'{item.id}'" for item in DISCOVERIES)
    return f"discovery_id IN ({quoted})"
