export function bearerToken(header) {
  const match = typeof header === "string" && header.match(/^Bearer ([^\s]+)$/i);
  return match?.[1] || null;
}

export function createAuthenticator({ enabled, verifyToken }) {
  return async function authenticate(req, res, next) {
    if (!enabled) {
      req.user = null;
      return next();
    }
    const token = bearerToken(req.get("authorization"));
    if (!token) return res.status(401).json({ error: "Sign in to access cloud events." });
    try {
      const identity = await verifyToken(token);
      if (!identity || typeof identity.uid !== "string" || !identity.uid)
        throw new Error("Invalid identity");
      req.user = { uid: identity.uid };
      return next();
    } catch {
      return res.status(401).json({ error: "Your sign-in has expired. Please sign in again." });
    }
  };
}

export function ownedBy(event, uid) {
  return Boolean(uid && event?.ownerId === uid);
}
