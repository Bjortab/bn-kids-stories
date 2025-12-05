// dashboard.js – BN-Kids-Stories lokal kostnads- och användningsvy
document.addEventListener("DOMContentLoaded", () => {
  const STATS_KEY = "bnkidsstories_stats_v1";

  const totalEl = document.getElementById("dashTotalChapters");
  const miniEl = document.getElementById("dashMiniChapters");
  const fullEl = document.getElementById("dashFullChapters");

  const costUsdEl = document.getElementById("dashCostUsd");
  const costSekEl = document.getElementById("dashCostSek");
  const costPerChapterSekEl = document.getElementById(
    "dashCostPerChapterSek"
  );

  const usdSekRateInput = document.getElementById("dashUsdSekRate");
  const miniBar = document.getElementById("dashMiniBar");
  const fullBar = document.getElementById("dashFullBar");

  // Samma schablonvärden som i app.js
  const EST_TOKENS_PER_CHAPTER_INPUT = 800;
  const EST_TOKENS_PER_CHAPTER_OUTPUT = 800;
  const MINI_COST_PER_1K = 0.0005; // USD per 1K tokens
  const FULL_COST_PER_1K = 0.0025; // USD per 1K tokens

  let stats = {
    totalChapters: 0,
    miniChapters: 0,
    fullChapters: 0,
  };

  function loadStats() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      stats = {
        totalChapters: parsed.totalChapters || 0,
        miniChapters: parsed.miniChapters || 0,
        fullChapters: parsed.fullChapters || 0,
      };
    } catch (err) {
      console.error("Kunde inte läsa stats:", err);
    }
  }

  function render() {
    totalEl.textContent = stats.totalChapters.toString();
    miniEl.textContent = stats.miniChapters.toString();
    fullEl.textContent = stats.fullChapters.toString();

    const total = stats.totalChapters;
    if (total === 0) {
      costUsdEl.textContent = "0.0000";
      costSekEl.textContent = "0.00";
      costPerChapterSekEl.textContent = "0.00";
      miniBar.style.width = "0%";
      fullBar.style.width = "0%";
      return;
    }

    const tokensPerChapter =
      EST_TOKENS_PER_CHAPTER_INPUT + EST_TOKENS_PER_CHAPTER_OUTPUT;

    const miniTokens = stats.miniChapters * tokensPerChapter;
    const fullTokens = stats.fullChapters * tokensPerChapter;

    const miniUsd = (miniTokens / 1000) * MINI_COST_PER_1K;
    const fullUsd = (fullTokens / 1000) * FULL_COST_PER_1K;
    const totalUsd = miniUsd + fullUsd;

    const rate = parseFloat(usdSekRateInput.value || "11") || 11;
    const totalSek = totalUsd * rate;
    const perChapterSek = totalSek / total;

    costUsdEl.textContent = totalUsd.toFixed(4);
    costSekEl.textContent = totalSek.toFixed(2);
    costPerChapterSekEl.textContent = perChapterSek.toFixed(2);

    const miniPart = (stats.miniChapters / total) * 100;
    const fullPart = (stats.fullChapters / total) * 100;

    miniBar.style.width = `${miniPart.toFixed(1)}%`;
    fullBar.style.width = `${fullPart.toFixed(1)}%`;
  }

  usdSekRateInput.addEventListener("change", render);

  loadStats();
  render();
});
