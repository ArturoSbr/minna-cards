// ============================================
// Minna Cards — Japanese Vocabulary Quiz App
// ============================================
// --- DOM Elements ---
function $(id) {
    const el = document.getElementById(id);
    if (!el)
        throw new Error(`Element #${id} not found`);
    return el;
}
// Screens
const setupScreen = $("setup-screen");
const quizScreen = $("quiz-screen");
const resultsScreen = $("results-screen");
// Setup
const chapterSelect = $("chapter-select");
const modeSelect = $("mode-select");
const wordCountInput = $("word-count-input");
const wordCountTotal = $("word-count-total");
const startBtn = $("start-btn");
// Quiz
const quitBtn = $("quit-btn");
const progressText = $("progress-text");
const progressBarFill = $("progress-bar-fill");
const modeBadge = $("mode-badge");
const promptText = $("prompt-text");
const promptKanji = $("prompt-kanji");
const answerInput = $("answer-input");
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
// --- Constants ---
const CHAPTERS = [1, 2, 3, 4, 5];
// --- State ---
let selectedChapter = null;
let selectedMode = "en-to-kana";
const chapterWordCounts = new Map();
let state = null;
// --- Utility Functions ---
/** Fisher-Yates shuffle (in-place) */
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
/** Load a chapter's vocabulary from JSON */
async function loadChapter(chapter) {
    const paddedNum = String(chapter).padStart(2, "0");
    const response = await fetch(`vocabulary/chapter-${paddedNum}.json`);
    if (!response.ok) {
        throw new Error(`Failed to load chapter ${chapter}`);
    }
    return response.json();
}
/** Strip placeholder characters (～ and ~) for comparison */
function normalize(s) {
    return s.replace(/[～~]/g, "").trim();
}
/** Check if user's answer is correct */
function checkAnswer(input, word, mode) {
    const userAnswer = normalize(input);
    if (mode === "en-to-kana") {
        // User types kana — exact match (kana has no case)
        return word.kana.some((k) => normalize(k) === userAnswer);
    }
    else {
        // User types English — case-insensitive
        const lowerAnswer = userAnswer.toLowerCase();
        return word.english.some((e) => normalize(e).toLowerCase() === lowerAnswer);
    }
}
// --- Screen Navigation ---
function showScreen(screen) {
    [setupScreen, quizScreen, resultsScreen].forEach((s) => {
        s.classList.add("hidden");
    });
    screen.classList.remove("hidden");
    // Re-trigger fade animation
    screen.style.animation = "none";
    screen.offsetHeight; // force reflow
    screen.style.animation = "";
}
// --- Setup Screen Logic ---
function initSetupScreen() {
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
            const mode = chip.dataset.mode;
            selectMode(mode);
        });
    });
    // Start button
    startBtn.addEventListener("click", handleStart);
    // Word count input validation
    wordCountInput.addEventListener("input", () => {
        validateSetup();
    });
    // Preload word counts for all chapters
    preloadWordCounts();
}
async function preloadWordCounts() {
    for (const ch of CHAPTERS) {
        try {
            const words = await loadChapter(ch);
            chapterWordCounts.set(ch, words.length);
        }
        catch {
            chapterWordCounts.set(ch, 0);
        }
    }
    // If chapter is already selected, update count
    if (selectedChapter !== null) {
        updateWordCountForChapter(selectedChapter);
    }
}
function selectChapter(chapter) {
    selectedChapter = chapter;
    // Update chip selection
    chapterSelect.querySelectorAll(".chip").forEach((chip) => {
        const ch = Number(chip.dataset.chapter);
        chip.classList.toggle("selected", ch === chapter);
    });
    updateWordCountForChapter(chapter);
    validateSetup();
}
function updateWordCountForChapter(chapter) {
    const count = chapterWordCounts.get(chapter) || 0;
    wordCountInput.value = String(count);
    wordCountInput.max = String(count);
    wordCountTotal.textContent = `of ${count} words`;
}
function selectMode(mode) {
    selectedMode = mode;
    modeSelect.querySelectorAll(".chip").forEach((chip) => {
        const m = chip.dataset.mode;
        chip.classList.toggle("selected", m === mode);
    });
    validateSetup();
}
function validateSetup() {
    const count = Number(wordCountInput.value);
    const maxCount = chapterWordCounts.get(selectedChapter || 0) || 0;
    const valid = selectedChapter !== null && count > 0 && count <= maxCount;
    startBtn.disabled = !valid;
}
async function handleStart() {
    if (selectedChapter === null)
        return;
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
// --- Quiz Logic ---
function showWord() {
    if (!state)
        return;
    const word = state.words[state.currentIndex];
    // Update progress
    if (!state.isReviewPhase) {
        state.newWordsAsked++;
        const pct = Math.round((state.newWordsAsked / state.totalTarget) * 100);
        progressText.textContent = `Word ${state.newWordsAsked} of ${state.totalTarget}`;
        progressText.classList.remove("review-mode");
        progressBarFill.style.width = `${pct}%`;
    }
    else {
        progressText.textContent = `Review`;
        progressText.classList.add("review-mode");
        progressBarFill.style.width = "100%";
    }
    // Set prompt based on mode
    if (state.mode === "en-to-kana") {
        // Show English, user types kana
        promptText.textContent = word.english.join(" / ");
        answerInput.placeholder = "Type the kana...";
    }
    else {
        // Show kana, user types English
        promptText.textContent = word.kana.join(" / ");
        answerInput.placeholder = "Type in English...";
    }
    // Show kanji as supplement (if available)
    if (word.kanji) {
        promptKanji.textContent = word.kanji;
        promptKanji.style.display = "";
    }
    else {
        promptKanji.textContent = "";
        promptKanji.style.display = "none";
    }
    // Clear and focus input
    answerInput.value = "";
    answerInput.focus();
    // Ensure overlay is hidden
    resultOverlay.classList.add("hidden");
}
function handleSubmit() {
    if (!state)
        return;
    // Empty input = skip
    if (answerInput.value.trim() === "") {
        handleSkip();
        return;
    }
    const word = state.words[state.currentIndex];
    const isCorrect = checkAnswer(answerInput.value, word, state.mode);
    if (isCorrect) {
        state.correctCount++;
    }
    else {
        // Re-queue the word at a random position among remaining words
        requeueWord(word);
    }
    showResult(isCorrect, word);
}
function handleSkip() {
    if (!state)
        return;
    const word = state.words[state.currentIndex];
    // Skip = wrong answer, re-queue
    requeueWord(word);
    showResult(false, word);
}
function requeueWord(word) {
    if (!state)
        return;
    const remaining = state.words.length - state.currentIndex - 1;
    if (remaining > 0) {
        // Insert at a random position among the remaining words
        const insertOffset = 1 + Math.floor(Math.random() * remaining);
        const insertPos = state.currentIndex + insertOffset;
        state.words.splice(insertPos, 0, { ...word });
    }
    else {
        // No remaining words — just push to the end
        state.words.push({ ...word });
    }
}
function showResult(correct, word) {
    // Style the result card
    resultCard.classList.remove("correct", "wrong");
    resultCard.classList.add(correct ? "correct" : "wrong");
    resultIcon.textContent = correct ? "✓" : "✗";
    resultLabel.textContent = correct ? "Correct!" : "Incorrect";
    // Show the correct answer(s)
    if (state?.mode === "en-to-kana") {
        resultAnswer.textContent = word.kana.join(" / ");
    }
    else {
        resultAnswer.textContent = word.english.join(" / ");
    }
    // Show kanji
    if (word.kanji) {
        resultKanji.textContent = word.kanji;
        resultKanji.style.display = "";
    }
    else {
        resultKanji.textContent = "";
        resultKanji.style.display = "none";
    }
    // Show alternative meanings
    const altLines = [];
    if (state?.mode === "en-to-kana" && word.english.length > 0) {
        altLines.push(`English: ${word.english.join(", ")}`);
    }
    else if (state?.mode === "kana-to-en" && word.kana.length > 0) {
        altLines.push(`Kana: ${word.kana.join(", ")}`);
    }
    if (altLines.length > 0) {
        resultAlts.innerHTML = `<div class="alt-heading">Also</div>${altLines.join("<br>")}`;
        resultAlts.style.display = "";
    }
    else {
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
function handleContinue() {
    if (!state)
        return;
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
function showResults() {
    if (!state)
        return;
    resultsScore.textContent = `${state.correctCount} / ${state.totalTarget}`;
    const pct = Math.round((state.correctCount / state.totalTarget) * 100);
    let message = "";
    if (pct === 100)
        message = "Perfect! すごい！🎉";
    else if (pct >= 80)
        message = "Great job! がんばった！💪";
    else if (pct >= 60)
        message = "Good effort! もうちょっと！📚";
    else
        message = "Keep practicing! ファイト！🔥";
    resultsDetail.textContent = `${pct}% — ${message}`;
    showScreen(resultsScreen);
}
function handleQuit() {
    state = null;
    showScreen(setupScreen);
}
// --- Event Listeners ---
function initQuizListeners() {
    // Submit answer
    submitBtn.addEventListener("click", handleSubmit);
    skipBtn.addEventListener("click", handleSkip);
    // Enter to submit OR continue
    document.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            if (!resultOverlay.classList.contains("hidden")) {
                // Result is showing — continue
                handleContinue();
            }
            else if (!quizScreen.classList.contains("hidden")) {
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
// --- Init ---
function init() {
    initSetupScreen();
    initQuizListeners();
}
init();
