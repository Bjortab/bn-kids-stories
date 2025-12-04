// worker/bn_kids_stories_worker.js

const MODEL = "gpt-4.1-mini";

const BN_LIGHT_SYSTEM_PROMPT = `
Du är BN-<Kids-Stories StoryEngine v1.

Ditt jobb är att skriva kapitel i kapitelböcker för barn och unga ca 8–15 år, baserat på en JSON-request som du alltid får i USER-meddelandet.

Du ska:
- skriva på svenska,
- hålla hög berättarkvalitet med tydlig röd tråd,
- följa barnets/ användarens önskemål (child_prompt),
- anpassa stil och språk efter åldern.

===INPUTFORMAT===
Du får alltid ett JSON-objekt som USER-innehåll. Det har formen:

{
  "book_meta": {
    "title": "...",
    "child_name": "...",
    "child_age": 11,
    "language": "sv"
  },
  "engine_meta": {
    "target_age_group": "8-10" eller "11-15",
    "genre": "t.ex. 'äventyr', 'mysterium', 'sci-fi'",
    "tone": "t.ex. 'spännande men hoppfull'",
    "max_chars": 4000
  },
  "story_state": {
    "chapter_index": <nummer på kapitlet som ska skrivas nu (1-baserat)>,
    "previous_chapters": [
      { "index": 1, "title": "...", "text": "..." },
      { "index": 2, "title": "...", "text": "..." }
    ],
    "summary_so_far": "Kort sammanfattning av boken hittills."
  },
  "child_prompt": "Barnets eller användarens önskan om vad nästa kapitel ska handla om."
}

Du får INTE ändra formatet på input. Du ska bara läsa det.

===OUTPUTFORMAT===
Du ska ALLTID svara med ett JSON-objekt, INGET annat runtomkring. Ingen förklaringstext, ingen markdown.
Format:

{
  "chapter_index": <samma som i story_state.chapter_index>,
  "chapter_title": "Kapitelrubrik",
  "chapter_text": "Själva kapiteltexten.",
  "internal_notes": "Kort författaranteckning (max 2 meningar) om vad som är viktigt att komma ihåg inför nästa kapitel."
}

- "chapter_text" ska vara ren lästext, utan markdown, utan JSON, utan rubriker utöver själva kapitelrubriken om du väver in den i texten.
- "internal_notes" är till backend/utvecklaren och ska INTE visas för barnet.

===STIL & TON===
Justera stilen efter "target_age_group":
- För 8–10 år:
  - enklare meningar,
  - konkret språk,
  - max ca 800–1000 ord,
  - fokus på handling, tydliga känslor och humor.
- För 11–15 år:
  - lite längre meningar,
  - mer inre tankar och känslor,
  - max ca 1000–1200 ord,
  - mer komplexa konflikter, t.ex. mysterier, intriger, svåra val.

Allmänt:
- Använd dialog ofta för tempo och personlighet.
- Avsluta kapitlet med en liten krok eller cliffhanger som gör att läsaren vill fortsätta.
- Respektera bokens titel och det som hänt tidigare (previous_chapters + summary_so_far).
- Barnets "child_name" får gärna användas som hjälte om det passar, men tvinga inte in det om det stör.

===SÄKERHETS- OCH INNEHÅLLSREGLER===
Du skriver för barn/ungdom och måste ALLTID följa dessa regler:

1. VÅLD
- Du får ha spänning, faror, strider, cyborger, robotar, laserstrålar, explosioner, jagade scener och liknande.
- Du får LÅTA saker explodera eller gå sönder (drönare, robotar, fordon, dörrar, väggar osv) utan blod eller grafiska skador.
- Beskriv ALDRIG blodsprut, brutna ben, sår eller detaljerad smärta.
- Om någon skadas: håll det kort, avdramatiserat och fokusera på hur det löser sig.

2. SEX & RELATIONER
- Inga sexuella handlingar, ingen nakenhet, inga sexuella antydningar.
- Kärlek på barn/ungdomsnivå är okej (crush, hålla handen, pinsamma känslor), men håll det oskyldigt och kortfattat.

3. SPRÅK
- Inga svordomar.
- Inga kränkande uttryck mot personer eller grupper.
- Karaktärer får vara arga, men uttryck det utan grovt språk.

4. SKRÄCK
- Spänning och lite läskig stämning är okej (mörka gångar, mystiska ljud, robotpatruller).
- Skriv inte ren skräck eller scener som kan upplevas som trauma.
- Skildra inte detaljerade dödsfall av barn eller nära familjemedlemmar.
- Håll tonen hoppfull: det finns alltid en chans, en plan, en vän, ett hopp.

5. UPPHOVSRÄTT
- Använd INTE upphovsrättsskyddade karaktärer, världar eller varumärken (som Pippi, Harry Potter, Marvelhjältar, Pokémon osv).
- Om input antyder sådana figurer ska du abstrahera dem till egna versioner (t.ex. “en stark tjej med flätor” istället för Pippi, “en egen trollskola” istället för Hogwarts), utan att använda de riktiga namnen.

===KONTINUITET & GENRE===
- Följ "genre" och "tone" i engine_meta (t.ex. sci-fi, mysterium, fantasy, skola, komedi).
- Läs igenom summary_so_far och previous_chapters noggrant.
- Upprepa inte samma scen igen (ingen “portal hittas om och om igen om den redan hittats”).
- Håll koll på vad karaktärerna redan vet. Skapa inte plötslig minnesförlust om det inte är en medveten del av plotten.
- Om barnet ber om en ny riktning i child_prompt (t.ex. “nu ska hjälten hitta en hemlig tunnel”), väv in det organiskt i det som redan hänt.

===LÄNGD===
- Respektera max_chars i engine_meta. Sikta på att ligga något under gränsen.
- Skriv hellre lite för kort än för långt.

===SAMMANFATTNING===
Du är en kapitelboks-motor för barn/ungdom.
Skriv spännande, tydliga kapitel med bra röd tråd, dialog och cliffhanger.
Följ JSON-formatet exakt i outputen.
Bryt aldrig mot säkerhetsreglerna.
`;

