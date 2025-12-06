// worker/bnkidsstories_worker.js
// BN-Kids-Stories StoryEngine v2.3 – Dual Model + Safe Rewrite Layer + åldersbaserad längd

// ======================================================
// MODELLER (AUTO-VÄLJ UTIFRÅN PROMPTEN)
// ======================================================
const SAFE_MODEL = "gpt-4.1-mini";   // billig, snäll bas
const ACTION_MODEL = "gpt-4.1";      // starkare modell för action / cyborg / laser osv

// ======================================================
// BN SAFE REWRITE ENGINE – v1 (konfig bara, används av funktioner nedan)
// ======================================================
const BN_SAFE_REWRITE_ENGINE_V1 = {
  disallowedHardTerms: [
    "döda",
    "dödar",
    "dödade",
    "slakta",
    "slaktade",
    "skjuta ihjäl",
    "skjuter ihjäl",
    "blod",
    "blodig",
    "blodbad",
    "lemlästa",
    "lemlästad",
    "krig på riktigt",
    "tortyr",
    "mörda",
    "mördade"
  ],
  softReplacements: [
    // [sök, ersätt]
    ["attack", "gå till anfall med sina krafter på ett lekfullt sätt"],
    ["attackerar", "testar sina krafter"],
    ["attackerade", "gjorde ett modigt försök"],
    ["krig", "stort äventyr"],
    ["soldat", "hjälte"],
    ["soldater", "hjältar"],
    ["vapen", "magiska prylar"],
    ["pistol", "magisk ljusstav"],
    ["gevär", "energivarnare"],
    ["bomb", "stor ljus-smäll"],
    ["bomber", "ljus-smällar"],
    ["explosion", "färgsprakande ljusvåg"],
    ["explosioner", "färgsprakande ljusvågor"],
    ["laserögon", "ögon som skickar ut färgglada ljusstrålar"],
    ["laser", "färgglada ljusstrålar"],
    ["cyborgarmen", "cyborg-gänget"],
    ["cyborg armén", "cyborg-gänget"],
    ["fiende", "motspelare"],
    ["fiender", "motspelare"]
  ],
  toneHints: {
    "3-6": "Håll allt extra mjukt och tryggt, inga läskiga detaljer, betona vänskap och humor.",
    "7-11": "Tillåt mer fart och äventyr men låt våld bli magi, energi och lekar.",
    "12-15": "Mer avancerad handling, men fortfarande utan blod, tortyr eller realism i våldet."
  }
};

// ======================================================
// SYSTEMPROMPT – kärnan (justerad för att undvika floskelspam)
// ======================================================
const BN_KIDS_STORIES_SYSTEM_PROMPT = `
Du är BN-Kids-Stories StoryEngine v2.

Ditt jobb är att skriva kapitel i kapitelböcker för barn och unga ca 8–15 år
baserat på en JSON-request som du alltid får i USER-meddelandet.

Du skriver på svenska och följer alltid vår ton:
- spännande, trygg, äventyrlig
- inga svordomar
- inget blod, ingen tortyr, inga realistiska våldsscener
- inga kända karaktärer eller upphovsrättsskyddat material

Viktigt om stil:
- Du får gärna ha tema som mod, vänskap och samarbeten MEN
  använd inte samma fraser om och om igen.
- Undvik slitna formuleringar som:
  "med mod och vänskap", "ljuset segrar", "hjärtat fylldes av hopp",
  "äventyret har bara börjat" eller liknande klichéer.
- Slutet på ett kapitel ska kännas naturligt:
  ibland lite öppet, ibland lugnt avslut – men inte alltid exakt samma typ av cliffhanger.

Våld & farliga ord:
- Du får använda fantasi: robotar, cyborgar, monster, vargar, laserögon etc.
- Om något kan tolkas som brutalt våld ska du själv omforma det till en trygg, lekfull variant
  (energi-strålar, magiska krafter, mekaniska utmaningar istället för skada).
- Inget blod, inga sönderslagna kroppar, ingen tortyr.

Story-struktur:
- Använd previous_chapters och summary_so_far för att hålla röd tråd.
- Upprepa inte långa meningar eller stycken ordagrant.
- Varje kapitel ska ha början, mitt och slut – även om boken fortsätter sen.
`;

