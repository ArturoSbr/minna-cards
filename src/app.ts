// ============================================
// Minna Cards — Japanese Vocabulary Quiz App
// ============================================

// --- Types ---

interface Word {
  id: number;
  english: string[];
  kana: string[];
  kanji: string | null;
}

type QuizMode = "en-to-kana" | "kana-to-en";

interface QuizState {
  words: Word[];
  currentIndex: number;
  correctCount: number;
  newWordsAsked: number;    // only counts first-time words
  totalTarget: number;      // original word count chosen by user
  mode: QuizMode;
  isReviewPhase: boolean;   // true when all new words are done, reviewing missed ones
}

// --- Constants ---

const CHAPTERS = [1, 2, 3, 4, 5];
const STUDY_PAGE_SIZE = 5;

// --- DOM Elements ---

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

// Screens
const setupScreen = $("setup-screen");
const studyScreen = $("study-screen");
const quizScreen = $("quiz-screen");
const resultsScreen = $("results-screen");

// Setup
const chapterSelect = $("chapter-select");
const actionFork = $("action-fork");
const studyBtn = $("study-btn");
const quizBtn = $("quiz-btn");
const quizOptions = $("quiz-options");
const modeSelect = $("mode-select");
const wordCountInput = $("word-count-input") as HTMLInputElement;
const wordCountTotal = $("word-count-total");
const startBtn = $("start-btn") as HTMLButtonElement;

// Study
const studyBackBtn = $("study-back-btn");
const studyTitle = $("study-title");
const studyPageInfo = $("study-page-info");
const studyTableBody = $("study-table-body");
const studyPrevBtn = $("study-prev-btn") as HTMLButtonElement;
const studyNextBtn = $("study-next-btn") as HTMLButtonElement;

// Quiz
const quitBtn = $("quit-btn");
const progressText = $("progress-text");
const progressBarFill = $("progress-bar-fill");
const modeBadge = $("mode-badge");
const promptText = $("prompt-text");
const promptKanji = $("prompt-kanji");
const answerInput = $("answer-input") as HTMLInputElement;
const submitBtn = $("submit-btn");
const skipBtn = $("skip-btn");

// Result overlay
const resultOverlay = $("result-overlay");
const resultCard = $("result-card");
const resultIcon = $("result-icon");
const resultLabel = $("result-label");
const resultAnswer = $("result-answer");
const resultKanji = $("result-kanji");
const resultAlts = $("result-alts");
const continueBtn = $("continue-btn");

// Results
const resultsScore = $("results-score");
const resultsDetail = $("results-detail");
const restartBtn = $("restart-btn");

// --- State ---

let selectedChapter: number | null = null;
let selectedMode: QuizMode = "en-to-kana";
const chapterWordCounts: Map<number, number> = new Map();
const chapterDataCache: Map<number, Word[]> = new Map();
let state: QuizState | null = null;

// Study state
let studyWords: Word[] = [];
let studyPage = 0;
let studyTotalPages = 0;

// --- Utility Functions ---

/** Fisher-Yates shuffle (in-place) */
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Load a chapter's vocabulary from JSON (with cache) */
async function loadChapter(chapter: number): Promise<Word[]> {
  if (chapterDataCache.has(chapter)) {
    return chapterDataCache.get(chapter)!;
  }
  const paddedNum = String(chapter).padStart(2, "0");
  const response = await fetch(`vocabulary/chapter-${paddedNum}.json`);
  if (!response.ok) {
    throw new Error(`Failed to load chapter ${chapter}`);
  }
  const data: Word[] = await response.json();
  chapterDataCache.set(chapter, data);
  return data;
}

/** Strip placeholder characters (～, ~, 〜) for comparison */
function normalize(s: string): string {
  return s.replace(/[～~〜]/g, "").trim();
}

/** Expand optional [bracket] parts into variants */
function expandVariants(s: string): string[] {
  const withContent = s.replace(/[\[\]]/g, "");    // keep content, remove brackets
  const withoutContent = s.replace(/\[.*?\]/g, ""); // remove brackets and content
  const variants = [normalize(withContent)];
  const stripped = normalize(withoutContent);
  if (stripped !== variants[0]) {
    variants.push(stripped);
  }
  return variants;
}

