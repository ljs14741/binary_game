(() => {
  const TOPPINGS = ["salmon", "tuna", "egg", "shrimp"];
  const PENALTIES = [
    "☕ 오늘 커피 당첨!",
    "🍱 점심값 당첨!",
    "💥 인중 딱밤 1대!",
    "🥤 물 한 컵 원샷!",
  ];

  const board = document.getElementById("wasabi-board");
  const stage = document.getElementById("wasabi-stage");
  const fxEl = document.getElementById("wasabi-fx");
  const statusEl = document.getElementById("wasabi-status");
  const resultEl = document.getElementById("wasabi-result");
  const restartBtn = document.getElementById("wasabi-restart");
  const bgmToggle = document.getElementById("wasabi-bgm-toggle");
  const themeLink = document.getElementById("theme-style");
  const plateOpts = document.getElementById("wasabi-plate-opts");
  const setupEl = document.getElementById("wasabi-setup");
  const toastEl = document.getElementById("wasabi-toast");

  const BGM_SRC = "/assets/mugunghwa/bgm.mp3";
  const SFX_SAFE = "/assets/horseRace/jump.mp3";
  const SFX_WASABI = "/assets/horseRace/puddle.mp3";

  const BGM_BASE_VOL = 0.14;
  const SFX_VOL = 1;

  let plateCount = 20;
  let wasabiIndex = 0;
  let remaining = plateCount;
  let locked = false;
  let revealing = false;
  let gameOver = false;
  let plates = [];
  let bgmOn = true;
  let audioUnlocked = false;
  let lastToastKey = "";
  let toastTimer = 0;

  const bgm = new Audio(BGM_SRC);
  bgm.loop = true;
  bgm.volume = BGM_BASE_VOL;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function randBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function pickPenalty() {
    return PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
  }

  function makeSfx(src) {
    const a = new Audio(src);
    a.volume = SFX_VOL;
    return a;
  }

  function playSfx(src) {
    try {
      const sfx = makeSfx(src);
      sfx.play().catch(() => {});
    } catch (e) {
      /* ignore */
    }
  }

  async function unlockAndPlayBgm() {
    audioUnlocked = true;
    if (!bgmOn) return;
    try {
      await bgm.play();
      applyBgmPressure();
    } catch (e) {
      /* autoplay blocked until next gesture */
    }
  }

  function syncThemeAttr() {
    const href = themeLink?.getAttribute("href") || "";
    const theme = href.includes("dark") ? "dark" : "light";
    document.body.setAttribute("data-theme", theme);
  }

  function tensionLevel() {
    if (remaining <= 1) return 3;
    const ratio = remaining / plateCount;
    if (ratio <= 0.2) return 3;
    if (ratio <= 0.4) return 2;
    if (ratio <= 0.65) return 1;
    return 0;
  }

  /** Cleared 1/3 → mild speedup; cleared 1/2 → faster. BGM stays quiet. */
  function applyBgmPressure() {
    if (!bgmOn || !audioUnlocked) return;
    bgm.volume = BGM_BASE_VOL;
    const clearedRatio = (plateCount - remaining) / plateCount;
    let rate = 1;
    if (clearedRatio >= 0.5) rate = 1.18;
    else if (clearedRatio >= 1 / 3) rate = 1.1;
    try {
      bgm.playbackRate = rate;
    } catch (e) {
      /* ignore unsupported rate */
    }
  }

  function applyAlertPulse() {
    if (!stage) return;
    const remRatio = remaining / plateCount;
    // red warning from start; faster from half remaining
    stage.dataset.alert = remRatio <= 0.5 ? "fast" : "on";
  }

  function applyTension() {
    const level = tensionLevel();
    if (stage) stage.dataset.tension = String(level);
    applyAlertPulse();
    applyBgmPressure();
  }

  function hintForRemaining() {
    const level = tensionLevel();
    if (remaining === 1) return "· 마지막 접시… 집으면 벌칙!";
    if (level >= 3) return "· 심장이 뛴다…";
    if (level >= 2) return "· 위험해진다";
    if (level >= 1) return "· 슬슬 긴장";
    return "· 와사비를 피하세요";
  }

  function flashToast(hint) {
    if (!toastEl) return;
    const text = String(hint || "").replace(/^·\s*/, "").trim();
    if (!text || text === "와사비를 피하세요") return;
    if (text === lastToastKey) return;
    lastToastKey = text;
    toastEl.textContent = text;
    toastEl.classList.remove("is-show");
    void toastEl.offsetWidth;
    toastEl.classList.add("is-show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.classList.remove("is-show");
    }, 900);
  }

  function setStatus(count, hint) {
    statusEl.innerHTML = `
      <span>남은 접시</span>
      <span class="bw-wasabi-count">${count}</span>
      <span>${hint || ""}</span>
    `;
    flashToast(hint);
  }

  function hideResult() {
    resultEl.className = "bw-wasabi-overlay";
    const title = document.getElementById("wasabi-result-title");
    const detail = document.getElementById("wasabi-result-detail");
    if (title) title.textContent = "";
    if (detail) detail.textContent = "";
  }

  function showResult(kind, title, detail) {
    resultEl.className = `bw-wasabi-overlay is-visible is-${kind}`;
    const titleEl = document.getElementById("wasabi-result-title");
    const detailEl = document.getElementById("wasabi-result-detail");
    if (titleEl) titleEl.textContent = title;
    if (detailEl) detailEl.textContent = detail;
  }

  function pulseFx(kind, durationMs) {
    if (!fxEl) return;
    fxEl.className = `bw-wasabi-fx is-${kind}`;
    void fxEl.offsetWidth;
    fxEl.classList.add("is-active");
    window.setTimeout(() => {
      fxEl.classList.remove("is-active");
    }, durationMs || 700);
  }

  function shakeStage(intensity) {
    if (!stage) return;
    stage.classList.remove("is-shaking", "is-shaking-hard");
    void stage.offsetWidth;
    stage.classList.add(intensity >= 2 ? "is-shaking-hard" : "is-shaking");
    window.setTimeout(() => {
      stage.classList.remove("is-shaking", "is-shaking-hard");
    }, intensity >= 2 ? 780 : 620);
  }

  function nigiriHtml(variant) {
    const toppingClass =
      variant === "salmon"
        ? "bw-wasabi-topping"
        : `bw-wasabi-topping bw-wasabi-topping--${variant}`;
    return `
      <span class="bw-wasabi-nigiri" aria-hidden="true">
        <span class="${toppingClass}"></span>
        <span class="bw-wasabi-rice"></span>
        <span class="bw-wasabi-nori"></span>
      </span>
      <span class="bw-wasabi-blob" aria-hidden="true"></span>
      <span class="bw-wasabi-splat" aria-hidden="true"></span>
    `;
  }

  function colsForCount(count) {
    if (count <= 20) return 5;
    return 6;
  }

  function shuffleWasabi() {
    wasabiIndex = Math.floor(Math.random() * plateCount);
  }

  function setSetupEnabled(enabled) {
    if (!setupEl) return;
    setupEl.classList.toggle("is-locked", !enabled);
    setupEl.querySelectorAll("button").forEach((el) => {
      el.disabled = !enabled;
    });
  }

  function buildBoard() {
    board.innerHTML = "";
    plates = [];
    remaining = plateCount;
    locked = false;
    revealing = false;
    gameOver = false;
    lastToastKey = "";
    if (toastEl) toastEl.classList.remove("is-show");
    hideResult();
    shuffleWasabi();
    setSetupEnabled(true);

    if (bgmOn) {
      bgm.volume = BGM_BASE_VOL;
      try {
        bgm.playbackRate = 1;
      } catch (e) {
        /* ignore */
      }
    }

    const cols = colsForCount(plateCount);
    board.dataset.cols = String(cols);
    board.style.setProperty("--ws-cols", String(cols));

    for (let i = 0; i < plateCount; i += 1) {
      const variant = TOPPINGS[i % TOPPINGS.length];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bw-wasabi-plate";
      btn.dataset.variant = variant;
      btn.setAttribute("aria-label", `초밥 접시 ${i + 1}`);
      btn.innerHTML = nigiriHtml(variant);
      btn.addEventListener("click", () => onPick(i));
      board.appendChild(btn);
      plates.push(btn);
    }

    applyTension();
    setStatus(remaining, hintForRemaining());
  }

  function freezeBoard() {
    locked = true;
    gameOver = true;
    plates.forEach((p) => {
      p.disabled = true;
    });
    setSetupEnabled(true);
  }

  /** Varied suspense hold — higher tension = longer, jitterier waits */
  function revealDelayMs() {
    const level = tensionLevel();
    const ranges = [
      [360, 480],
      [520, 720],
      [700, 980],
      [900, 1280],
    ];
    const [lo, hi] = ranges[level];
    let ms = randBetween(lo, hi);
    // rare extra hold at high tension (heart stops)
    if (level >= 2 && Math.random() < 0.28) ms += randBetween(220, 420);
    if (level >= 3 && Math.random() < 0.18) ms += randBetween(280, 520);
    return Math.round(ms);
  }

  function shouldFakeScare() {
    const level = tensionLevel();
    const chances = [0.1, 0.22, 0.4, 0.58];
    return Math.random() < chances[level];
  }

  function fakeScareMs() {
    const level = tensionLevel();
    return Math.round([320, 420, 520, 640][level] + randBetween(0, 80));
  }

  async function onPick(index) {
    if (locked || revealing || gameOver) return;
    const plate = plates[index];
    if (!plate || plate.classList.contains("is-opened")) return;

    unlockAndPlayBgm();
    setSetupEnabled(false);
    revealing = true;
    locked = true;

    const levelAtPick = tensionLevel();
    plate.disabled = true;
    plate.classList.add("is-revealing");
    if (levelAtPick >= 2) plate.classList.add("is-revealing-tense");

    await sleep(revealDelayMs());

    const isWasabi = index === wasabiIndex;

    if (!isWasabi && shouldFakeScare()) {
      const scareLevel = Math.min(3, levelAtPick + (Math.random() < 0.35 ? 1 : 0));
      const scareMs = fakeScareMs();
      plate.classList.add("is-fake-scare");
      if (scareLevel >= 2) plate.classList.add("is-fake-scare-hard");
      pulseFx(scareLevel >= 2 ? "scare-hard" : "scare", scareMs);
      if (scareLevel >= 2) shakeStage(1);
      await sleep(scareMs);
      plate.classList.remove("is-fake-scare", "is-fake-scare-hard");
    }

    plate.classList.remove("is-revealing", "is-revealing-tense");
    plate.classList.add("is-opened");

    if (isWasabi) {
      plate.classList.add("is-wasabi", "is-hit");
      playSfx(SFX_WASABI);
      pulseFx("boom", 900);
      shakeStage(3);

      await sleep(820);

      freezeBoard();
      setStatus(0, "");
      showResult(
        "lose",
        pickPenalty(),
        "벌칙 당첨! 와사비 초밥을 집었습니다."
      );
      revealing = false;
      return;
    }

    playSfx(SFX_SAFE);
    plate.classList.add("is-safe", "is-relief");
    window.setTimeout(() => plate.classList.remove("is-relief"), 450);

    remaining -= 1;
    applyTension();
    setStatus(remaining, hintForRemaining());

    revealing = false;
    locked = false;
  }

  if (plateOpts) {
    plateOpts.addEventListener("click", (e) => {
      const btn = e.target.closest(".bw-wasabi-seg-btn");
      if (!btn || setupEl?.classList.contains("is-locked")) return;
      const value = Number(btn.dataset.plates);
      if (!Number.isFinite(value)) return;
      plateOpts.querySelectorAll(".bw-wasabi-seg-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      plateCount = value;
      buildBoard();
    });
  }

  restartBtn.addEventListener("click", () => {
    unlockAndPlayBgm();
    buildBoard();
  });

  if (bgmToggle) {
    bgmToggle.addEventListener("click", async () => {
      bgmOn = !bgmOn;
      bgmToggle.classList.toggle("is-off", !bgmOn);
      bgmToggle.textContent = bgmOn ? "BGM 켜짐" : "BGM 꺼짐";
      bgmToggle.setAttribute("aria-pressed", String(bgmOn));
      if (bgmOn) {
        await unlockAndPlayBgm();
      } else {
        bgm.pause();
        try {
          bgm.playbackRate = 1;
        } catch (e) {
          /* ignore */
        }
        bgm.volume = BGM_BASE_VOL;
      }
    });
  }

  document.addEventListener("pointerdown", () => {
    if (!audioUnlocked && bgmOn) unlockAndPlayBgm();
  }, { once: true });

  const themeObserver = new MutationObserver(syncThemeAttr);
  if (themeLink) {
    themeObserver.observe(themeLink, { attributes: true, attributeFilter: ["href"] });
  }
  syncThemeAttr();
  buildBoard();

  window.shareTwitter = function shareTwitter() {
    const sendText = "와사비 룰렛 - 커피내기·점심내기·벌칙뽑기";
    const sendUrl = "https://game.binaryworld.kr/wasabi";
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(sendText)}&url=${encodeURIComponent(sendUrl)}`
    );
  };

  window.shareFacebook = function shareFacebook() {
    const sendUrl = "https://game.binaryworld.kr/wasabi";
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(sendUrl)}`);
  };

  window.setupKakaoShareButton = function setupKakaoShareButton() {
    if (!window.Kakao || !document.querySelector("#btnKakao")) return;
    if (!Kakao.isInitialized()) {
      Kakao.init("8b68c737be6b8e9a8007c61ee6f9b8da");
    }
    Kakao.Share.createDefaultButton({
      container: "#btnKakao",
      objectType: "feed",
      content: {
        title: "와사비 룰렛",
        description: "커피내기·점심내기·벌칙뽑기! 초밥 접시 중 와사비를 피하세요.",
        imageUrl: "https://game.binaryworld.kr/img/wasabi.jpg",
        link: {
          mobileWebUrl: "https://game.binaryworld.kr/wasabi",
          webUrl: "https://game.binaryworld.kr/wasabi",
        },
      },
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (typeof window.setupKakaoShareButton === "function") {
        window.setupKakaoShareButton();
      }
    });
  } else if (typeof window.setupKakaoShareButton === "function") {
    window.setupKakaoShareButton();
  }
})();