// ======================================================
// MODELLVAL – baserat på prompten (action -> starkare modell)
// ======================================================
function pickModel(promptText) {
  if (!promptText) return SAFE_MODEL;
  const ACTION_WORDS = [
    "cyborg",
    "robot",
    "laser",
    "varg",
    "attack",
    "krig",
    "strid",
    "förstärkning",
    "monster",
    "uppgradera",
    "soldat",
    "jaga",
    "demon",
    "zombie",
    "fiende",
    "armé",
    "armén"
  ];
  const lower = promptText.toLowerCase();
  for (const w of ACTION_WORDS) {
    if (lower.includes(w)) {
      return ACTION_MODEL;
    }
  }
  return SAFE_MODEL;
}

// ======================================================
// SAFE REWRITE – gör råprompten barnvänlig utan att blocka
// ======================================================
function softRewritePrompt(originalPrompt, childAge) {
  if (!originalPrompt || typeof originalPrompt !== "string") {
    return { safePrompt: "", rewritten: false, hardBlocked: false };
  }

  let safe = originalPrompt;
  let rewritten = false;

  // 1) Ta bort hårda termer helt (döda, blod, tortyr...)
  for (const bad of BN_SAFE_REWRITE_ENGINE_V1.disallowedHardTerms) {
    const regex = new RegExp(bad, "gi");
    if (regex.test(safe)) {
      safe = safe.replace(regex, "");
      rewritten = true;
    }
  }

  // 2) Mjuka ersättningar (attack -> testa sina krafter, osv)
  for (const [from, to] of BN_SAFE_REWRITE_ENGINE_V1.softReplacements) {
    const regex = new RegExp(from, "gi");
    if (regex.test(safe)) {
      safe = safe.replace(regex, to);
      rewritten = true;
    }
  }

  // 3) Trimma och se till att något finns kvar
  safe = safe.trim();
  if (!safe) {
    safe = "Ett spännande men tryggt äventyr med fantasi och magi.";
    rewritten = true;
  }

  return {
    safePrompt: safe,
    rewritten,
    hardBlocked: false // vi blockerar aldrig, vi bara mjukar upp
  };
}

// ======================================================
// CORS-helper
// ======================================================
function corsResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Content-Type": "application/json"
    }
  });
}

