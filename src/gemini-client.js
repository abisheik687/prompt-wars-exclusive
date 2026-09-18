/**
 * Progressive enhancement for the deployed Firebase endpoint. A local, source
 * matched answer remains available when running the static demo or if Gemini is
 * unavailable, so an outage never turns an answer into an unsupported claim.
 */
export async function requestGroundedAnswer(question, analysis, { endpoint = "/api/grounded-answer", fetcher = globalThis.fetch, locationInfo = globalThis.location } = {}) {
  if (locationInfo?.protocol === "file:" || typeof fetcher !== "function") return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        question,
        clauses: analysis.clauses.map(({ id, title, text }) => ({ id, title, text })),
      }),
    });
    if (!response.ok) return null;
    const result = await response.json();
    if (typeof result?.found !== "boolean" || typeof result?.answer !== "string") return null;
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
