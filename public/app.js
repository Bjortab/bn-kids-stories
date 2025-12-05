//---------------------------------------------------------
// BN-Kids-Stories v3.1 – frontend (Golden Copy)
// - Story-flöde
// - Spinner-overlay
// - Accordion
// - Stats för dashboard (sparas i localStorage)
//---------------------------------------------------------

window.BN_WORKER_URL =
  window.BN_WORKER_URL ||
  "https://bn-kids-stories-worker.bjorta-bb.workers.dev";

window.TTS_WORKER_URL =
  window.TTS_WORKER_URL ||
  "https://get-audio-worker.bjorta-bb.workers.dev";

document.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEY = "bnkidsstories_state_v1";
  const STATS_KEY = "bnkidsstories_stats_v1";

  const childNameInput = document.getElementById("childName");
  const childAgeInput = document.getElementById("childAge");
  const bookTitleInput = document.getElementById("bookTitle");
  const promptInput = document.getElementById("chapterPrompt");

  const newBookBtn = document.getElementById("newBookBtn");
  const continueBookBtn = document.getElementById("continueBookBtn");
  const ttsPlayBtn = document.getElementById("ttsPlayBtn");
  const resetStoryBtn = document.getElementById("resetStoryBtn");

  const storyOutput = document.getElementById("storyOutput");
  const toastEl = document.getElementById("toast");
  const overlay = document.getElementById("loadingOverlay");

  // storyState = själva boken på den här enheten
  let storyState = {
    childName: "",
    childAge: null,
    bookTitle: "",
    chapterIndex: 0,
    previousChapters: [],
    summary: "",
  };

  // stats = bara för dashboarden
  let stats = {
    totalChapters: 0,
    miniChapters: 0,
    fullChapters: 0,
  };

  // -------- TOAST --------
  function showToast(message) {
    if (!toastEl) {
      alert(message);
      return;
    }
    toastEl.textContent = message;
    toastEl.classList.add("visible");
    setTimeout(() => toastEl.classList.remove("visible"), 3500);
  }

  // -------- OVERLAY --------
  function showOverlay() {
    if (overlay) overlay.classList.remove("hidden");
  }
  function hideOverlay() {
    if (overlay) overlay.classList.add("hidden");
  }

  // -------- LOCAL STORAGE (story) --------
  function loadStoryState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);

      storyState = {
        childName: parsed.childName || "",
        childAge: parsed.childAge || null,
        bookTitle: parsed.bookTitle || "",
        chapterIndex:
          typeof parsed.chapterIndex === "number" ? parsed.chapterIndex : 0,
        previousChapters: Array.isArray(parsed.previousChapters)
          ? parsed.previousChapters
          : [],
        summary: parsed.summary || "",
      };

      if (childNameInput) childNameInput.value = storyState.childName;
      if (childAgeInput)
        childAgeInput.value =
          storyState.childAge !== null ? String(storyState.childAge) : "";
      if (bookTitleInput) bookTitleInput.value = storyState.bookTitle;
    } catch (err) {
      console.error("Kunde inte läsa storyState:", err);
    }
  }

  function saveStoryState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storyState));
    } catch (err) {
      console.error("Kunde inte spara storyState:", err);
    }
  }

  function resetStoryOnThisDevice() {
    storyState = {
      childName: "",
      childAge: null,
      bookTitle: "",
      chapterIndex: 0,
      previousChapters: [],
      summary: "",
    };
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error("Kunde inte ta bort storyState:", err);
    }

    if (childNameInput) childNameInput.value = "";
    if (childAgeInput) childAgeInput.value = "";
    if (bookTitleInput) bookTitleInput.value = "";
    if (promptInput) promptInput.value = "";

    renderStory();
    showToast("Boken rensad på denna enhet.");
  }

  // -------- LOCAL STORAGE (stats) --------
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

  function saveStats() {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (err) {
      console.error("Kunde inte spara stats:", err);
    }
  }

  // -------- RENDER STORY --------
  function renderStory() {
    if (!storyOutput) return;

    if (
      !storyState.previousChapters ||
      !Array.isArray(storyState.previousChapters) ||
      storyState.previousChapters.length === 0
    ) {
      storyOutput.textContent = "Här kommer din berättelse att visas. ✨";
      return;
    }

    const parts = storyState.previousChapters.map((t, i) => {
      return `Kapitel ${i + 1}\n\n${t}`;
    });

    storyOutput.textContent = parts.join("\n\n──────────\n\n");
  }

  // -------- API CALL --------
  async function callApi(mode) {
    const workerUrl = window.BN_WORKER_URL;

    const childName = (childNameInput?.value || "").trim();
    const ageStr = (childAgeInput?.value || "").trim();
    const childAge = ageStr ? parseInt(ageStr, 10) : null;
    const bookTitle = (bookTitleInput?.value || "").trim();
    const childPrompt = (promptInput?.value || "").trim();

    if (!childName || !bookTitle || !childPrompt) {
      showToast("Fyll i namn, ålder, titel och vad kapitlet ska handla om.");
      return;
    }

    storyState.childName = childName;
    storyState.childAge = Number.isNaN(childAge) ? null : childAge;
    storyState.bookTitle = bookTitle;

    const payload = {
      mode,
      child_name: childName,
      child_age: storyState.childAge,
      book_title: bookTitle,
      chapter_index: storyState.chapterIndex,
      previous_chapters: storyState.previousChapters,
      summary_so_far: storyState.summary,
      child_prompt: childPrompt,
    };

    try {
      showOverlay();
      if (newBookBtn) newBookBtn.disabled = true;
      if (continueBookBtn) continueBookBtn.disabled = true;

      const response = await fetch(`${workerUrl}/api/story`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error("API-svar inte OK:", response.status);
        showToast("API-fel. Försök igen.");
        return;
      }

      const data = await response.json().catch((err) => {
        console.error("Kunde inte parsa API-svar:", err);
        return null;
      });

      if (!data || !data.ok) {
        console.error("API-data fel:", data);
        showToast(data?.error || "Okänt API-fel.");
        return;
      }

      const newText = (data.chapter_text || "").trim();
      if (!newText) {
        showToast("Inget kapitel i svar.");
        return;
      }

      if (!Array.isArray(storyState.previousChapters)) {
        storyState.previousChapters = [];
      }
      storyState.previousChapters.push(newText);
      storyState.chapterIndex =
        typeof data.chapter_index === "number"
          ? data.chapter_index
          : storyState.chapterIndex + 1;
      storyState.summary = data.summary_so_far || storyState.summary || "";

      // ---- uppdatera stats för dashboarden ----
      const modelUsed = data.model_used || "";
      stats.totalChapters += 1;
      if (modelUsed.includes("mini")) {
        stats.miniChapters += 1;
      } else if (modelUsed.includes("gpt-4.1")) {
        stats.fullChapters += 1;
      }

      saveStoryState();
      saveStats();
      renderStory();

      showToast("Kapitel skapat! ✨");
    } catch (err) {
      console.error("Tekniskt fel vid API-anrop:", err);
      showToast("Tekniskt fel. Kontrollera internet och försök igen.");
    } finally {
      hideOverlay();
      if (newBookBtn) newBookBtn.disabled = false;
      if (continueBookBtn) continueBookBtn.disabled = false;
    }
  }

  // -------- TTS --------
  async function playTts() {
    if (
      !storyState.previousChapters ||
      !Array.isArray(storyState.previousChapters) ||
      storyState.previousChapters.length === 0
    ) {
      showToast("Inget kapitel finns.");
      return;
    }

    const workerUrl = window.TTS_WORKER_URL;
    const lastChapter =
      storyState.previousChapters[storyState.previousChapters.length - 1];

    const payload = {
      text: lastChapter,
      voice: "sv-SE",
    };

    try {
      const response = await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error("TTS-svar inte OK:", response.status);
        showToast("Kunde inte generera ljud just nu.");
        return;
      }

      const blob = await response.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.play().catch((err) => {
        console.error("Kunde inte spela upp ljud:", err);
        showToast("Kunde inte spela upp ljudet.");
      });
    } catch (err) {
      console.error("TTS-fel:", err);
      showToast("Tekniskt fel vid ljudgenerering.");
    }
  }

  // -------- ACCORDION --------
  document.querySelectorAll(".accordion-header").forEach((btn) => {
    btn.addEventListener("click", () => {
      const parent = btn.parentElement;
      parent.classList.toggle("open");
    });
  });

  // -------- BUTTONS --------
  if (newBookBtn) {
    newBookBtn.addEventListener("click", () => {
      // Ny bok → nollställ tidigare kapitel men behåll namn/ålder/titel
      storyState.previousChapters = [];
      storyState.chapterIndex = 0;
      storyState.summary = "";
      saveStoryState();
      renderStory();
      callApi("new");
    });
  }

  if (continueBookBtn) {
    continueBookBtn.addEventListener("click", () => {
      if (
        !storyState.previousChapters ||
        !Array.isArray(storyState.previousChapters) ||
        storyState.previousChapters.length === 0
      ) {
        showToast("Det finns ingen bok att fortsätta, starta en ny först.");
        return;
      }
      callApi("continue");
    });
  }

  if (ttsPlayBtn) {
    ttsPlayBtn.addEventListener("click", () => {
      playTts();
    });
  }

  if (resetStoryBtn) {
    resetStoryBtn.addEventListener("click", () => {
      if (
        !storyState.previousChapters ||
        !Array.isArray(storyState.previousChapters) ||
        storyState.previousChapters.length === 0
      ) {
        showToast("Det finns ingen bok att rensa.");
        return;
      }

      const ok = confirm(
        "Detta tar bort den här boken från den här enheten. Vill du fortsätta?"
      );
      if (ok) {
        resetStoryOnThisDevice();
      }
    });
  }

  // INIT
  loadStoryState();
  loadStats();
  renderStory();
});