/** Check if user's answer is correct */
function checkAnswer(input: string, word: Word, mode: QuizMode): boolean {
  const userAnswer = normalize(input);

  if (mode === "en-to-kana") {
    return word.kana.some((k) => expandVariants(k).includes(userAnswer));
  } else {
    const lowerAnswer = userAnswer.toLowerCase();
    return word.english.some((e) => expandVariants(e).some((v) => v.toLowerCase() === lowerAnswer));
  }
}

// --- Screen Navigation ---

function showScreen(screen: HTMLElement): void {
  [setupScreen, studyScreen, quizScreen, resultsScreen].forEach((s) => {
    s.classList.add("hidden");
  });
  screen.classList.remove("hidden");

  // Re-trigger fade animation
  screen.style.animation = "none";
  screen.offsetHeight; // force reflow
  screen.style.animation = "";
}

// --- Setup Screen Logic ---

function initSetupScreen(): void {
  // Generate chapter chips
  chapterSelect.innerHTML = "";
  CHAPTERS.forEach((ch) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.dataset.chapter = String(ch);
    chip.innerHTML = `<span class="chip-text">Ch. ${ch}</span>`;
    chip.addEventListener("click", () => selectChapter(ch));
    chapterSelect.appendChild(chip);
  });

  // Mode chip listeners
  modeSelect.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const mode = (chip as HTMLElement).dataset.mode as QuizMode;
      selectMode(mode);
    });
  });

  // Fork buttons
  studyBtn.addEventListener("click", handleStudy);
  quizBtn.addEventListener("click", handleQuizFork);

  // Start button
  startBtn.addEventListener("click", handleStart);

  // Word count input validation
  wordCountInput.addEventListener("input", () => {
    validateSetup();
  });

  // Preload word counts for all chapters
  preloadWordCounts();
}

async function preloadWordCounts(): Promise<void> {
  for (const ch of CHAPTERS) {
    try {
      const words = await loadChapter(ch);
      chapterWordCounts.set(ch, words.length);
    } catch {
      chapterWordCounts.set(ch, 0);
    }
  }

  // Auto-select Chapter 1
  selectChapter(1);
}

function selectChapter(chapter: number): void {
  selectedChapter = chapter;

  // Update chip selection
  chapterSelect.querySelectorAll(".chip").forEach((chip) => {
    const ch = Number((chip as HTMLElement).dataset.chapter);
    chip.classList.toggle("selected", ch === chapter);
  });

  // Show the fork buttons, hide quiz options
  actionFork.classList.remove("hidden");
  quizOptions.classList.add("hidden");

  updateWordCountForChapter(chapter);
}

function updateWordCountForChapter(chapter: number): void {
  const count = chapterWordCounts.get(chapter) || 0;
  wordCountInput.value = String(count);
  wordCountInput.max = String(count);
  wordCountTotal.textContent = `of ${count} words`;
}

function handleQuizFork(): void {
  // Show quiz options (mode, word count, start)
  quizOptions.classList.remove("hidden");
  validateSetup();
}

function selectMode(mode: QuizMode): void {
  selectedMode = mode;

  modeSelect.querySelectorAll(".chip").forEach((chip) => {
    const m = (chip as HTMLElement).dataset.mode;
    chip.classList.toggle("selected", m === mode);
  });

  validateSetup();
}

function validateSetup(): void {
  const count = Number(wordCountInput.value);
  const maxCount = chapterWordCounts.get(selectedChapter || 0) || 0;
  const valid =
    selectedChapter !== null && count > 0 && count <= maxCount;

  startBtn.disabled = !valid;
}

// --- Study Logic ---

async function handleStudy(): Promise<void> {
  if (selectedChapter === null) return;

  const words = await loadChapter(selectedChapter);
  studyWords = words;
  studyPage = 0;
  studyTotalPages = Math.ceil(words.length / STUDY_PAGE_SIZE);

  studyTitle.textContent = `Chapter ${selectedChapter} — Study`;

  showScreen(studyScreen);
  renderStudyPage();
}

