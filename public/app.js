//---------------------------------------------------------
// BN-Kids-Stories v2.0 – frontend (Golden Copy)
//---------------------------------------------------------

window.BN_WORKER_URL =
  window.BN_WORKER_URL ||
  "https://bn-kids-stories-worker.bjorta-bb.workers.dev";

window.TTS_WORKER_URL =
  window.TTS_WORKER_URL ||
  "https://get-audio-worker.bjorta-bb.workers.dev";

document.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEY = "bnkidsstories_state_v1";

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

  let storyState = {
    childName: "",
    childAge: null,
    bookTitle: "",
    chapterIndex: 0,
    previousChapters: [],
    summary: "",
  };

  // -------- TOAST --------
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("visible");
    setTimeout(() => toastEl.classList.remove("visible"), 3500);
  }

  // -------- OVERLAY --------
  function showOverlay() {
    overlay.classList.remove("hidden");
  }
  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  // -------- LOCAL STORAGE --------
  function loadStoryState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);

      storyState = {
        childName: parsed.childName || "",
        childAge: parsed.childAge || null,
        bookTitle: parsed.bookTitle || "",
        chapterIndex: parsed.chapterIndex ?? 0,
        previousChapters: parsed.previousChapters || [],
        summary: parsed.summary || "",
      };

      childNameInput.value = storyState.childName;
      childAgeInput.value = storyState.childAge ?? "";
      bookTitleInput.value = storyState.bookTitle;
    } catch {}
  }

  function saveStoryState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storyState));
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
    localStorage.removeItem(STORAGE_KEY);

    childNameInput.value = "";
    childAgeInput.value = "";
    bookTitleInput.value = "";
    promptInput.value = "";

    renderStory();
    showToast("Boken rensad på denna enhet.");
  }

  // -------- RENDER --------
  function renderStory() {
    if (!storyState.previousChapters.length) {
      storyOutput.textContent = "Här kommer din berättelse att visas. ✨";
      return;
    }

    const parts = storyState.previousChapters.map((t, i) =>
      `Kapitel ${i + 1}\n\n${t}`
    );

    storyOutput.textContent = parts.join("\n\n──────────\n\n");
  }

  // -------- API CALL --------
  async function callApi(mode) {
    const workerUrl = window.BN_WORKER_URL;

    const childName = childNameInput.value.trim();
    const childAge = parseInt(childAgeInput.value.trim(), 10);
    const bookTitle = bookTitleInput.value.trim();
    const childPrompt = promptInput.value.trim();

    if (!childName || !bookTitle || !childPrompt) {
      showToast("Fyll i allt först.");
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
      chapter_index: storyState.chapterIndex,
      previous_chapters: storyState.previousChapters,
      summary_so_far: storyState.summary,
      child_prompt: childPrompt,
    };

    try {
      showOverlay();
      newBookBtn.disabled = true;
      continueBookBtn.disabled = true;

      const response = await fetch(`${workerUrl}/api/story`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        showToast("API-fel. Försök igen.");
        return;
      }

      const data = await response.json();
      if (!data.ok) {
        showToast(data.error || "Okänt API-fel.");
        return;
      }

      const newText = data.chapter_text?.trim();
      if (!newText) {
        showToast("Inget kapitel i svar.");
        return;
      }

      storyState.previousChapters.push(newText);
      storyState.chapterIndex = data.chapter_index ?? (storyState.chapterIndex + 1);
      storyState.summary = data.summary_so_far ?? storyState.summary;

      saveStoryState();
      renderStory();

      showToast("Kapitel skapat! ✨");

    } catch (err) {
      console.error(err);
      showToast("Tekniskt fel.");
    } finally {
      hideOverlay();
      newBookBtn.disabled = false;
      continueBookBtn.disabled = false;
    }
  }

  // -------- TTS --------
  async function playTts() {
    if (!storyState.previousChapters.length) {
      showToast("Inget kapitel finns.");
      return;
    }

    const workerUrl = window.TTS_WORKER_URL;

    const payload = {
      text: storyState.previousChapters.at(-1),
      voice: "sv-SE",
    };

    const response = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const blob = await response.blob();
    const audio = new Audio(URL.createObjectURL(blob));
    audio.play();
  }

  // -------- ACCORDION --------
  document.querySelectorAll(".accordion-header").forEach((btn) => {
    btn.addEventListener("click", () => {
      const parent = btn.parentElement;
      parent.classList.toggle("open");
    });
  });

  // -------- BUTTONS --------
  newBookBtn.addEventListener("click", () => {
    storyState.previousChapters = [];
    storyState.chapterIndex = 0;
    storyState.summary = "";
    saveStoryState();
    renderStory();
    callApi("new");
  });

  continueBookBtn.addEventListener("click", () => {
    if (!storyState.previousChapters.length) {
      showToast("Starta en ny bok först.");
      return;
    }
    callApi("continue");
  });

  ttsPlayBtn.addEventListener("click", playTts);
  resetStoryBtn.addEventListener("click", resetStoryOnThisDevice);

  // INIT
  loadStoryState();
  renderStory();
});
