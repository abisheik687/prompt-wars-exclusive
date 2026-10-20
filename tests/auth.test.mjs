import assert from "node:assert/strict";
import test from "node:test";
import { bearerToken, createAuthenticator, ownedBy } from "../server/auth.js";

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
}

test("bearer token parsing rejects malformed or missing authorization", () => {
  assert.equal(bearerToken("Bearer abc.def"), "abc.def");
  assert.equal(bearerToken("Basic abc"), null);
  assert.equal(bearerToken(undefined), null);
});

test("authentication trusts only verified token identity and rejects invalid tokens", async () => {
  const middleware = createAuthenticator({ enabled: true, verifyToken: async (token) => {
    if (token !== "valid") throw new Error("invalid token");
    return { uid: "verified-user", email: "ignored@example.test" };
  } });
  const req = { get: () => "Bearer valid", body: { userId: "attacker" } };
  const res = response(); let proceeded = false;
  await middleware(req, res, () => { proceeded = true; });
  assert.equal(proceeded, true);
  assert.deepEqual(req.user, { uid: "verified-user" });

  const invalidReq = { get: () => "Bearer wrong" }, invalidRes = response();
  await middleware(invalidReq, invalidRes, () => assert.fail("invalid auth must stop"));
  assert.equal(invalidRes.statusCode, 401);
});

test("missing cloud credentials cannot access an auth-required event", async () => {
  const middleware = createAuthenticator({ enabled: true, verifyToken: async () => ({ uid: "user-a" }) });
  const res = response();
  await middleware({ get: () => undefined }, res, () => assert.fail("missing auth must stop"));
  assert.equal(res.statusCode, 401);
});

test("event ownership is derived from the stored owner field", () => {
  assert.equal(ownedBy({ ownerId: "user-a" }, "user-a"), true);
  assert.equal(ownedBy({ ownerId: "user-a" }, "user-b"), false);
  assert.equal(ownedBy({ ownerId: "user-a" }, undefined), false);
});
