// Consumer-side fake of the drawList function that the plugin sections import from the plugin API.
// The real function keeps the element of each key in the document across redraws, creates an element
// only for a new key, and moves an element only when its order is wrong (core docs/spec/exposure.md).
// This fake keeps the same create, update and element-reuse contract. The owning package tests the function itself.
const drawn = new WeakMap();

export function drawList(container, items, { key, create, update }) {
  const previous = drawn.get(container) ?? new Map();
  const next = new Map();
  const ordered = [];
  for (const item of items) {
    const itemKey = key(item);
    if (next.has(itemKey)) throw new Error("drawList: duplicate key " + itemKey);
    let element = previous.get(itemKey);
    if (element !== undefined && element.parentNode === container) {
      update(element, item);
    } else {
      element = create(item);
    }
    next.set(itemKey, element);
    ordered.push(element);
  }
  const kept = new Set(ordered);
  for (const child of [...container.childNodes]) {
    if (!kept.has(child)) child.remove();
  }
  ordered.forEach((element, index) => {
    if (container.childNodes[index] !== element) container.insertBefore(element, container.childNodes[index] ?? null);
  });
  drawn.set(container, next);
}
