// worker/bnkidsstories_worker.js
// BN-Kids-Stories StoryEngine v2.3 – Dual Model + Safe Rewrite + Escalation Control

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
// SYSTEMPROMPT – kärnan (justerad för floskel & eskalation & konsistens)
// ======================================================
const BN_KIDS_STORIES_SYSTEM_PROMPT = `
Du är BN-Kids-Stories StoryEngine v2.3.

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

NO FORCED ESCALATION – hur magi och äventyr får växa:
- JSON:en innehåller chapter_number = vilket kapitel som ska skrivas nu (1, 2, 3, ...).
- Om barnet INTE nämner magiska saker i sin prompt:
  * Kapitel 1: håll berättelsen helt vardaglig. Ingen magisk sten, ingen portal,
    inga talande djur eller uppdrag. Låt lek, relationer, miljö och känslor bära kapitlet.
  * Kapitel 2: du får bara antyda mystik på ett milt sätt
    (t.ex. konstigt ljud, något som glittrar, en känsla av att något är speciellt)
    men introducera inte fullfjädrad magi, uppdrag eller stora hemligheter ännu.
  * Kapitel 3 och framåt: nu får magi och äventyr ta fart – OM barnets prompt pekar åt det hållet
    eller tidigare antydningar motiverar det.
- Om barnet uttryckligen ber om magi, portal, uppdrag eller liknande redan i första eller andra kapitlet,
  får du naturligtvis svara på det – men bygg ändå upp det stegvis så att det känns logiskt.

Konsistens – lämna inte trådar:
- Använd previous_chapters och summary_so_far för att hålla röd tråd.
- Om du tidigare introducerat viktiga element (t.ex. magisk sten, osynlig vän,
  talande fårskalle, speciell önskelista osv) får du ALDRIG bara glömma bort dem.
- I varje nytt kapitel ska du:
  1) Antingen låta minst ett sådant element synas igen,
  2) Eller kort förklara varför det inte är med just nu,
  3) Eller knyta ihop tråden (t.ex. lösa gåtan, säga att uppdraget är klart).
- Upprepa inte långa meningar eller stycken ordagrant från tidigare kapitel.

Story-struktur:
- Varje kapitel ska ha början, mitt och slut – även om boken fortsätter sen.
- Håll språket tydligt, bilderna levande och tempot anpassat efter barnets ålder.
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
          note: "dual model + safe rewrite + escalation control"
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

        // Nästa kapitelnummer (1-baserat) – används i modellen för eskalationsreglerna
        const nextIndex =
          typeof chapter_index === "number" ? chapter_index + 1 : 1;

        // Bygg payload för modellen – vi skickar den säkra versionen
        const storyPayloadForModel = {
          mode,
          child_name,
          child_age: ageNum,
          book_title,
          chapter_index,
          chapter_number: nextIndex, // nyckel modellen kan använda direkt
          previous_chapters,
          summary_so_far,
          child_prompt: safePrompt
        };

        // ---------- MODELLVAL ----------
        const chosenModel = pickModel(child_prompt || safePrompt || "");

        // ---------- ÅLDERSBASERAD LÄNGD ----------
        // Björn: justera dessa gränser om du vill ha längre/kortare kapitel.
        // Siffrorna är "max_tokens" till OpenAI (inte exakt antal ord).
        let maxTokens;
        if (ageNum <= 6) {
          // ca 450–650 ord
          maxTokens = 700;
        } else if (ageNum <= 9) {
          // ca 600–800 ord
          maxTokens = 900;
        } else if (ageNum <= 12) {
          // ca 700–900+ ord
          maxTokens = 1100;
        } else {
          // ca 800–1000+ ord för äldre barn
          maxTokens = 1300;
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
