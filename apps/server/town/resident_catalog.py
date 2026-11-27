"""Six residents and five conversation identities.

Later packets replace the shared identity lines with authored scenes.
This catalog does not store private life facts or a second rank ledger.
"""

from __future__ import annotations


class ConversationSpec:
    def __init__(self, conversation_id: str, title: str, line: str, stamps: int) -> None:
        self.id = conversation_id
        self.title = title
        self.line = line
        self.stamps = stamps


class ResidentSpec:
    def __init__(self, resident_id: str, name: str, place: str, purpose: str) -> None:
        self.id = resident_id
        self.name = name
        self.place = place
        self.purpose = purpose


CONVERSATIONS: tuple[ConversationSpec, ...] = (
    ConversationSpec(
        "welcome",
        "Welcome",
        "A first meeting. Finishing this once raises rank and gives 2 Stamps.",
        2,
    ),
    ConversationSpec(
        "how-it-works",
        "How this place works",
        "A public explanation of this place. Finishing this once raises rank.",
        0,
    ),
    ConversationSpec(
        "preference",
        "A preference",
        "A taste, not a grade. Finishing this once raises rank.",
        0,
    ),
    ConversationSpec(
        "activity",
        "A short activity",
        "A small thing to notice here. Finishing this once raises rank.",
        0,
    ),
    ConversationSpec(
        "reflection",
        "A reflection",
        "A look at this place, not a private event. Finishing this once raises rank.",
        0,
    ),
)

RESIDENTS: tuple[ResidentSpec, ...] = (
    ResidentSpec(
        "mara", "Mara", "Library", "Mara keeps the Reading Hall and explains the shelves."
    ),
    ResidentSpec("ada", "Ada", "Treasury", "Ada explains the public rules of the square."),
    ResidentSpec("imani", "Imani", "Terminal", "Imani points toward the harbor terminal."),
    ResidentSpec("jun", "Jun", "Gym", "Jun explains the training floor."),
    ResidentSpec("wren", "Wren", "Arcade", "Wren keeps the music room and the arcade."),
    ResidentSpec("sol", "Sol", "Hall", "Sol keeps the Hall and the study."),
)

WELCOME_STAMPS = 2
_BY_RESIDENT = {item.id: item for item in RESIDENTS}
_BY_CONVERSATION = {item.id: item for item in CONVERSATIONS}


def resident_by_id(resident_id: str) -> ResidentSpec | None:
    return _BY_RESIDENT.get(resident_id)


def conversation_by_id(conversation_id: str) -> ConversationSpec | None:
    return _BY_CONVERSATION.get(conversation_id)


def meeting_grant_key(resident_id: str) -> str:
    return f"meeting:{resident_id}"


def is_present(index: int, hour: int) -> bool:
    """One resident is away for each four-hour block. The directory ignores this."""
    return hour // 4 != index


def resident_check_sql() -> str:
    quoted = ", ".join(f"'{item.id}'" for item in RESIDENTS)
    return f"resident_id IN ({quoted})"


def conversation_check_sql() -> str:
    quoted = ", ".join(f"'{item.id}'" for item in CONVERSATIONS)
    return f"conversation_id IN ({quoted})"
