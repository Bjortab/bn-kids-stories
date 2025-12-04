// worker/bnkidsstories_worker.js
// BN-Kids-Stories StoryEngine v1 – kapitelböcker 8–15 år.

const MODEL = "gpt-4.1-mini";

// Hjälpfunktion för CORS-headrar
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*", // vill du låsa ner: byt mot "https://bn-kids-stories.pages.dev"
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// Hjälp: skapa prompt till OpenAI
function buildPrompt(payload) {
  const {
    child_name,
    child_age,
    book_title,
    chapter_index,
    previous_chapters,
    summary_so_far,
    child_prompt,
  } = payload;

  const safeAge = child_age || 10;
  const safeIndex = typeof chapter_index === "number" ? chapter_index : 0;
  const previous = Array.isArray(previous_chapters) ? previous_chapters : [];

  let historyText = "";
  if (previous.length > 0) {
    historyText =
      "Hittills i boken har detta hänt (tidigare kapitel):\n\n" +
      previous
        .map((ch, i) => `Kapitel ${i + 1}:\n${ch}`)
        .join("\n\n-----------------\n\n");
  } else if (summary_so_far) {
    historyText = "Sammanfattning hittills:\n" + summary_so_far;
  }

  const baseInstructions = `
Du är BN-Kids-Stories StoryEngine v1.

Ditt jobb är att skriva kapitel i kapitelböcker för barn och unga ca 8–15 år,
baserat på en JSON-request som du alltid får i USER-meddelandet.

Du skriver på svenska och följer alltid vår ton:
spännande, trygg, äventyrlig, men aldrig vuxen eller brutal.

Regler:
- Inget blod, inga lemlästningar, inga svordomar, ingen sexualitet.
- Våld får bara förekomma på "barnnivå": t.ex. laser mot drönare/robotar,
  slag mot sköldar, någon blir tillfälligt skadad men klarar sig.
- Inga kända IP:n eller figurer med upphovsrätt (ingen Pippi, ingen Harry Potter, ingen Mario osv).
- Om barnet råkar skriva ett känt IP-namn ska du diskret byta till en egen, påhittad figur.
- Håll hårt i röd tråd: det som hänt i tidigare kapitel gäller även nu.
- Håll dig till barnets önskemål för detta kapitel.

Boken:
- Titel: "${book_title}"
- Barnets namn: "${child_name}" (ca ${safeAge} år)

${historyText ? historyText : "Detta är första kapitlet i boken."}

Nu ska du skriva KAPITEL ${safeIndex + 1}.

Barnets prompt för detta kapitel är:
"${child_prompt}"

Skriv ett kapitel som:
- är ca 2500 tecken (ungefärlig riktning, lite mer eller mindre är okej)
- har tydlig början, mitt och slut
- slutar på ett sätt som gör att man VILL läsa nästa kapitel
- är lätt att förstå för ett barn i den åldern
- känns sammanhängande med tidigare kapitel

Avsluta inte boken, såvida det inte är uppenbart att detta är sista kapitlet.
`.trim();

  return baseInstructions;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname || "/";

    // --- CORS preflight ---
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(),
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // --- Hälso-endpoint för debug ---
    if (request.method === "GET" && pathname === "/health") {
      return new Response(
        JSON.stringify({ ok: true, message: "BN-Kids-Stories worker up" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
          },
        }
      );
    }

    // --- Huvud-API: /api/story ---
    if (pathname === "/api/story") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            ...corsHeaders(),
          },
        });
      }

      if (!env.OPENAI_API_KEY) {
        return new Response("OPENAI_API_KEY saknas i Worker-konfigurationen.", {
          status: 500,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            ...corsHeaders(),
          },
        });
      }

      let payloadText;
      try {
        // vi stödjer både text/plain och application/json
        payloadText = await request.text();
      } catch (err) {
        console.error("Kunde inte läsa request body:", err);
        return new Response("Kunde inte läsa request body.", {
          status: 400,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            ...corsHeaders(),
          },
        });
      }

      let payload;
      try {
        payload = JSON.parse(payloadText);
      } catch {
        return new Response("Body måste vara giltig JSON.", {
          status: 400,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            ...corsHeaders(),
          },
        });
      }

      const mode = payload.mode === "continue" ? "continue" : "new";

      const systemPrompt = buildPrompt(payload);

      try {
        const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
              {
                role: "user",
                content:
                  "Skriv nästa kapitel exakt enligt instruktionerna ovan. Returnera bara kapiteltexten, ingen extra förklaring.",
              },
            ],
            temperature: 0.9,
            max_tokens: 900,
          }),
        });

        if (!openaiRes.ok) {
          const errText = await openaiRes.text().catch(() => "");
          console.error("OpenAI svarade inte OK:", openaiRes.status, errText);
          return new Response("Fel från OpenAI-backend.", {
            status: 502,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              ...corsHeaders(),
            },
          });
        }

        const openaiData = await openaiRes.json();
        const choice = openaiData.choices?.[0];
        const chapterTextRaw = choice?.message?.content || "";
        const chapterText = chapterTextRaw.trim();

        if (!chapterText) {
          return new Response("Tomt svar från OpenAI.", {
            status: 502,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              ...corsHeaders(),
            },
          });
        }

        const nextChapterIndex =
          typeof payload.chapter_index === "number"
            ? payload.chapter_index + 1
            : (payload.previous_chapters?.length || 0) + 1;

        const summarySoFar =
          typeof payload.summary_so_far === "string"
            ? payload.summary_so_far
            : "";

        const responseBody = {
          ok: true,
          mode,
          chapter_index: nextChapterIndex,
          chapter_text: chapterText,
          summary_so_far: summarySoFar,
        };

        return new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders(),
          },
        });
      } catch (err) {
        console.error("Tekniskt fel mot OpenAI:", err);
        return new Response("Tekniskt fel mot OpenAI.", {
          status: 500,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            ...corsHeaders(),
          },
        });
      }
    }

    // --- Default: 404 ---
    return new Response("Not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        ...corsHeaders(),
      },
    });
  },
};
