// worker/bnkidsstories_worker.js
// BN-Kids-Stories – TESTWORKER v0.9 (utan OpenAI)
// Syfte: verifiera route + CORS + frontendkoppling.

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "https://bn-kids-stories.pages.dev",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
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

    // --- Enkel healthcheck ---
    if (request.method === "GET" && pathname === "/health") {
      return new Response(
        JSON.stringify({
          ok: true,
          worker: "bn-kids-stories TESTWORKER v0.9",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders(),
          },
        }
      );
    }

    // --- TEST-API: /api/story ---
    if (request.method === "POST" && pathname === "/api/story") {
      let payloadText = "";
      try {
        payloadText = await request.text();
      } catch (_) {
        // strunta i fel här, det är bara test
      }

      // Vi returnerar ett hårdkodat kapitel
      const fakeChapter = `
Detta är ett TESTKAPITEL från BN-Kids-Stories testworker.

Om du ser den här texten i din berättelseruta vet vi:
- att frontend når workern
- att CORS fungerar
- att /api/story-route är rätt kopplad

Sedan byter vi till "riktig" motor med OpenAI igen.
      `.trim();

      const responseBody = {
        ok: true,
        mode: "test",
        chapter_index: 1,
        chapter_text: fakeChapter,
        summary_so_far: "",
      };

      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...corsHeaders(),
        },
      });
    }

    // --- Default 404 ---
    return new Response("Not found (testworker)", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        ...corsHeaders(),
      },
    });
  },
};
