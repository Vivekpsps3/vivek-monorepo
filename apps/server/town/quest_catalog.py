"""Bounded chapter catalog. Game actions only; no deadlines or life facts."""

from __future__ import annotations

from typing import Literal

SourceName = Literal["library", "travel", "memory"]


class QuestStepSpec:
    def __init__(
        self,
        step_id: str,
        label: str,
        action_id: str,
        *,
        source: SourceName | None = None,
        sample_action_id: str | None = None,
        sample_label: str | None = None,
        sample_detail: str | None = None,
    ) -> None:
        self.id = step_id
        self.label = label
        self.action_id = action_id
        self.source = source
        self.sample_action_id = sample_action_id
        self.sample_label = sample_label
        self.sample_detail = sample_detail

    def actions(self) -> tuple[str, ...]:
        if self.sample_action_id is None:
            return (self.action_id,)
        return (self.action_id, self.sample_action_id)


class QuestSpec:
    def __init__(self, quest_id: str, title: str, steps: tuple[QuestStepSpec, ...]) -> None:
        self.id = quest_id
        self.title = title
        self.detail = "Optional. No deadline."
        self.steps = steps


def _step(
    quest_id: str,
    step_id: str,
    label: str,
    *,
    source: SourceName | None = None,
    sample_label: str | None = None,
    sample_detail: str | None = None,
) -> QuestStepSpec:
    action_id = f"{quest_id}:{step_id}"
    if source is None:
        return QuestStepSpec(step_id, label, action_id)
    return QuestStepSpec(
        step_id,
        label,
        action_id,
        source=source,
        sample_action_id=f"{quest_id}:{step_id}:sample",
        sample_label=sample_label,
        sample_detail=sample_detail,
    )


QUESTS: tuple[QuestSpec, ...] = (
    QuestSpec(
        "make-a-home",
        "Make a home",
        (
            _step("make-a-home", "enter-home", "Enter Home"),
            _step("make-a-home", "place-starter", "Place a starter item"),
            _step("make-a-home", "save-layout", "Save the layout"),
        ),
    ),
    QuestSpec(
        "find-your-shelves",
        "Find your shelves",
        (
            _step("find-your-shelves", "meet-librarian", "Meet the librarian"),
            _step(
                "find-your-shelves",
                "inspect-saved",
                "Inspect a saved item",
                source="library",
                sample_label="Sample shelf item",
                sample_detail="Labeled sample. Not your library.",
            ),
            _step("find-your-shelves", "choose-display", "Choose a shelf display"),
        ),
    ),
    QuestSpec(
        "across-the-harbor",
        "Across the harbor",
        (
            _step("across-the-harbor", "meet-keeper", "Meet the travel keeper"),
            _step(
                "across-the-harbor",
                "inspect-saved",
                "Inspect a saved trip",
                source="travel",
                sample_label="Sample harbor trip",
                sample_detail="Labeled sample. Not your trips.",
            ),
            _step("across-the-harbor", "ring-bell", "Ring the model ferry bell"),
        ),
    ),
    QuestSpec(
        "a-place-to-play",
        "A place to play",
        (
            _step("a-place-to-play", "visit-arcade", "Visit the Arcade"),
            _step("a-place-to-play", "finish-game", "Finish either game"),
            _step("a-place-to-play", "inspect-score", "Inspect its score"),
        ),
    ),
    QuestSpec(
        "light-the-square",
        "Light the square",
        (
            _step("light-the-square", "meet-treasurer", "Meet the treasurer"),
            _step("light-the-square", "inspect-rules", "Inspect the rules board"),
            _step("light-the-square", "place-lantern", "Place a lantern"),
        ),
    ),
    QuestSpec(
        "your-own-little-world",
        "Your own little world",
        (
            _step("your-own-little-world", "meet-residents", "Meet the residents"),
            _step("your-own-little-world", "customize-rooms", "Customize two rooms"),
            _step(
                "your-own-little-world",
                "inspect-saved",
                "Inspect a saved memory",
                source="memory",
                sample_label="Sample memory",
                sample_detail="Labeled sample. Not your memories.",
            ),
        ),
    ),
)

_BY_QUEST = {quest.id: quest for quest in QUESTS}


def quest_by_id(quest_id: str) -> QuestSpec | None:
    return _BY_QUEST.get(quest_id)


def step_by_id(quest: QuestSpec, step_id: str) -> QuestStepSpec | None:
    for step in quest.steps:
        if step.id == step_id:
            return step
    return None


def action_triples() -> tuple[str, ...]:
    found: list[str] = []
    for quest in QUESTS:
        for step in quest.steps:
            for action_id in step.actions():
                found.append(f"{quest.id}:{step.id}:{action_id}")
    return tuple(found)


def triple_check_sql() -> str:
    quoted = ", ".join(f"'{item}'" for item in action_triples())
    return f"quest_id || ':' || step_id || ':' || action_id IN ({quoted})"
