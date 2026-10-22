import assert from "node:assert/strict";
import test from "node:test";
import { keyboardScore, pointerScore, scoreControl, scoreValue } from "../modules/score.mjs";

test("pointer and keyboard scores stay on half steps and do not invent a clear", () => {
  assert.equal(scoreValue(""), null);
  assert.equal(scoreValue(0), 0);
  assert.equal(scoreValue(7.5), 7.5);
  assert.equal(pointerScore(8, 0.2), 7.5);
  assert.equal(pointerScore(8, 0.5), 8);
  assert.equal(pointerScore(1, 0.1), 0.5);
  assert.equal(pointerScore(0, 0.1), 0);
  assert.equal(keyboardScore(7, "ArrowLeft", false), 6.5);
  assert.equal(keyboardScore(7, "ArrowRight", true), 8);
  assert.equal(keyboardScore(null, "ArrowRight", false), 0);
  assert.equal(keyboardScore(3, "Home"), 0);
  assert.equal(keyboardScore(3, "End"), 10);
  assert.equal(keyboardScore(3, "Delete"), null);
  assert.equal(keyboardScore(3, "Backspace"), null);
  assert.equal(keyboardScore(3, "a"), undefined);
});

test("the score control is one tab stop and clicking the current value is not a clear", () => {
  const html = scoreControl({ value: 7.5 });
  assert.match(html, /role="radiogroup"/);
  assert.match(html, /aria-label="7\.5 out of 10"/);
  assert.match(html, /class="mark is-on"/);
  assert.match(html, /class="mark is-half"/);
  assert.equal((html.match(/tabindex="0"/g) || []).length, 1);
  assert.match(html, /data-score=""/);
  assert.match(html, />–</);
  const same = scoreControl({ value: 5 });
  assert.match(same, /aria-label="5 out of 10"[^>]*tabindex="0"/);
  assert.doesNotMatch(same, /aria-pressed/);
  const child = scoreControl({ value: 0, child: true, label: "Season" });
  assert.match(child, /score-child/);
  assert.match(child, /aria-label="0 out of 10"/);
});
