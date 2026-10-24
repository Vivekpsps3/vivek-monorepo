import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { TOAST_LIMIT, createToastLayer } from "../../../../../packages/browser/runtime/toast.mjs";

class Node {
  constructor(tag, doc) {
    this.tagName = String(tag || "div").toUpperCase();
    this.doc = doc;
    this.children = [];
    this.parent = null;
    this.dataset = {};
    this.className = "";
    this.style = {};
    this.attrs = {};
    this.listeners = new Map();
    this.textContent = "";
    this.id = "";
    this.type = "";
  }
  setAttribute(name, value) {
    this.attrs[name] = String(value);
    if (name === "id") this.id = String(value);
  }
  getAttribute(name) {
    return this.attrs[name];
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
  addEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  dispatch(type, event = {}) {
    for (const fn of this.listeners.get(type) || []) fn(event);
  }
  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }
  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => {
      if (selector === ".toast" && node.className.split(/\s+/).includes("toast")) found.push(node);
      node.children.forEach(walk);
    };
    this.children.forEach(walk);
    return found;
  }
}

function documentWithRegions() {
  const doc = {
    nodes: new Map(),
    getElementById(id) {
      return this.nodes.get(id) || null;
    },
    createElement(tag) {
      return new Node(tag, this);
    },
  };
  for (const id of ["toasts", "toast-alerts"]) {
    const node = new Node("div", doc);
    node.id = id;
    doc.nodes.set(id, node);
  }
  return doc;
}

function layer() {
  return createToastLayer({ document: documentWithRegions() });
}

test("toasts are keyed, capped at three, and alert toasts carry the warning glyph", () => {
  const toast = layer();
  toast.toast("Saved the city.");
  const retry = toast.toast("Couldn't save the trip.", "alert", { label: "Retry", persist: true, key: "save" });
  assert.equal(retry.querySelectorAll(".toast").length, 0);
  assert.equal(retry.className.includes("is-alert"), true);
  assert.equal(retry.children.some((child) => child.textContent === "⚠"), true);
  assert.equal(retry.dataset.persist, "true");
  assert.equal(retry.dataset.toastKey, "save");
  toast.toast("Couldn't save the trip.", "alert", { label: "Retry", persist: true, key: "save" });
  const alerts = toast.toastNodes().filter((node) => node.dataset.toastKey === "save");
  assert.equal(alerts.length, 1);
  for (let index = 0; index < 5; index += 1) toast.toast(`Note ${index}`);
  assert.equal(toast.toastNodes().length, TOAST_LIMIT);
});

test("a plain toast leaves after five seconds and a persistent one stays", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const toast = layer();
    toast.toast("City added.");
    const kept = toast.toast("Couldn't save.", "alert", { label: "Retry", persist: true, key: "retry" });
    assert.equal(toast.toastNodes().length, 2);
    mock.timers.tick(5000);
    assert.equal(toast.toastNodes().length, 1);
    assert.equal(toast.toastNodes()[0], kept);
    mock.timers.tick(60_000);
    assert.equal(toast.toastNodes().length, 1);
  } finally {
    mock.timers.reset();
  }
});

test("hover pauses the toast timer", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const toast = layer();
    const node = toast.toast("Ride added.");
    mock.timers.tick(4000);
    node.dispatch("mouseenter");
    mock.timers.tick(10_000);
    assert.equal(toast.toastNodes().length, 1);
    node.dispatch("mouseleave");
    mock.timers.tick(1000);
    assert.equal(toast.toastNodes().length, 0);
  } finally {
    mock.timers.reset();
  }
});

test("focus inside a toast pauses its timer", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const toast = layer();
    const node = toast.toast("Ride added.");
    mock.timers.tick(4000);
    node.dispatch("focusin");
    mock.timers.tick(10_000);
    assert.equal(toast.toastNodes().length, 1);
    node.dispatch("focusout", { relatedTarget: null });
    mock.timers.tick(1000);
    assert.equal(toast.toastNodes().length, 0);
  } finally {
    mock.timers.reset();
  }
});

test("clicking a toast action dismisses that toast", () => {
  const toast = layer();
  let clicked = 0;
  const node = toast.toast("Ride deleted.", "status", {
    label: "Undo",
    onClick() {
      clicked += 1;
    },
  });
  node.children.find((child) => child.className === "toast-action").dispatch("click");
  assert.equal(clicked, 1);
  assert.equal(toast.toastNodes().length, 0);
});

test("a fourth toast evicts the oldest and the cap stays at three", () => {
  assert.equal(TOAST_LIMIT, 3);
  const toast = layer();
  for (const message of ["one", "two", "three", "four"]) toast.toast(message);
  const messages = toast.toastNodes().map((node) => node.children.find((child) => child.tagName === "P").textContent);
  assert.deepEqual(messages, ["two", "three", "four"]);
});

test("a late item failure keeps a key that item changes do not retire", () => {
  const toast = layer();
  globalThis.location = { hash: "#/item/9" };
  try {
    const late = toast.pushToast({
      message: "Couldn't save the note.",
      kind: "alert",
      key: "note:4",
      persist: true,
    });
    assert.equal(late.dataset.toastKey, "save-failed:note:4");
    assert.equal(late.children.find((child) => child.tagName === "P").textContent, "Save failed for this item.");
    toast.pushToast({ message: "Still here.", kind: "alert", key: "note:9", persist: true });
    toast.retireOtherItemToasts("9");
    const keys = toast.toastNodes().map((node) => node.dataset.toastKey);
    assert.deepEqual(keys.sort(), ["note:9", "save-failed:note:4"]);
  } finally {
    delete globalThis.location;
  }
});

test("an action toast waits eight seconds", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const toast = layer();
    toast.toast("Ride deleted.", "status", { label: "Undo", onClick() {} });
    mock.timers.tick(5000);
    assert.equal(toast.toastNodes().length, 1);
    mock.timers.tick(3000);
    assert.equal(toast.toastNodes().length, 0);
  } finally {
    mock.timers.reset();
  }
});
