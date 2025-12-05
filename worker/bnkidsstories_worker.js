// worker/bnkidsstories_worker.js
// BN-Kids-Stories StoryEngine v2.0 – Dual-Model (mini + 4.1)

// ======================================================
// MODELLER (AUTO-VÄLJ UTIFRÅN PROMPTEN)
// ======================================================
const SAFE_MODEL = "gpt-4.1-mini";   // billigt, snällt
const ACTION_MODEL = "gpt-4.1";      // tål action, cyborgar, vargar, laserögon

// ======================================================
// SYSTEMPROMPT – oförändrad kärna
// ======================================================
const BN_KIDS_STORIES_SYSTEM_PROMPT = `
Du är BN-Kids-Stories StoryEngine v1.

Ditt jobb är att skriva kapitel i kapitelböcker för barn och unga ca 8–15 år
baserat på en JSON-request som du alltid får i USER-meddelandet.

Du skriver på svenska och följer alltid vår ton:
• spännande, trygga, äventyrliga
• aldrig grovt våld
• inga svordomar
• ingen blodig brutalitet
• inga kända karaktärer eller copyright-material

Du får använda:
• fantasi, robotar, cyborgar, monster, magi, vargar, laserögon etc
• så länge tonen hålls barnvänlig (8–15 år)
• ingen blod, ingen tortyr, inga personskador

Regel: fortsättningen måste bygga på previous_chapters och summary_so_far.
Repetera inte exakt samma meningar. För handlingen framåt.
`;

// ======================================================
// Välj modell automatiskt utifrån prompten
// ======================================================
function pickModel(promptText) {
  if (!promptText) return SAFE_MODEL;

  const ACTION_WORDS = [
    "cyborg", "robot", "laser", "varg", "attack", "krig",
    "strid", "förstärkning", "monster", "uppgradera", "soldat",
    "jaga", "demon", "zombie", "fiende"
  ];

  const lower = promptText.toLowerCase();

  for (const w of ACTION_WORDS) {
    if (lower.includes(w)) {
      return ACTION_MODEL; // Välj kraftigare modell
    }
  }

  return SAFE_MODEL; // Default snäll
}

// ======================================================
// Mini-helper för CORS
// ======================================================
function corsResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Content-Type": "application/json",
    },
  });
}

// ======================================================
// Event Listener – huvudroutning
// ======================================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // -------- HEALTH CHECK --------
    if (url.pathname === "/health") {
      return corsResponse(
        JSON.stringify({ ok: true, worker: "bn-kids-stories TESTWORKER v2.0" })
      );
    }

    // -------- CORS PREFLIGHT --------
    if (request.method === "OPTIONS") {
      return corsResponse("", 204);
    }

    // -------- STORY ENDPOINT --------
    if (url.pathname === "/api/story" && request.method === "POST") {
      try {
        const text = await request.text(); // vi skickar text/plain från klienten
        const payload = JSON.parse(text);

        const {
          mode,
          child_name,
          child_age,
          book_title,
          chapter_index,
          previous_chapters,
          summary_so_far,
          child_prompt,
        } = payload;

        // -----------------------------
        // AUTO-MODELLVAL
        // -----------------------------
        const chosenModel = pickModel(child_prompt || "");

        // -----------------------------
        // CALL OPENAI
        // -----------------------------
        const completion = await env.OPENAI_API.chat.completions.create({
          model: chosenModel,
          messages: [
            { role: "system", content: BN_KIDS_STORIES_SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(payload) },
          ],
          max_tokens: 650, // ca 600 ord
          temperature: 0.8,
        });

        const raw = completion.choices?.[0]?.message?.content || "";

        // -----------------------------
        // RESPONS TILL FRONTEND
        // -----------------------------
        return corsResponse(
          JSON.stringify({
            ok: true,
            model_used: chosenModel,
            chapter_index: (chapter_index || 0) + 1,
            chapter_text: raw,
            summary_so_far: summary_so_far || "",
          })
        );
      } catch (err) {
        return corsResponse(
          JSON.stringify({
            ok: false,
            error: err.message || "StoryEngine-fel.",
          }),
          500
        );
      }
    }

    // -------- FALLBACK --------
    return corsResponse(JSON.stringify({ ok: false, error: "Not found" }), 404);
  },
};