function renderStudyPage(): void {
  const start = studyPage * STUDY_PAGE_SIZE;
  const end = Math.min(start + STUDY_PAGE_SIZE, studyWords.length);
  const pageWords = studyWords.slice(start, end);

  // Update page info
  studyPageInfo.textContent = `${studyPage + 1} / ${studyTotalPages}`;

  // Update button states
  studyPrevBtn.disabled = studyPage === 0;
  if (studyPage >= studyTotalPages - 1) {
    studyNextBtn.textContent = "Exit";
  } else {
    studyNextBtn.textContent = "Next \u2192";
  }

  // Render rows
  studyTableBody.innerHTML = "";
  pageWords.forEach((word) => {
    const tr = document.createElement("tr");

    const englishTd = document.createElement("td");
    englishTd.textContent = word.english.join(", ");

    const kanaTd = document.createElement("td");
    kanaTd.textContent = word.kana.join(", ");

    const kanjiTd = document.createElement("td");
    if (word.kanji) {
      kanjiTd.textContent = word.kanji;
      kanjiTd.className = "kanji-cell";
    } else {
      kanjiTd.textContent = "—";
      kanjiTd.className = "no-kanji";
    }

    tr.appendChild(englishTd);
    tr.appendChild(kanaTd);
    tr.appendChild(kanjiTd);
    studyTableBody.appendChild(tr);
  });
}

function studyPrevPage(): void {
  if (studyPage > 0) {
    studyPage--;
    renderStudyPage();
  }
}

function studyNextPage(): void {
  if (studyPage < studyTotalPages - 1) {
    studyPage++;
    renderStudyPage();
  } else {
    handleQuit();
  }
}

// --- Quiz Logic ---

async function handleStart(): Promise<void> {
  if (selectedChapter === null) return;

  const count = Number(wordCountInput.value);
  const words = await loadChapter(selectedChapter);

  // Shuffle and slice to the desired count
  const shuffled = shuffleArray([...words]).slice(0, count);

  state = {
    words: shuffled,
    currentIndex: 0,
    correctCount: 0,
    newWordsAsked: 0,
    totalTarget: count,
    mode: selectedMode,
    isReviewPhase: false,
  };

  // Set mode badge
  modeBadge.textContent = selectedMode === "en-to-kana" ? "A→あ" : "あ→A";

  showScreen(quizScreen);
  showWord();
}

function showWord(): void {
  if (!state) return;

  const word = state.words[state.currentIndex];

  // Update progress
  if (!state.isReviewPhase) {
    state.newWordsAsked++;
    const pct = Math.round(
      ((state.newWordsAsked) / state.totalTarget) * 100
    );
    progressText.textContent = `Word ${state.newWordsAsked} of ${state.totalTarget}`;
    progressText.classList.remove("review-mode");
    progressBarFill.style.width = `${pct}%`;
  } else {
    progressText.textContent = `Review`;
    progressText.classList.add("review-mode");
    progressBarFill.style.width = "100%";
  }

  // Set prompt based on mode
  if (state.mode === "en-to-kana") {
    // Show English, user types kana
    promptText.textContent = word.english.join(" / ");
    answerInput.placeholder = "Type the kana...";
  } else {
    // Show kana, user types English
    promptText.textContent = word.kana.join(" / ");
    answerInput.placeholder = "Type in English...";
  }

  // Show kanji as supplement (if available)
  if (word.kanji) {
    promptKanji.textContent = word.kanji;
    promptKanji.style.display = "";
  } else {
    promptKanji.textContent = "";
    promptKanji.style.display = "none";
  }

  // Clear and focus input
  answerInput.value = "";
  answerInput.focus();

  // Ensure overlay is hidden
  resultOverlay.classList.add("hidden");
}

function handleSubmit(): void {
  if (!state) return;

  // Empty input = skip
  if (answerInput.value.trim() === "") {
    handleSkip();
    return;
  }

  const word = state.words[state.currentIndex];
  const isCorrect = checkAnswer(answerInput.value, word, state.mode);

  if (isCorrect) {
    state.correctCount++;
  } else {
    // Re-queue the word at a random position among remaining words
    requeueWord(word);
  }

  showResult(isCorrect, word);
}

function handleSkip(): void {
  if (!state) return;

  const word = state.words[state.currentIndex];
  // Skip = wrong answer, re-queue
  requeueWord(word);
  showResult(false, word);
}

