import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_TAG_LENGTH,
  MAX_TAGS,
  addTag,
  cleanTag,
  normaliseTags,
  removeTag,
} from "../../../frontend/src/tag-model.mjs";

test("cleanTag trims and collapses spaces", () => {
  assert.equal(cleanTag("  Sci   Fi "), "Sci Fi");
  assert.equal(cleanTag("\tSpace\t Opera\n"), "Space Opera");
  assert.equal(cleanTag(""), "");
  assert.equal(cleanTag("   "), "");
});

test("addTag ignores empty input", () => {
  const tags = ["Drama"];
  const result = addTag(tags, "   ");
  assert.equal(result.error, "");
  assert.deepEqual(result.tags, ["Drama"]);
  assert.equal(result.tags, tags);
});

test("addTag rejects over 40 characters counting code points", () => {
  assert.equal(MAX_TAG_LENGTH, 40);
  const emoji = addTag([], "🎬".repeat(41));
  assert.equal(emoji.error, "Tags can be up to 40 characters.");
  assert.deepEqual(emoji.tags, []);
  const plain = addTag([], "a".repeat(41));
  assert.equal(plain.error, "Tags can be up to 40 characters.");
  const ok = addTag([], "🎬".repeat(40));
  assert.equal(ok.error, "");
  assert.deepEqual(ok.tags, ["🎬".repeat(40)]);
});

test("addTag de-dupes case-insensitively and quotes the existing spelling", () => {
  const result = addTag(["Sci Fi"], "sci fi");
  assert.equal(result.error, "“Sci Fi” is already a tag.");
  assert.equal(result.existing, "Sci Fi");
  assert.deepEqual(result.tags, ["Sci Fi"]);
  const added = addTag(["Sci Fi"], "Space Opera");
  assert.equal(added.error, "");
  assert.deepEqual(added.tags, ["Sci Fi", "Space Opera"]);
});

test("addTag stops at 20", () => {
  assert.equal(MAX_TAGS, 20);
  const full = Array.from({ length: 20 }, (_, i) => "tag " + i);
  const result = addTag(full, "one more");
  assert.equal(
    result.error,
    "You can have up to 20 tags. Remove one to add another.",
  );
  assert.deepEqual(result.tags, full);
  const nineteen = addTag(full.slice(0, 19), "twentieth");
  assert.equal(nineteen.error, "");
  assert.equal(nineteen.tags.length, 20);
});

test("removeTag removes by index", () => {
  const tags = ["a", "b", "c"];
  assert.deepEqual(removeTag(tags, 1), ["a", "c"]);
  assert.deepEqual(removeTag(tags, 0), ["b", "c"]);
  assert.deepEqual(tags, ["a", "b", "c"]);
});

test("normaliseTags de-dupes, drops empties and caps", () => {
  assert.deepEqual(
    normaliseTags(["  Sci   Fi ", "", "sci fi", "Drama", "   ", "DRAMA"]),
    ["Sci Fi", "Drama"],
  );
  const many = Array.from({ length: 25 }, (_, i) => "tag " + i);
  const capped = normaliseTags(many);
  assert.equal(capped.length, 20);
  assert.deepEqual(capped, many.slice(0, 20));
  assert.deepEqual(normaliseTags([]), []);
});