// ======================================================
// HUVUDFUNKTION – Cloudflare Worker
// ======================================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---------- HEALTH CHECK ----------
    if (url.pathname === "/health") {
      return corsResponse(
        JSON.stringify({
          ok: true,
          worker: "bn-kids-stories StoryEngine v2.3",
          note: "dual model + safe rewrite + age-based length active"
        })
      );
    }

    // ---------- OPTIONS / CORS ----------
    if (request.method === "OPTIONS") {
      return corsResponse("", 204);
    }

    // ---------- STORY API ----------
    if (url.pathname === "/api/story" && request.method === "POST") {
      try {
        const apiKey = env.OPENAI_API_KEY;
        if (!apiKey) {
          return corsResponse(
            JSON.stringify({
              ok: false,
              error: "OPENAI_API_KEY saknas i Worker-secrets."
            }),
            500
          );
        }

        const rawBody = await request.text();
        let payload;
        try {
          payload = JSON.parse(rawBody || "{}");
        } catch (err) {
          return corsResponse(
            JSON.stringify({
              ok: false,
              error: "Kunde inte parsa JSON från klienten."
            }),
            400
          );
        }

        const {
          mode,
          child_name,
          child_age,
          book_title,
          chapter_index,
          previous_chapters,
          summary_so_far,
          child_prompt
        } = payload;

        // Enkel validering
        if (!child_name || !book_title || !child_prompt) {
          return corsResponse(
            JSON.stringify({
              ok: false,
              error:
                "Saknar child_name, book_title eller child_prompt i payload."
            }),
            400
          );
        }

        // ---------- SAFE REWRITE LAGER ----------
        const ageNum =
          typeof child_age === "number"
            ? child_age
            : parseInt(child_age, 10) || 10;

        const { safePrompt, rewritten } = softRewritePrompt(
          child_prompt,
          ageNum
        );

        // Bygg payload för modellen – vi skickar den säkra versionen
        const storyPayloadForModel = {
          mode,
          child_name,
          child_age: ageNum,
          book_title,
          chapter_index,
          previous_chapters,
          summary_so_far,
          child_prompt: safePrompt
        };

        // ---------- MODELLVAL ----------
        const chosenModel = pickModel(child_prompt || safePrompt || "");

        // ---------- NYTT: FULLT ÅLDERSBASERAT LÄNGDSYSTEM v1 ----------
        // Du kan ändra siffrorna här UTAN att något annat påverkas.
        // Alla värden är "max_tokens" → ungefär tokens ≈ 0.75 * antal ord.

        let maxTokens = 900; // fallback om ålder saknas eller är konstig

        if (ageNum >= 3 && ageNum <= 6) {
          // 3–6 år: kortare, mycket mjuka kapitel
          maxTokens = 600; // ~450–550 ord
        } else if (ageNum >= 7 && ageNum <= 9) {
          // 7–9 år: mer fart men barnvänligt
          maxTokens = 1100; // ~800–900 ord
        } else if (ageNum >= 10 && ageNum <= 12) {
          // 10–12 år: längre story, mer komplexitet
          maxTokens = 1400; // ~1000–1150 ord
        } else if (ageNum >= 13 && ageNum <= 15) {
          // 13–15 år: längst, mest detaljer
          maxTokens = 1700; // ~1300–1500 ord
        } else {
          // Ålder över 15 eller helt off
          maxTokens = 1200;
        }

        // ---------- CALL OPENAI VIA FETCH ----------
        const openaiResponse = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: chosenModel,
              messages: [
                { role: "system", content: BN_KIDS_STORIES_SYSTEM_PROMPT },
                {
                  role: "user",
                  content: JSON.stringify(storyPayloadForModel)
                }
              ],
              temperature: 0.8,
              max_tokens: maxTokens
            })
          }
        );

        if (!openaiResponse.ok) {
          const errText = await openaiResponse.text().catch(() => "");
          return corsResponse(
            JSON.stringify({
              ok: false,
              error: `OpenAI-svar (${openaiResponse.status}): ${errText}`
            }),
            500
          );
        }

        const completionJson = await openaiResponse.json().catch(() => null);
        const chapterText =
          completionJson?.choices?.[0]?.message?.content?.trim() || "";

        if (!chapterText) {
          return corsResponse(
            JSON.stringify({
              ok: false,
              error: "OpenAI svarade utan kapiteltext."
            }),
            500
          );
        }

        const nextIndex =
          typeof chapter_index === "number" ? chapter_index + 1 : 1;

        // ---------- SVAR TILL FRONTEND ----------
        return corsResponse(
          JSON.stringify({
            ok: true,
            model_used: chosenModel,
            safe_prompt: safePrompt,
            prompt_rewritten: rewritten,
            chapter_index: nextIndex,
            chapter_text: chapterText,
            summary_so_far: summary_so_far || ""
          }),
          200
        );
      } catch (err) {
        return corsResponse(
          JSON.stringify({
            ok: false,
            error: err?.message || "StoryEngine-fel i Workern."
          }),
          500
        );
      }
    }

    // ---------- FALLBACK ----------
    return corsResponse(
      JSON.stringify({ ok: false, error: "Not found" }),
      404
    );
  }
};
