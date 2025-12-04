// public/app.js
// BN-Kids-Stories v1 – frontendlogik (lokal lagring + API-call + TTS).

const STORAGE_KEY = "bnKidsStoriesStory_v1";

const childNameInput = document.getElementById("childName");
const childAgeInput = document.getElementById("childAge");
const storyTitleInput = document.getElementById("storyTitle");
const userPromptInput = document.getElementById("userPrompt");

const newBookBtn = document.getElementById("newBookBtn");
const continueBookBtn = document.getElementById("continueBookBtn");
const ttsPlayBtn = document.getElementById("ttsPlayBtn");
const resetStoryBtn = document.getElementById("resetStoryBtn");

const storyHeaderEl = document.getElementById("storyHeader");
const storyMetaEl = document.getElementById("storyMeta");
const storyOutputEl = document.getElementById("storyOutput");
const toastEl = document.getElementById("toast");

let storyState = loadStoryState();
let isGenerating = false;
let lastChapterTextForTts = "";

// === Helpers ===

function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2500);
}

function loadStoryState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error("Kunde inte läsa storyState:", err);
    return null;
  }
}

function saveStoryState() {
  try {
    if (!storyState) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storyState));
  } catch (err) {
    console.error("Kunde inte spara storyState:", err);
  }
}

function resetStoryOnThisDevice() {
  storyState = null;
  saveStoryState();
  renderStory();
  showToast("Boken rensades på den här enheten.");
}

function buildSummarySoFar(chapters) {
  if (!chapters || chapters.length === 0) return "";
  const parts = chapters.slice(0, 8).map((ch) => {
    const firstSentence = (ch.text || "").split(/[.!?]/)[0].trim();
    return `Kapitel ${ch.index}: ${ch.title || ""} – ${firstSentence}`;
  });
  return parts.join(" | ");
}

function renderStory() {
  if (!storyOutputEl || !storyMetaEl || !storyHeaderEl) return;

  if (!storyState || !storyState.chapters || storyState.chapters.length === 0) {
    storyHeaderEl.textContent = "Din kapitelbok";
    storyMetaEl.textContent = "";
    storyOutputEl.innerHTML =
      '<p class="placeholder">Här kommer din berättelse att visas. ✨</p>';
    lastChapterTextForTts = "";
    return;
  }

  const { bookMeta, chapters } = storyState;
  storyHeaderEl.textContent = bookMeta?.title || "Din kapitelbok";

  storyMetaEl.textContent = `Kapitel: ${chapters.length} · Barn: ${
    bookMeta.childName || "–"
  } · Ålder: ${bookMeta.childAge || "–"}`;

  const htmlParts = [];
  chapters.forEach((ch) => {
    htmlParts.push(
      `<p class="chapter-title">Kapitel ${ch.index}: ${ch.title}</p>`
    );
    const lines = ch.text.split(/\n+/);
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      htmlParts.push(`<p>${trimmed}</p>`);
    });
  });

  storyOutputEl.innerHTML = htmlParts.join("");
  const last = chapters[chapters.length - 1];
  lastChapterTextForTts = last?.text || "";
}

// === TTS ===
function playTts() {
  if (!lastChapterTextForTts) {
    showToast("Det finns inget kapitel att läsa upp ännu.");
    return;
  }
  if (!("speechSynthesis" in window)) {
    showToast("Den här webbläsaren stödjer inte uppläsning.");
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(lastChapterTextForTts);
  utterance.lang = "sv-SE";
  window.speechSynthesis.speak(utterance);
}

// === API ===

async function callBnKidsStoriesApi(mode) {
  if (isGenerating) return;
  isGenerating = true;
  newBookBtn.disabled = true;
  continueBookBtn.disabled = true;
  showToast("Skapar kapitel...");

  try {
    const childName = (childNameInput.value || "").trim();
    const childAge = parseInt(childAgeInput.value || "0", 10);
    const title = (storyTitleInput.value || "").trim();
    const childPrompt = (userPromptInput.value || "").trim();

    if (!childName || !childAge || !title) {
      showToast("Fyll i namn, ålder och titel först.");
      return;
    }

    let currentStoryState = storyState;
    if (!currentStoryState || mode === "new") {
      currentStoryState = {
        bookMeta: {
          title,
          childName,
          childAge,
          language: "sv"
        },
        chapters: [],
        summarySoFar: "",
        nextChapterIndex: 1
      };
    } else {
      currentStoryState.bookMeta.title = title;
      currentStoryState.bookMeta.childName = childName;
      currentStoryState.bookMeta.childAge = childAge;
    }

    const chapterIndex = currentStoryState.nextChapterIndex || 1;
    const summarySoFar = buildSummarySoFar(currentStoryState.chapters);

    const engineMeta = {
      target_age_group: childAge <= 10 ? "8-10" : "11-15",
      genre: "äventyr",
      tone: "spännande men hoppfull",
      max_chars: 4000
    };

    const payload = {
      mode,
      book_meta: currentStoryState.bookMeta,
      engine_meta: engineMeta,
      story_state: {
        chapter_index: chapterIndex,
        previous_chapters: currentStoryState.chapters,
        summary_so_far: summarySoFar
      },
      child_prompt: childPrompt
    };

    const res = await fetch("https://bn-kids-stories-worker.bjorta-bb.workers.dev/api/story", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("BN-Kids-Stories API-fel:", res.status, errText);
      showToast("Något gick fel med sagomotorn.");
      return;
    }

    const data = await res.json();
    if (!data || !data.chapter) {
      showToast("Ofullständigt svar från sagomotorn.");
      return;
    }

    const { chapter } = data;

    const newChapter = {
      index: chapter.chapter_index,
      title: chapter.chapter_title || `Kapitel ${chapter.chapter_index}`,
      text: chapter.chapter_text || ""
    };

    currentStoryState.chapters.push(newChapter);
    currentStoryState.summarySoFar = summarySoFar;
    currentStoryState.nextChapterIndex = chapter.chapter_index + 1;

    storyState = currentStoryState;
    saveStoryState();
    renderStory();
    showToast(`Kapitel ${newChapter.index} klart!`);
    userPromptInput.value = "";
  } catch (err) {
    console.error("Fel vid anrop till BN-Kids-Stories API:", err);
    showToast("Tekniskt fel, försök igen.");
  } finally {
    isGenerating = false;
    newBookBtn.disabled = false;
    continueBookBtn.disabled = false;
  }
}

// === Event listeners ===

if (newBookBtn) {
  newBookBtn.addEventListener("click", () => {
    callBnKidsStoriesApi("new");
  });
}

if (continueBookBtn) {
  continueBookBtn.addEventListener("click", () => {
    if (!storyState || !storyState.chapters || storyState.chapters.length === 0) {
      showToast("Det finns ingen bok att fortsätta, starta en ny först.");
      return;
    }
    callBnKidsStoriesApi("continue");
  });
}

if (ttsPlayBtn) {
  ttsPlayBtn.addEventListener("click", playTts);
}

if (resetStoryBtn) {
  resetStoryBtn.addEventListener("click", () => {
    if (!storyState || !storyState.chapters || storyState.chapters.length === 0) {
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
});

// Init
renderStory();

windows.BN_WORKER_URL = "https://bn-kids-stories-worker.bjorta-bb.worker.dev";
