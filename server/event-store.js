import { ownedBy } from "./auth.js";

export async function saveOwnedEvent(store, collectionName, event, uid) {
  const ref = store.collection(collectionName).doc(event.id);
  return store.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (current.exists && !ownedBy(current.data(), uid)) return false;
    tx.set(ref, { ...event, ownerId: uid });
    return true;
  });
}

export async function getOwnedEvent(store, collectionName, id, uid) {
  const doc = await store.collection(collectionName).doc(id).get();
  return doc.exists && ownedBy(doc.data(), uid) ? doc.data() : null;
}

export async function deleteOwnedEvent(store, collectionName, id, uid) {
  const ref = store.collection(collectionName).doc(id);
  return store.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists || !ownedBy(doc.data(), uid)) return false;
    tx.delete(ref);
    return true;
  });
}

export async function listOwnedEvents(store, collectionName, uid) {
  const snapshot = await store.collection(collectionName).where("ownerId", "==", uid).limit(100).get();
  return snapshot.docs.map((doc) => doc.data());
}
