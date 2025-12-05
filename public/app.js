// BN-Kids-Stories v2 – frontend
// - Kopplar mot Cloudflare-worker (BN-Kids StoryEngine)
// - Sparar bok lokalt per enhet
// - Visar kapitel i dropdowns (ett <details> per kapitel)

// Standard-URL till API-workern (kan överskridas via <script> före denna fil)
window.BN_WORKER_URL =
  window.BN_WORKER_URL ||
  "https://bn-kids-stories-worker.bjorta-bb.workers.dev";

// (valfri) TTS-worker – vi kan justera denna senare om du vill
window.TTS_WORKER_URL =
  window.TTS_WORKER_URL ||
  "https://get-audio-worker.bjorta-bb.workers.dev";

document.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEY = "bnkidsstories_state_v2";

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

  // för enkel "spinner": vi byter text & disable på knappar
  const originalBtnTexts = {
    new: newBookBtn ? newBookBtn.textContent : "",
    cont: continueBookBtn ? continueBookBtn.textContent : ""
  };

  // --- State i minnet ---
  let storyState = {
    childName: "",
    childAge: null,
    bookTitle: "",
    chapterIndex: 0,
    previousChapters: [],
    summary: ""
  };

  // --- Hjälpfunktion: toast ---
  function showToast(message) {
    if (toastEl) {
      toastEl.textContent = message;
      toastEl.classList.add("visible");
      setTimeout(() => {
        toastEl.classList.remove("visible");
      }, 4000);
    } else {
      console.log("[BN-Kids-Stories]", message);
      alert(message);
    }
  }

  // --- Enkel "laddar"-indikator ---
  function setLoading(isLoading) {
    if (isLoading) {
      if (newBookBtn) {
        newBookBtn.disabled = true;
        newBookBtn.textContent = "Skapar kapitel...";
      }
      if (continueBookBtn) {
        continueBookBtn.disabled = true;
        continueBookBtn.textContent = "Skapar kapitel...";
      }
    } else {
      if (newBookBtn) {
        newBookBtn.disabled = false;
        newBookBtn.textContent = originalBtnTexts.new;
      }
      if (continueBookBtn) {
        continueBookBtn.disabled = false;
        continueBookBtn.textContent = originalBtnTexts.cont;
      }
    }
  }

  // --- LocalStorage ---
  function loadStoryState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        storyState = {
          childName: parsed.childName || "",
          childAge: parsed.childAge || null,
          bookTitle: parsed.bookTitle || "",
          chapterIndex:
            typeof parsed.chapterIndex === "number" ? parsed.chapterIndex : 0,
          previousChapters: Array.isArray(parsed.previousChapters)
            ? parsed.previousChapters
            : [],
          summary: parsed.summary || ""
        };

        // Fyll i formuläret med sparad info
        if (childNameInput) childNameInput.value = storyState.childName;
        if (childAgeInput)
          childAgeInput.value = storyState.childAge
            ? String(storyState.childAge)
            : "";
        if (bookTitleInput) bookTitleInput.value = storyState.bookTitle;
      }
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
        summary: storyState.summary
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
      summary: ""
    };
    localStorage.removeItem(STORAGE_KEY);

    if (childNameInput) childNameInput.value = "";
    if (childAgeInput) childAgeInput.value = "";
    if (bookTitleInput) bookTitleInput.value = "";
    if (promptInput) promptInput.value = "";

    renderStory();
    showToast("Den här enhetens bok är rensad.");
  }

  // --- Rendera berättelsen i UI (DROPDOWN PER KAPITEL) ---
  function renderStory() {
    if (!storyOutput) return;

    // Inget innehåll?
    if (
      !storyState ||
      !Array.isArray(storyState.previousChapters) ||
      storyState.previousChapters.length === 0
    ) {
      storyOutput.innerHTML = "";
      const p = document.createElement("p");
      p.textContent = "Här kommer din berättelse att visas. ✨";
      storyOutput.appendChild(p);
      return;
    }

    // Rensa och bygg upp <details> för varje kapitel
    storyOutput.innerHTML = "";

    storyState.previousChapters.forEach((chapterText, index) => {
      const chapterNo = index + 1;

      const detailsEl = document.createElement("details");
      detailsEl.className = "chapter-block";

      // Sista (senaste) kapitlet ska vara öppet som standard
      if (index === storyState.previousChapters.length - 1) {
        detailsEl.open = true;
      }

      const summaryEl = document.createElement("summary");
      summaryEl.textContent = `Kapitel ${chapterNo}`;
      detailsEl.appendChild(summaryEl);

      const textWrapper = document.createElement("div");
      textWrapper.className = "chapter-text";
      // Behåll radbrytningar
      textWrapper.textContent = chapterText;

      detailsEl.appendChild(textWrapper);
      storyOutput.appendChild(detailsEl);
    });
  }

  // --- Anrop till BN-Kids-Stories worker ---
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

      // uppdatera state med senaste formulärvärden
      storyState.childName = childName;
      storyState.childAge = childAge;
      storyState.bookTitle = bookTitle;

      const payload = {
        mode, // "new" eller "continue"
        child_name: childName,
        child_age: childAge,
        book_title: bookTitle,
        chapter_index:
          typeof storyState.chapterIndex === "number"
            ? storyState.chapterIndex
            : 0,
        previous_chapters: storyState.previousChapters || [],
        summary_so_far: storyState.summary || "",
        child_prompt: childPrompt
      };

      setLoading(true);

      // Viktigt: text/plain för att slippa CORS-preflight (OPTIONS)
      const response = await fetch(`${workerUrl}/api/story`, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain"
        },
        body: JSON.stringify(payload)
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
      storyState.previousChapters.push(newChapterText);
      storyState.chapterIndex = nextChapterIndex;
      storyState.summary = data.summary_so_far || storyState.summary || "";

      saveStoryState();
      renderStory();

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

  // --- TTS – läs upp senaste kapitlet ---
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
        voice: "sv-SE" // kan justeras senare
      };

      const response = await fetch(workerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
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

  // --- Event listeners ---

  if (newBookBtn) {
    newBookBtn.addEventListener("click", () => {
      // Ny bok → nollställ tidigare kapitel men behåll namn/ålder/titel
      storyState.previousChapters = [];
      storyState.chapterIndex = 0;
      storyState.summary = "";
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

  // --- Init ---
  loadStoryState();
  renderStory();
});