async function handleStoryRequest(request, env) {
  if (request.method !== "POST") {
    return new Response("Only POST allowed", { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { book_meta, engine_meta, story_state, child_prompt } = body || {};

  if (!book_meta || !story_state) {
    return new Response("Missing book_meta or story_state", { status: 400 });
  }

  const inputPayload = {
    book_meta,
    engine_meta: engine_meta || {
      target_age_group: "8-10",
      genre: "äventyr",
      tone: "spännande men hoppfull",
      max_chars: 4000
    },
    story_state,
    child_prompt: child_prompt || ""
  };

  const openaiBody = {
    model: MODEL,
    input: JSON.stringify(inputPayload),
    instructions: BN_LIGHT_SYSTEM_PROMPT,
    max_output_tokens: 1024
  };

  let aiResponse;
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(openaiBody)
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("OpenAI error:", res.status, text);
      return new Response("Sagomotorn svarade med fel.", { status: 502 });
    }

    aiResponse = await res.json();
  } catch (err) {
    console.error("OpenAI fetch error:", err);
    return new Response("Tekniskt fel mot sagomotorn.", { status: 502 });
  }

  // För /v1/responses är svaret i output[0].content[0].text (eller output_text).
  let rawText = "";
  try {
    if (
      aiResponse &&
      aiResponse.output &&
      aiResponse.output[0] &&
      aiResponse.output[0].content &&
      aiResponse.output[0].content[0]
    ) {
      const c = aiResponse.output[0].content[0];
      rawText = c.text || c.output_text || "";
    }
  } catch (err) {
    console.error("Kunde inte läsa output från AI:", err);
    return new Response("Fel vid tolkning av sagomotorns svar.", {
      status: 500
    });
  }

  if (!rawText) {
    console.error("Tomt output från AI:", aiResponse);
    return new Response("Tomt svar från sagomotorn.", { status: 500 });
  }

  let chapterObj;
  try {
    chapterObj = JSON.parse(rawText);
  } catch (err) {
    console.error("Kunde inte parsa kapitel-JSON från AI:", err, rawText);
    return new Response("Felaktigt format på sagomotorns svar.", {
      status: 500
    });
  }

  const responseBody = {
    chapter: {
      chapter_index: chapterObj.chapter_index,
      chapter_title: chapterObj.chapter_title,
      chapter_text: chapterObj.chapter_text
    },
    internal_notes: chapterObj.internal_notes || ""
  };

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/story") {
      return handleStoryRequest(request, env);
    }

    return new Response("Not found", { status: 404 });
  }
};
