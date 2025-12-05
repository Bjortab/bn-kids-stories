// BN-Kids-Stories v1 – frontend

window.BN_WORKER_URL =
  window.BN_WORKER_URL ||
  "https://bn-kids-stories-worker.bjorta-bb.workers.dev";

window.TTS_WORKER_URL =
  window.TTS_WORKER_URL ||
  "https://get-audio-worker.bjorta-bb.workers.dev";

document.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEY = "bnkidsstories_state_v1";

  // --- DOM-element ---
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
  const spinnerEl = document.getElementById("spinner");

  // --- State ---
  let storyState = {
    childName: "",
    childAge: null,
    bookTitle: "",
    chapterIndex: 0,
    previousChapters: [],
    summary: "",
    modelsUsed: [],
  };

  // ===== Helpers =====

  function showToast(message) {
    if (!toastEl) {
      console.log("[BN-Kids-Stories toast]", message);
      return;
    }
    toastEl.textContent = message;
    toastEl.classList.add("visible");
    setTimeout(() => {
      toastEl.classList.remove("visible");
    }, 3500);
  }

  function setLoading(isLoading) {
    if (spinnerEl) {
      spinnerEl.classList.toggle("spinner-hidden", !isLoading);
    }
    if (newBookBtn) newBookBtn.disabled = isLoading;
    if (continueBookBtn) continueBookBtn.disabled = isLoading;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/[&<>"']/g, (ch) => {
      switch (ch) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        default:
          return ch;
      }
    });
  }

  // ===== LocalStorage =====

  function loadStoryState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;

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
        modelsUsed: Array.isArray(parsed.modelsUsed)
          ? parsed.modelsUsed
          : [],
      };

      if (childNameInput) childNameInput.value = storyState.childName;
      if (childAgeInput)
        childAgeInput.value = storyState.childAge
          ? String(storyState.childAge)
          : "";
      if (bookTitleInput) bookTitleInput.value = storyState.bookTitle;
    } catch (err) {
      console.error("Kunde inte läsa storyState från localStorage:", err);
    }
  }

  function saveStoryState() {
    try {
      const toSave = {
        childName: storyState.childName,
        childAge: storyState.childAge,
        bookTitle: storyState.bookTitle,
        chapterIndex: storyState.chapterIndex,
        previousChapters: storyState.previousChapters,
        summary: storyState.summary,
        modelsUsed: storyState.modelsUsed,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (err) {
      console.error("Kunde inte spara storyState till localStorage:", err);
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
      modelsUsed: [],
    };
    localStorage.removeItem(STORAGE_KEY);

    if (childNameInput) childNameInput.value = "";
    if (childAgeInput) childAgeInput.value = "";
    if (bookTitleInput) bookTitleInput.value = "";
    if (promptInput) promptInput.value = "";

    renderStory();
    showToast("Den här enhetens bok är rensad.");
  }

  // ===== Render =====

  function renderStory() {
    if (!storyOutput) return;

    const chapters = storyState.previousChapters;
    if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
      storyOutput.textContent = "Här kommer din berättelse att visas. ✨";
      return;
    }

    const models = storyState.modelsUsed || [];

    const htmlParts = [];
    htmlParts.push('<div class="chapter-list">');

    chapters.forEach((chapterText, index) => {
      const chapterNo = index + 1;
      const model = models[index] || "";
      const openAttr = index === chapters.length - 1 ? " open" : "";
      const safeText = escapeHtml(chapterText);

      htmlParts.push(
        `<details class="chapter-card"${openAttr}>
          <summary>
            <div class="chapter-title-row">
              <span class="chapter-label">Kapitel ${chapterNo}</span>
              ${
                model
                  ? `<span class="chapter-model">${escapeHtml(model)}</span>`
                  : ""
              }
            </div>
          </summary>
          <div class="chapter-body">${safeText}</div>
        </details>`
      );
    });

    htmlParts.push("</div>");
    storyOutput.innerHTML = htmlParts.join("");
  }

  // ===== API-anrop =====

  async function callBnKidsStoriesApi(mode) {
    try {
      const workerUrl =
        window.BN_WORKER_URL ||
        "https://bn-kids-stories-worker.bjorta-bb.workers.dev";

      const childName = (childNameInput?.value || "").trim();
      const childAge = parseInt((childAgeInput?.value || "").trim(), 10) || null;
      const bookTitle = (bookTitleInput?.value || "").trim();
      const childPrompt = (promptInput?.value || "").trim();

      if (!childName || !bookTitle || !childPrompt) {
        showToast("Fyll i namn, ålder, titel och vad kapitlet ska handla om.");
        return;
      }

      storyState.childName = childName;
      storyState.childAge = childAge;
      storyState.bookTitle = bookTitle;

      const payload = {
        mode,
        child_name: childName,
        child_age: childAge,
        book_title: bookTitle,
        chapter_index:
          typeof storyState.chapterIndex === "number"
            ? storyState.chapterIndex
            : 0,
        previous_chapters: storyState.previousChapters || [],
        summary_so_far: storyState.summary || "",
        child_prompt: childPrompt,
      };

      setLoading(true);

      const response = await fetch(`${workerUrl}/api/story`, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(
          "BN-Kids-Stories API svarade inte OK:",
          response.status,
          await response.text().catch(() => "")
        );
        showToast(
          "Fel vid anrop till BN-Kids-Stories API. Försök igen om en liten stund."
        );
        return;
      }

      const data = await response.json().catch((err) => {
        console.error("Kunde inte parsa JSON från API:", err);
        return null;
      });

      if (!data || !data.ok) {
        console.error("BN-Kids-Stories API fel:", data);
        showToast(
          "API-fel: " + (data?.error || "Okänt fel. Prova igen om en stund.")
        );
        return;
      }

      const newChapterText = (data.chapter_text || "").trim();
      const nextChapterIndex =
        typeof data.chapter_index === "number"
          ? data.chapter_index
          : storyState.chapterIndex + 1;

      if (!newChapterText) {
        showToast("API svarade utan kapiteltext. Försök igen.");
        return;
      }

      if (!Array.isArray(storyState.previousChapters)) {
        storyState.previousChapters = [];
      }
      if (!Array.isArray(storyState.modelsUsed)) {
        storyState.modelsUsed = [];
      }

      storyState.previousChapters.push(newChapterText);
      storyState.chapterIndex = nextChapterIndex;
      storyState.summary = data.summary_so_far || storyState.summary || "";
      storyState.modelsUsed.push(data.model_used || "");

      saveStoryState();
      renderStory();

      console.log("[BN-Kids-Stories] Modell:", data.model_used);
      showToast("Nytt kapitel skapat ✨");
    } catch (err) {
      console.error("Tekniskt fel vid anrop till BN-Kids-Stories API:", err);
      showToast(
        "Tekniskt fel vid anrop till BN-Kids-Stories API. Kontrollera internet och försök igen."
      );
    } finally {
      setLoading(false);
    }
  }

  // ===== TTS =====

  async function playLatestChapterTts() {
    try {
      if (
        !storyState ||
        !Array.isArray(storyState.previousChapters) ||
        storyState.previousChapters.length === 0
      ) {
        showToast("Det finns inget kapitel att läsa upp ännu.");
        return;
      }

      const workerUrl =
        window.TTS_WORKER_URL ||
        "https://get-audio-worker.bjorta-bb.workers.dev";

      const lastChapter =
        storyState.previousChapters[storyState.previousChapters.length - 1];

      const payload = {
        text: lastChapter,
        voice: "sv-SE",
      };

      const response = await fetch(workerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error("TTS-worker svarade inte OK:", response.status);
        showToast("Kunde inte generera ljud just nu.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play().catch((err) => {
        console.error("Kunde inte spela upp ljud:", err);
        showToast("Kunde inte spela upp ljudet.");
      });
    } catch (err) {
      console.error("Tekniskt fel i TTS-funktion:", err);
      showToast("Tekniskt fel när ljudet skulle spelas upp.");
    }
  }

  // ===== Event listeners =====

  if (newBookBtn) {
    newBookBtn.addEventListener("click", () => {
      storyState.previousChapters = [];
      storyState.chapterIndex = 0;
      storyState.summary = "";
      storyState.modelsUsed = [];
      saveStoryState();
      renderStory();
      callBnKidsStoriesApi("new");
    });
  }

  if (continueBookBtn) {
    continueBookBtn.addEventListener("click", () => {
      if (
        !storyState ||
        !Array.isArray(storyState.previousChapters) ||
        storyState.previousChapters.length === 0
      ) {
        showToast("Det finns ingen bok att fortsätta, starta en ny först.");
        return;
      }

      callBnKidsStoriesApi("continue");
    });
  }

  if (ttsPlayBtn) {
    ttsPlayBtn.addEventListener("click", () => {
      playLatestChapterTts();
    });
  }

  if (resetStoryBtn) {
    resetStoryBtn.addEventListener("click", () => {
      if (
        !storyState ||
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

  // ===== Init =====
  loadStoryState();
  renderStory();
});
