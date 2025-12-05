// worker/bnkidsstories_worker.js
// BN-Kids-Stories StoryEngine v1.3-mini
// Motor: gpt-4o-mini
// Fixar:
// - Anti-repetition v2
// - Violence-softener v2
// - IP-filter bas
// - Mycket färre safety-block
// - Bättre logik och konsekvens

const MODEL = "gpt-4o-mini";

/* ----------------------------------------------------------
   CORS
----------------------------------------------------------- */

function getCorsHeaders(origin) {
  const allowedOrigin = "https://bn-kids-stories.pages.dev";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data, status = 200, origin = null) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    ...getCorsHeaders(origin),
  };
  return new Response(JSON.stringify(data), { status, headers });
}

function plainResponse(text, status = 200, origin = null) {
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    ...getCorsHeaders(origin),
  };
  return new Response(text, { status, headers });
}

function handleOptions(request, origin) {
  const headers = getCorsHeaders(origin);
  return new Response(null, {
    status: 204,
    headers,
  });
}

/* ----------------------------------------------------------
   Violence-softener v2
----------------------------------------------------------- */

function softenViolence(text) {
  if (!text || typeof text !== "string") return text;

  let t = text;

  const rules = [
    { pat: /kötta\w*/gi, rep: "besegra" },
    { pat: /köttade\w*/gi, rep: "besegra" },
    { pat: /slakta\w*/gi, rep: "oskadliggöra" },
    { pat: /massakrera\w*/gi, rep: "besegra" },
    { pat: /döda/gi, rep: "besegra" },
    { pat: /skjuta ihjäl/gi, rep: "skjuta sönder (utan blod)" },
    { pat: /spränga ihjäl/gi, rep: "spränga sönder (utan blod)" },
    { pat: /blodbad/gi, rep: "kaos (utan blod)" },
    { pat: /attackera/gi, rep: "utmana" },
    { pat: /fälla/gi, rep: "snillrik plan" },
  ];

  for (const r of rules) {
    t = t.replace(r.pat, r.rep);
  }

  return t;
}

/* ----------------------------------------------------------
   IP-filter light
----------------------------------------------------------- */

function ipFilter(text) {
  if (!text || typeof text !== "string") return text;

  let t = text;
  const mapping = [
    { pat: /pippi långstrump/gi, rep: "Lilla Peppan" },
    { pat: /pippi/gi, rep: "Peppan" },
    { pat: /harry potter/gi, rep: "Henrik Trollson" },
    { pat: /hogwarts/gi, rep: "Norrgårds Akademi" },
    { pat: /stålmannen/gi, rep: "Stålskölden" },
    { pat: /marvel/gi, rep: "Storsaga-gruppen" },
    { pat: /disney/gi, rep: "Sagoförbundet" },
  ];

  for (const m of mapping) {
    t = t.replace(m.pat, m.rep);
  }
  return t;
}

/* ----------------------------------------------------------
   Systemprompt v1.3 – gpt-4o‐mini optimerad
----------------------------------------------------------- */

const SYSTEM_PROMPT = `
Du är BN-Kids-Stories StoryEngine v1.3-mini.
Du skriver kapitelböcker för barn 8–15 år på svenska.

[REGLER]
• Läs previous_chapters mycket noga.  
• Du får INTE upprepa händelser som redan hänt.  
• Du får INTE starta om berättelsen.  
• Du får INTE återintroducera samma portal/nyckel/skurk på samma sätt.  
• Varje kapitel måste föra handlingen FRAMÅT.  
• Om barnet ber om något som redan hänt: bygg vidare, repetera inte.

[VÅLD / ACTION]
• Inget blod, inga brutala detaljer.  
• Action får förekomma men på barnvänlig nivå: robotar, laser, hinder, utmaningar.  
• Om barnets prompt innehåller hårda ord, mildra dem automatiskt
  (“kötta” → “besegra”, “fälla” → “snillrik plan” osv).

[IP-FILTER]
• Inga kända varumärken. Gör egna varianter.

[TON]
• 8–10 år: lätt språk. 11–15: lite mer avancerat.
• Humor okej.  
• Neutral berättarröst i tredje person.  

[OUTPUT]
Svara ALLTID med ren JSON:
{
  "chapter_index": number,
  "chapter_text": string,
  "summary_so_far": string
}
`.trim();