function requeueWord(word: Word): void {
  if (!state) return;

  const remaining = state.words.length - state.currentIndex - 1;
  if (remaining > 0) {
    // Insert at a random position among the remaining words
    const insertOffset = 1 + Math.floor(Math.random() * remaining);
    const insertPos = state.currentIndex + insertOffset;
    state.words.splice(insertPos, 0, { ...word });
  } else {
    // No remaining words — just push to the end
    state.words.push({ ...word });
  }
}

function showResult(correct: boolean, word: Word): void {
  // Style the result card
  resultCard.classList.remove("correct", "wrong");
  resultCard.classList.add(correct ? "correct" : "wrong");

  resultIcon.textContent = correct ? "✓" : "✗";
  resultLabel.textContent = correct ? "Correct!" : "Incorrect";

  // Show the correct answer(s)
  if (state?.mode === "en-to-kana") {
    resultAnswer.textContent = word.kana.join(" / ");
  } else {
    resultAnswer.textContent = word.english.join(" / ");
  }

  // Show kanji
  if (word.kanji) {
    resultKanji.textContent = word.kanji;
    resultKanji.style.display = "";
  } else {
    resultKanji.textContent = "";
    resultKanji.style.display = "none";
  }

  // Show alternative meanings
  const altLines: string[] = [];

  if (state?.mode === "en-to-kana" && word.english.length > 0) {
    altLines.push(`English: ${word.english.join(", ")}`);
  } else if (state?.mode === "kana-to-en" && word.kana.length > 0) {
    altLines.push(`Kana: ${word.kana.join(", ")}`);
  }

  if (altLines.length > 0) {
    resultAlts.innerHTML = `<div class="alt-heading">Also</div>${altLines.join("<br>")}`;
    resultAlts.style.display = "";
  } else {
    resultAlts.style.display = "none";
  }

  // Show overlay
  resultOverlay.classList.remove("hidden");

  // Re-trigger animation
  resultCard.style.animation = "none";
  resultCard.offsetHeight;
  resultCard.style.animation = "";

  // Delay focus so the Enter keyup doesn't immediately trigger Continue
  setTimeout(() => continueBtn.focus(), 50);
}

function handleContinue(): void {
  if (!state) return;

  state.currentIndex++;

  // Check if quiz is over
  if (state.currentIndex >= state.words.length) {
    showResults();
    return;
  }

  // Check if we're entering review phase
  // (all original new words have been shown)
  if (state.newWordsAsked >= state.totalTarget && !state.isReviewPhase) {
    state.isReviewPhase = true;
  }

  showWord();
}

function showResults(): void {
  if (!state) return;

  resultsScore.textContent = `${state.correctCount} / ${state.totalTarget}`;

  const pct = Math.round((state.correctCount / state.totalTarget) * 100);
  let message = "";
  if (pct === 100) message = "Perfect! すごい！🎉";
  else if (pct >= 80) message = "Great job! がんばった！💪";
  else if (pct >= 60) message = "Good effort! もうちょっと！📚";
  else message = "Keep practicing! ファイト！🔥";

  resultsDetail.textContent = `${pct}% — ${message}`;

  showScreen(resultsScreen);
}

function handleQuit(): void {
  state = null;
  showScreen(setupScreen);
}

// --- Event Listeners ---

function initQuizListeners(): void {
  // Submit answer
  submitBtn.addEventListener("click", handleSubmit);
  skipBtn.addEventListener("click", handleSkip);

  // Enter to submit OR continue
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (!resultOverlay.classList.contains("hidden")) {
        // Result is showing — continue
        handleContinue();
      } else if (!quizScreen.classList.contains("hidden")) {
        // Quiz is active — submit
        handleSubmit();
      }
    }
  });

  // Continue button
  continueBtn.addEventListener("click", handleContinue);

  // Quit button
  quitBtn.addEventListener("click", handleQuit);

  // Restart button
  restartBtn.addEventListener("click", handleQuit);
}

function initStudyListeners(): void {
  studyBackBtn.addEventListener("click", handleQuit);
  studyPrevBtn.addEventListener("click", studyPrevPage);
  studyNextBtn.addEventListener("click", studyNextPage);
}

// --- Init ---

function init(): void {
  initSetupScreen();
  initQuizListeners();
  initStudyListeners();
}

init();
