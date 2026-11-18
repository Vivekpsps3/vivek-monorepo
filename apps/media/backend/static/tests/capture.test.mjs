import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPTURE_KINDS,
  CAPTURE_RETRY_LIMIT,
  acceptCaptureResult,
  addQuery,
  captureParams,
  coverageText,
  kindLabel,
  retryOpen,
  sameProviderIdentity,
  selectedKind,
} from "../../../frontend/src/capture.mjs";

test("selected type is carried and all-types is not a manual default", () => {
  assert.equal(selectedKind("book", false), "book");
  assert.equal(selectedKind("book", true), "book");
  assert.equal(selectedKind("game", true), "game");
  assert.equal(selectedKind(null, false), "all");
  assert.equal(selectedKind("all", false), "all");
  assert.equal(selectedKind("all", true), "all");
  assert.equal(selectedKind(null, true), "movie");
  assert.equal(selectedKind("nope", true), "movie");
  assert.deepEqual(captureParams("book"), { kind: "book" });
  assert.deepEqual(captureParams("all"), {});
  assert.deepEqual(addQuery("Paper Harbor", "book"), {
    title: "Paper Harbor",
    kind: "book",
  });
  assert.deepEqual(addQuery("  ", "all"), {});
  assert.equal(kindLabel("tv"), "Series");
  assert.equal(CAPTURE_KINDS.includes("book"), true);
});

test("retry stops at three explicit attempts and a late result is dropped", () => {
  assert.equal(CAPTURE_RETRY_LIMIT, 3);
  assert.equal(retryOpen(0), true);
  assert.equal(retryOpen(2), true);
  assert.equal(retryOpen(3), false);
  assert.equal(retryOpen(-1), false);
  assert.equal(acceptCaptureResult(2, 2, true), true);
  assert.equal(acceptCaptureResult(1, 2, true), false);
  assert.equal(acceptCaptureResult(2, 2, false), false);
});

test("provider identity ignores title and a manual row never matches", () => {
  const harbor = { source: "openlibrary", source_id: "OL-HARBOR-1" };
  assert.equal(
    sameProviderIdentity(harbor, {
      source: "openlibrary",
      source_id: "ol-harbor-1",
      title: "Reprint",
    }),
    true,
  );
  assert.equal(
    sameProviderIdentity(harbor, {
      source: "openlibrary",
      source_id: "OL-HARBOR-2",
      title: "Paper Harbor",
    }),
    false,
  );
  assert.equal(
    sameProviderIdentity(
      { source: "manual", source_id: "", title: "Paper Harbor" },
      { source: "openlibrary", source_id: "OL-HARBOR-1", title: "Paper Harbor" },
    ),
    false,
  );
  assert.equal(sameProviderIdentity(null, harbor), false);
});

test("coverage copy names an unconfigured source instead of a result", () => {
  assert.match(
    coverageText({
      id: "rawg",
      kinds: ["game"],
      state: "unconfigured",
      reason: "RAWG needs a key.",
    }),
    /RAWG \(game\) is not configured\. RAWG needs a key\./,
  );
  assert.match(
    coverageText({
      id: "openlibrary",
      kinds: ["book"],
      state: "configured",
      coverage: "official",
    }),
    /Open Library can search book \(official\)\./,
  );
});