/* ----------------------------------------------------------
   Cloudflare Worker – main handler
----------------------------------------------------------- */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || null;

    // Healthcheck
    if (url.pathname === "/health") {
      return jsonResponse(
        { ok: true, engine: "bn-kids-stories v1.3-mini", time: new Date().toISOString() },
        200,
        origin
      );
    }

    // API – story
    if (url.pathname === "/api/story") {
      if (request.method === "OPTIONS") return handleOptions(request, origin);
      if (request.method !== "POST")
        return jsonResponse({ ok: false, error: "Use POST" }, 405, origin);
      return handleStory(request, env, origin);
    }

    return plainResponse("Not found", 404, origin);
  },
};

/* ----------------------------------------------------------
   Story handler
----------------------------------------------------------- */

async function handleStory(request, env, origin) {
  try {
    const body = await request.text();
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return jsonResponse({ ok: false, error: "Bad JSON" }, 400, origin);
    }

    const {
      mode,
      child_name,
      child_age,
      book_title,
      chapter_index,
      previous_chapters,
      summary_so_far,
      child_prompt,
    } = data;

    if (!child_name || !book_title || !child_prompt) {
      return jsonResponse(
        { ok: false, error: "Missing name/title/prompt" },
        400,
        origin
      );
    }

    // ---- Sanitize prompt ----
    const safePrompt = softenViolence(ipFilter(child_prompt));

    const nextIndex =
      typeof chapter_index === "number" ? chapter_index : 1;

    const requestForModel = {
      mode,
      meta: {
        child_name,
        child_age,
        book_title,
      },
      story_state: {
        chapter_index: nextIndex,
        previous_chapters: Array.isArray(previous_chapters)
          ? previous_chapters
          : [],
        summary_so_far: summary_so_far || "",
      },
      child_prompt_original: child_prompt,
      child_prompt_sanitized: safePrompt,
    };

    const payload = {
      model: MODEL,
      temperature: 0.85,
      max_tokens: 1200,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(requestForModel) },
      ],
    };

    const key = env.OPENAI_API_KEY;
    if (!key)
      return jsonResponse(
        { ok: false, error: "OPENAI_API_KEY missing" },
        500,
        origin
      );

    const ai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${key}\`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const aiJson = await ai.json().catch(() => null);

    if (!ai.ok) {
      console.error("OpenAI error:", ai.status, aiJson);
      return jsonResponse(
        { ok: false, error: "AI error", status: ai.status },
        502,
        origin
      );
    }

    const raw = aiJson?.choices?.[0]?.message?.content?.trim() || "";
    let parsed = null;

    try {
      parsed = JSON.parse(raw);
    } catch {
      const first = raw.indexOf("{");
      const last = raw.lastIndexOf("}");
      if (first !== -1 && last !== -1 && last > first) {
        try {
          parsed = JSON.parse(raw.slice(first, last + 1));
        } catch {}
      }
    }

    if (
      !parsed ||
      typeof parsed.chapter_text !== "string" ||
      !parsed.chapter_text.trim()
    ) {
      console.error("Invalid AI JSON:", raw);
      return jsonResponse(
        { ok: false, error: "Invalid AI response" },
        502,
        origin
      );
    }

    return jsonResponse(
      {
        ok: true,
        chapter_index: parsed.chapter_index ?? nextIndex,
        chapter_text: parsed.chapter_text,
        summary_so_far: parsed.summary_so_far || summary_so_far || "",
      },
      200,
      origin
    );
  } catch (err) {
    console.error("Unhandled error:", err);
    return jsonResponse(
      { ok: false, error: "Server error" },
      500,
      origin
    );
  }
}
