import assert from "node:assert/strict";
import test from "node:test";
import { externalMusicUrl } from "../../../frontend/src/music-bar.mjs";
import { collectionSummary } from "../../../frontend/src/library-filters.mjs";

test("an external music link is http or https and is not a credential or script", () => {
  assert.equal(externalMusicUrl("https://example.com/listen"), "https://example.com/listen");
  assert.equal(externalMusicUrl("  http://example.com/bar  "), "http://example.com/bar");
  assert.equal(externalMusicUrl("javascript:alert(1)"), null);
  assert.equal(externalMusicUrl("ftp://example.com/song"), null);
  assert.equal(externalMusicUrl("https://user:secret@example.com/song"), null);
  assert.equal(externalMusicUrl(""), null);
  assert.equal(externalMusicUrl("not a link"), null);
  assert.equal(externalMusicUrl("https://example.com/" + "a".repeat(2000)), null);
});

test("music summaries name the saved grouping and leave the stage boundary to the bar", () => {
  assert.match(collectionSummary("artist"), /^Music\. Artists you have saved/);
  assert.match(collectionSummary("artist"), /does not follow the artist/);
  assert.doesNotMatch(collectionSummary("artist"), /Harbor Rhythm|does not play/);
  assert.match(collectionSummary("album"), /rating stays on the album/);
  assert.doesNotMatch(collectionSummary("album"), /does not play/);
  assert.match(collectionSummary("track"), /^Music\. Saved songs/);
  assert.doesNotMatch(collectionSummary("track"), /does not play/);
});
