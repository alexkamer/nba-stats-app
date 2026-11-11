/**
 * Local Ollama client, used solely by the Baseline Briefing's once-per-day
 * summary generation (briefing-summary-generation). Chosen over a cloud
 * API so this feature needs no secret at all — no API key, no AWS
 * credentials, nothing to keep out of git — just a local Ollama server
 * (see design.md "Model choice"). Only ever called from the API route
 * (server-side), same convention as src/lib/db.ts.
 */

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";

// Smallest/fastest model already pulled locally — plenty for a one-
// sentence summary generated from a tiny, already-computed fact payload.
export const BRIEFING_SUMMARY_MODEL = "llama3.2:3b";

/** Calls the local Ollama server's generate endpoint. Throws on a network
 * error or non-OK response — the caller (summary.ts) already treats any
 * thrown error as "no usable text" and omits the summary line. */
export async function generateWithOllama(prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: BRIEFING_SUMMARY_MODEL,
      prompt,
      stream: false,
      // A multi-sentence recap needs more headroom than Ollama's ~128-token
      // default. Temperature is a deliberate compromise, not the default
      // 0.8: testing showed 0.8 occasionally produces a wild, confidently
      // wrong tangent (inventing a team/score for a named player) even
      // with strong anti-fabrication instructions — 0.5 trades a little
      // liveliness for noticeably fewer of those outliers, which matters
      // more than flair for a fact-driven recap (see design.md).
      options: { num_predict: 220, temperature: 0.5 },
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama request failed: ${res.status}`);
  }
  const data = (await res.json()) as { response?: string };
  return (data.response ?? "").trim();
}
