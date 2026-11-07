import assert from "node:assert/strict";
import test from "node:test";
import {
  FIELD_ORDER,
  validateAdd,
} from "../../../frontend/src/add-validate.mjs";

test("empty and whitespace title", () => {
  assert.deepEqual(validateAdd({ title: "", kind: "movie", year: null }), {
    title: "Enter a title.",
  });
  assert.deepEqual(validateAdd({ title: "   ", kind: "movie", year: null }), {
    title: "Enter a title.",
  });
});

test("title over 300", () => {
  assert.deepEqual(
    validateAdd({ title: "a".repeat(301), kind: "movie", year: null }),
    { title: "Keep the title under 300 characters." },
  );
  assert.deepEqual(
    validateAdd({ title: "a".repeat(300), kind: "movie", year: null }),
    {},
  );
});

test("year bounds and blank", () => {
  const base = { title: "Dune", kind: "movie" };
  assert.deepEqual(validateAdd({ ...base, year: null }), {});
  assert.deepEqual(validateAdd({ ...base, year: "" }), {});
  assert.deepEqual(validateAdd({ ...base, year: 1000 }), {});
  assert.deepEqual(validateAdd({ ...base, year: 3000 }), {});
  assert.deepEqual(validateAdd({ ...base, year: 2026 }), {});
  assert.deepEqual(validateAdd({ ...base, year: 99 }), {
    year: "Enter a year between 1000 and 3000.",
  });
  assert.deepEqual(validateAdd({ ...base, year: 999 }), {
    year: "Enter a year between 1000 and 3000.",
  });
  assert.deepEqual(validateAdd({ ...base, year: 3001 }), {
    year: "Enter a year between 1000 and 3000.",
  });
  assert.deepEqual(validateAdd({ ...base, year: 2026.5 }), {
    year: "Enter a year between 1000 and 3000.",
  });
});

test("kind must be known", () => {
  for (const kind of ["movie", "tv", "book", "game", "artist", "album", "track"])
    assert.deepEqual(validateAdd({ title: "Dune", kind, year: null }), {});
  assert.deepEqual(validateAdd({ title: "Dune", kind: "podcast", year: null }), {
    kind: "Choose a type.",
  });
  assert.deepEqual(validateAdd({ title: "Dune", kind: "", year: null }), {
    kind: "Choose a type.",
  });
});

test("only invalid keys returned", () => {
  assert.deepEqual(validateAdd({ title: "Dune", kind: "book", year: 2024 }), {});
  assert.deepEqual(validateAdd({ title: "", kind: "podcast", year: 99 }), {
    title: "Enter a title.",
    kind: "Choose a type.",
    year: "Enter a year between 1000 and 3000.",
  });
  assert.deepEqual(FIELD_ORDER, ["title", "kind", "year"]);
});
