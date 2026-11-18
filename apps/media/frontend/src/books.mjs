/** Reading shelves. Grouping uses a canonical id, never a similar title or name. */

const AUTHOR_ID = /^openlibrary:OL[1-9]\d{0,12}A$/;
const SERIES_ID = /^openlibrary:OL[1-9]\d{0,12}S$/;

const SHELVES = [
  { id: "current", status: "in_progress", label: "Current", empty: "Nothing you're reading right now." },
  { id: "read", status: "completed", label: "Read", empty: "No finished books on this shelf." },
  { id: "to-read", status: "want", label: "To read", empty: "Nothing waiting to be read." },
  { id: "other", status: "", label: "Other reading states", empty: "" },
];

export function bookShelfId(status) {
  return SHELVES.find((shelf) => shelf.status === status)?.id || "other";
}

function canonical(value, pattern) {
  if (!value || typeof value !== "object") return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!pattern.test(id)) return null;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  return { id, name };
}

/** A display name is not an identity. Unlinked creators stay unlinked. */
export function bookAuthorLine(card) {
  const author = canonical(card?.author, AUTHOR_ID);
  const creator = typeof card?.creator === "string" ? card.creator.trim() : "";
  if (author) {
    return { id: author.id, linked: true, text: author.name || "Linked author" };
  }
  if (creator) return { id: null, linked: false, text: `${creator} · not linked` };
  return { id: null, linked: false, text: "Author not linked" };
}

export function bookSeriesLine(card) {
  const series = canonical(card?.series, SERIES_ID);
  if (!series) return null;
  return { id: series.id, text: series.name || "Series" };
}

/** Recorded progress only. Unknown stays unknown; a finished book is not 100%. */
export function bookProgressFact(card) {
  const label = typeof card?.progress_label === "string" ? card.progress_label.trim() : "";
  return label || "Progress unknown";
}

export function noteExcerpt(value) {
  const collapsed = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  const limit = 160;
  if ([...collapsed].length <= limit) return collapsed;
  const units = [...collapsed];
  let cut = units.slice(0, limit).join("");
  const word = cut.lastIndexOf(" ");
  if (word >= 40) cut = cut.slice(0, word);
  return cut.replace(/[.,;:—\- ]+$/u, "") + "…";
}

function countIds(books, read) {
  const counts = new Map();
  for (const book of books) {
    const id = read(book);
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

function blocksFor(books) {
  const seriesCount = countIds(books, (book) => bookSeriesLine(book)?.id || "");
  const seriesBlocks = new Map();
  const placed = new Set();
  const blocks = [];
  for (const book of books) {
    const series = bookSeriesLine(book);
    if (!series || seriesCount.get(series.id) < 2) continue;
    let block = seriesBlocks.get(series.id);
    if (!block) {
      block = { type: "series", id: series.id, label: series.text, books: [] };
      seriesBlocks.set(series.id, block);
      blocks.push(block);
    }
    if (!block.label || block.label === "Series") block.label = series.text;
    block.books.push(book);
    placed.add(book.id);
  }
  const loose = books.filter((book) => !placed.has(book.id));
  const authorCount = countIds(loose, (book) => bookAuthorLine(book).id || "");
  const authorBlocks = new Map();
  for (const book of books) {
    if (placed.has(book.id)) continue;
    const author = bookAuthorLine(book);
    if (!author.id || authorCount.get(author.id) < 2) {
      blocks.push({ type: "book", id: `book-${book.id}`, label: "", books: [book] });
      continue;
    }
    let block = authorBlocks.get(author.id);
    if (!block) {
      block = { type: "author", id: author.id, label: author.text, books: [] };
      authorBlocks.set(author.id, block);
      blocks.push(block);
    }
    block.books.push(book);
  }
  return blocks;
}

function shelfLabel(status) {
  if (status === "in_progress") return "Current";
  if (status === "completed") return "Read";
  if (status === "want") return "To read";
  if (status === "paused") return "Paused";
  if (status === "dropped") return "Dropped";
  if (status === "anticipating") return "Anticipating";
  return "Other reading states";
}

function emptyFor(status) {
  if (status === "paused") return "No paused books on this shelf.";
  if (status === "dropped") return "No dropped books on this shelf.";
  if (status === "anticipating") return "No anticipated books on this shelf.";
  return "No books in this reading state.";
}

/** Shelves keep server order. Series and author blocks need two real ids. */
export function visibleShelves(items, status) {
  const books = Array.isArray(items) ? items : [];
  const shelves = SHELVES.map((shelf) => ({
    ...shelf,
    books: books.filter((book) => bookShelfId(book?.status) === shelf.id),
  })).map((shelf) => ({ ...shelf, blocks: blocksFor(shelf.books) }));
  if (!status) return shelves.filter((shelf) => shelf.id !== "other" || shelf.books.length > 0);
  const id = bookShelfId(status);
  return shelves
    .filter((shelf) => shelf.id === id)
    .map((shelf) => ({
      ...shelf,
      label: shelfLabel(status),
      empty: shelf.empty || emptyFor(status),
    }));
}
