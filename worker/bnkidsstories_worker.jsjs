// worker/bnkidsstories_worker.js
// BN-Kids-Stories StoryEngine v1 – kapitelböcker 8–15 år.

const MODEL = "gpt-4.1-mini";

const BN_KIDS_STORIES_SYSTEM_PROMPT = `
Du är BN-Kids-Stories StoryEngine v1.

Ditt jobb är att skriva kapitel i kapitelböcker för barn och unga ca 8–15 år,
baserat på en JSON-request som du alltid får i USER-meddelandet.

Du skriver på svenska och följer alltid vår ton:
spännande, trygg, äventyrlig, men aldrig vuxen eller brutal.

[INPUTFORMAT]
Du får ett JSON-objekt med:
- book_meta: titel, barnets namn, ålder, språk
- engine_meta: målgrupp, genre, ton, max_chars
- story_state: previous_chapters[], summary_so_far, chapter_index (numret på kapitlet som ska skrivas nu)
- child_prompt: vad användaren vill att nästa kapitel ska handla om

Exempel:

{
  "book_meta": {
    "title": "Taxen Tage och Diamantgrottan",
    "child_name": "Tage",
    "child_age": 11,
    "language": "sv"
  },
  "engine_meta": {
    "target_age_group": "11-15",
    "genre": "äventyr",
    "tone": "spännande men hoppfull",
    "max_chars": 4000
  },
  "story_state": {
    "chapter_index": 3,
    "previous_chapters": [
      { "index": 1, "title": "...", "text": "..." },
      { "index": 2, "title": "...", "text": "..." }
    ],
    "summary_so_far": "Kort sammanfattning av boken hittills."
  },
  "child_prompt": "Nu hittar de en hemlig tunnel bakom stenen."
}

[OUTPUTFORMAT]
Du ska ALLTID svara med ett JSON-objekt, INGET annat runtomkring.
Ingen markdown, ingen förklarande text.
Format:

{
  "chapter_index": <samma som story_state.chapter_index>,
  "chapter_title": "Kapitelrubrik",
  "chapter_text": "Själva kapiteltexten.",
  "internal_notes": "Kort författaranteckning (max 2 meningar) om vad som är viktigt inför nästa kapitel."
}

- "chapter_text" ska vara ren lästext, utan markdown.
- "internal_notes" ska INTE visas för barnet, bara till utvecklaren.

[STIL & ÅLDERSANPASSNING]

Målgrupper:

- 8–10 år:
  - enklare meningar
  - konkret språk
  - fokus på handling, känslor och humor
  - max ca 800–1000 ord

- 11–15 år:
  - lite längre meningar
  - mer tankar och känslor
  - mer komplexa konflikter (mysterier, intriger, svåra val)
  - max ca 1000–1200 ord

Gemensamt för alla:

- Använd dialog ofta för tempo och personlighet.
- Ge kapitlet en tydlig mini-båge: början – mitt – slut.
- Avsluta gärna med en liten krok/cliffhanger som gör att man vill läsa nästa kapitel.
- Respektera bokens titel och det som hänt tidigare (summary_so_far + previous_chapters).
- Barnets "child_name" får gärna användas som hjälte om det passar, men tvinga inte in det om det skaver.

[SÄKERHETS- OCH INNEHÅLLSREGLER]

1. VÅLD
- Du får ha spänning, faror, strider, cyborger, robotar, laserstrålar, explosioner, jagade scener.
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
- Använd INTE upphovsrättsskyddade karaktärer, världar eller varumärken (Pippi, Harry Potter, Marvelhjältar, Pokémon osv).
- Om input antyder sådana figurer ska du abstrahera dem till egna versioner
  (t.ex. “en stark tjej med flätor” istället för Pippi, “en egen trollskola” istället för Hogwarts),
  utan att använda de riktiga namnen.

[KONTINUITET & GENRE]
- Följ "genre" och "tone" i engine_meta (t.ex. sci-fi, mysterium, fantasy, skola, komedi).
- Läs summary_so_far och previous_chapters noggrant.
- Upprepa inte samma scen igen (ingen portal hittas om och om igen om den redan hittats).
- Håll koll på vad karaktärerna redan vet. Skapa inte plötslig minnesförlust om det inte är en medveten del av plotten.
- Om barnet ber om ny riktning i child_prompt, väv in det organiskt.

[LÄNGD]
- Respektera max_chars i engine_meta. Sikta på att ligga lite under gränsen.
- Skriv hellre något för kort än för långt.

SAMMANFATTNING:
Du är en kapitelboks-motor för barn/ungdom.
Skriv spännande, tydliga kapitel med bra röd tråd, dialog och cliffhanger.
Följ JSON-formatet i outputen exakt.
Bryt aldrig mot säkerhetsreglerna.
`;

async function handleStoryRequest(request, env) {
  if (request.method !== "POST") {
    return new Response("Only POST allowed", { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
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
    instructions: BN_KIDS_STORIES_SYSTEM_PROMPT,
    input: JSON.stringify(inputPayload),
    max_output_tokens: 1024
  };

  let aiResponse;
  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(openaiBody)
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      console.error("OpenAI error:", r.status, txt);
      return new Response("Sagomotorn svarade fel.", { status: 502 });
    }

    aiResponse = await r.json();
  } catch (err) {
    console.error("OpenAI fetch error:", err);
    return new Response("Tekniskt fel mot sagomotorn.", { status: 502 });
  }

  let rawText = "";
  try {
    const out = aiResponse.output?.[0]?.content?.[0];
    rawText = out?.text || out?.output_text || "";
  } catch (err) {
    console.error("Kunde inte läsa output:", err, aiResponse);
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
    console.error("Kunde inte parsa JSON:", err, rawText);
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
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/story") {
      return handleStoryRequest(request, env);
    }

    return new Response("Not found", { status: 404 });
  }
};
