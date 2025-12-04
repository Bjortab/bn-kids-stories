// worker/bnkidsstories_worker.js
// BN-Kids-Stories StoryEngine v1 – kapitelböcker 8–15 år.

const MODEL = "gpt-4.1-mini";

/**
 * Systemprompt: berättar för modellen hur den ska skriva kapitel.
 * Håll den här relativt kort så vi inte bränner onödiga tokens.
 */
const BN_KIDS_STORIES_SYSTEM_PROMPT = `
Du är BN-Kids-Stories StoryEngine v1.

Ditt jobb är att skriva kapitel i kapitelböcker för barn och unga ca 8–15 år,
baserat på ett JSON-underlag från användaren (barnets prompt + bokens läge).

Du skriver på svenska och följer alltid vår ton:
• spännande, trygg, äventyrlig, men aldrig vuxen eller brutal.
• inget blod, tortyr, sex, droger eller svordomar.
• våld på tecknad nivå (robotar, drönare, cyborger) får förekomma, men utan blod.

Du skriver ALLTID exakt ett kapitel åt gången – med tydlig början, mitt och slut
inom kapitlet. Du får aldrig “spola tillbaka” handlingen mellan kapitel.
`;

/**
 * CORS – tillåt bara frontend-sidan att anropa workern.
 * Anpassa origin om du kopplar egen domän senare.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://bn-kids-stories.pages.dev",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1) CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    // 2) Endast /api/story är tillåten här
    if (url.pathname !== "/api/story") {
      return jsonResponse({ ok: false, error: "Not found" }, 404);
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
    }

    // 3) Läs JSON från frontend
    let payload;
    try {
      payload = await request.json();
    } catch (err) {
      return jsonResponse({ ok: false, error: "Invalid JSON in request" }, 400);
    }

    // Plocka upp fält – vi gör allt tolerant så app.js inte kraschar
    const {
      child_name,
      child_age,
      book_title,
      mode, // "new" | "continue" (om du skickar det)
      chapter_index,
      previous_chapters,
      summary_so_far,
      child_prompt,
    } = payload;

    const safeName = child_name || "barnet";
    const safeAge = child_age || 10;
    const safeTitle = book_title || "Den magiska berättelsen";
    const safePrompt =
      child_prompt || "Skriv ett spännande men tryggt kapitel för barn.";

    const chaptersArray = Array.isArray(previous_chapters)
      ? previous_chapters
      : [];
    const prevSummary = summary_so_far || "";

    const currentChapterIndex =
      typeof chapter_index === "number"
        ? chapter_index
        : chaptersArray.length;

    const isFirstChapter =
      mode === "new" || currentChapterIndex === 0 || chaptersArray.length === 0;

    // 4) Bygg prompt till modellen
    const userPrompt = `
BARNETS UPPGIFTER
- Barnets namn: ${safeName}
- Barnets ålder: ${safeAge}

BOKEN
- Bokens titel: ${safeTitle}

LÄGE I BOKEN:
- Nuvarande kapitelindex (0-baserat): ${currentChapterIndex}
- Är detta första kapitlet? ${isFirstChapter ? "Ja" : "Nej"}

SAMMANFATTNING AV TIDIGARE KAPITEL:
${prevSummary || "(Ingen sammanfattning ännu.)"}

TIDIGARE KAPITEL (om några):
${chaptersArray.length > 0 ? chaptersArray.join("\n\n---\n\n") : "(Inga tidigare kapitel)"}

BARNETS ÖNSKAN FÖR DETTA KAPITEL:
${safePrompt}

INSTRUKTIONER FÖR DETTA KAPITEL:
- Skriv ett välstrukturerat kapitel för barn 8–15 år.
- Håll en tydlig röd tråd med det som hänt tidigare.
- Du får inte repetera första scenen eller starta om berättelsen.
- Avsluta kapitlet på ett sätt som gör det naturligt att fortsätta med nästa kapitel.
- Ingen innehåll som strider mot policyn (vuxet, blodigt, brutalt, sex, droger, grova svordomar).
- Returnera endast själva kapitlet som löpande text, inget meta-snack, ingen rubrik.
`;

    if (!env.OPENAI_API_KEY) {
      return jsonResponse(
        { ok: false, error: "OPENAI_API_KEY saknas i workerns miljövariabler." },
        500,
      );
    }

    // 5) Anropa OpenAI Responses API
    let storyText;
    try {
      const openaiRes = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          input: [
            { role: "system", content: BN_KIDS_STORIES_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          max_output_tokens: 1200,
        }),
      });

      if (!openaiRes.ok) {
        const errText = await openaiRes.text();
        return jsonResponse(
          {
            ok: false,
            error: "OpenAI API error",
            status: openaiRes.status,
            details: errText,
          },
          502,
        );
      }

      const data = await openaiRes.json();

      // Nya Responses-API:t: texten ligger här:
      storyText =
        data &&
        data.output &&
        data.output[0] &&
        data.output[0].content &&
        data.output[0].content[0] &&
        data.output[0].content[0].text;

      if (!storyText) {
        return jsonResponse(
          {
            ok: false,
            error: "Kunde inte läsa ut text från OpenAI-svaret.",
            raw: data,
          },
          502,
        );
      }
    } catch (err) {
      return jsonResponse(
        {
          ok: false,
          error: "Nätverksfel mot OpenAI API",
          details: String(err),
        },
        502,
      );
    }

    // 6) Bygg nytt state / svar till frontend
    const nextChapterIndex = currentChapterIndex + 1;

    return jsonResponse({
      ok: true,
      book_title: safeTitle,
      child_name: safeName,
      child_age: safeAge,
      chapter_index: nextChapterIndex,
      chapter_text: storyText.trim(),
      // Låt frontend själv bygga en bättre summary om den vill;
      // vi skickar bara tillbaka ev. tidigare.
      summary_so_far: prevSummary,
    });
  },
};
