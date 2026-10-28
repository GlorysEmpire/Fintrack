/**
 * FinTrack AI — server only (never call xAI from the browser).
 * Provider: SpaceXAI / xAI (OpenAI-compatible API).
 * Env: XAI_API_KEY
 *
 * If no key: offlineAdvisorReply() keeps the product usable.
 */
import OpenAI from "openai";
import { buildAdvisorSystemPrompt, offlineAdvisorReply } from "@fintrack/domain";

export function hasXaiKey(): boolean {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

function client() {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({
    apiKey: key,
    baseURL: "https://api.x.ai/v1",
  });
}

/**
 * Ask the Steward. Uses SpaceXAI when keyed; otherwise offline rules.
 */
export async function askSteward(opts: {
  userMessage: string;
  history: { role: "user" | "assistant"; content: string }[];
  context: string;
  offlineCtx: {
    income: number;
    expenses: number;
    net: number;
    planName: string | null;
    bucketLines: string[];
    overrideCount: number;
    insightLines?: string[];
  };
}): Promise<{ reply: string; mode: "xai" | "offline" }> {
  const system = buildAdvisorSystemPrompt(opts.context);
  const c = client();

  if (!c) {
    return {
      reply: offlineAdvisorReply(opts.userMessage, opts.offlineCtx),
      mode: "offline",
    };
  }

  try {
    // OpenAI-compatible chat completions on xAI
    const completion = await c.chat.completions.create({
      model: process.env.XAI_MODEL || "grok-4-1-fast-non-reasoning",
      max_tokens: 700,
      messages: [
        { role: "system", content: system },
        ...opts.history.slice(-12).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user", content: opts.userMessage },
      ],
    });

    const reply =
      completion.choices[0]?.message?.content?.trim() ||
      "I could not form a reply. Try again.";
    return { reply, mode: "xai" };
  } catch (e) {
    console.error("xAI error", e);
    return {
      reply:
        offlineAdvisorReply(opts.userMessage, opts.offlineCtx) +
        "\n\n(The online Steward could not be reached just now, so this is the guided answer. Try again in a moment.)",
      mode: "offline",
    };
  }
}
