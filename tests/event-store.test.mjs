import assert from "node:assert/strict";
import test from "node:test";
import { deleteOwnedEvent, getOwnedEvent, listOwnedEvents, saveOwnedEvent } from "../server/event-store.js";

function fakeStore() {
  const records = new Map();
  return {
    records,
    collection() {
      return {
        doc(id) { return { id, get: async () => ({ exists: records.has(id), data: () => records.get(id) }) }; },
        where(field, operator, value) {
          assert.deepEqual([field, operator], ["ownerId", "=="]);
          return { limit: () => ({ get: async () => ({ docs: [...records.values()].filter((x) => x.ownerId === value).slice(0, 100).map((data) => ({ data: () => data })) }) }) };
        },
      };
    },
    async runTransaction(fn) {
      return fn({
        get: async (ref) => ({ exists: records.has(ref.id), data: () => records.get(ref.id) }),
        set: (ref, data) => records.set(ref.id, data),
        delete: (ref) => records.delete(ref.id),
      });
    },
  };
}

test("event persistence enforces owner isolation for read, update, list, and delete", async () => {
  const store = fakeStore(), event = { id: "event-123", name: "Private" };
  assert.equal(await saveOwnedEvent(store, "events", event, "alice"), true);
  assert.equal(store.records.get(event.id).ownerId, "alice");
  assert.equal(await getOwnedEvent(store, "events", event.id, "bob"), null);
  assert.equal(await saveOwnedEvent(store, "events", { ...event, name: "stolen" }, "bob"), false);
  assert.equal(store.records.get(event.id).name, "Private");
  assert.deepEqual(await listOwnedEvents(store, "events", "bob"), []);
  assert.equal(await deleteOwnedEvent(store, "events", event.id, "bob"), false);
  assert.ok(await getOwnedEvent(store, "events", event.id, "alice"));
  assert.deepEqual(await listOwnedEvents(store, "events", "alice"), [store.records.get(event.id)]);
  assert.equal(await deleteOwnedEvent(store, "events", event.id, "alice"), true);
  assert.equal(store.records.has(event.id), false);
});

test("event repository propagates persistence failures for safe API handling", async () => {
  const store = { collection: () => { throw new Error("database offline"); } };
  await assert.rejects(getOwnedEvent(store, "events", "id", "alice"), /database offline/);
});
