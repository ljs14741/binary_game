(() => {
  const PLATE_COUNT = 20;
  const TOPPINGS = ["salmon", "tuna", "egg", "shrimp"];

  const board = document.getElementById("wasabi-board");
  const statusEl = document.getElementById("wasabi-status");
  const resultEl = document.getElementById("wasabi-result");
  const restartBtn = document.getElementById("wasabi-restart");
  const bgmToggle = document.getElementById("wasabi-bgm-toggle");
  const themeLink = document.getElementById("theme-style");

  const BGM_SRC = "/assets/mugunghwa/bgm.mp3";
  const SFX_SAFE = "/assets/horseRace/jump.mp3";
  const SFX_WASABI = "/assets/horseRace/puddle.mp3";

  let wasabiIndex = 0;
  let remaining = PLATE_COUNT;
  let locked = false;
  let plates = [];
  let bgmOn = true;
  let audioUnlocked = false;

  const bgm = new Audio(BGM_SRC);
  bgm.loop = true;
  bgm.volume = 0.32;

  function makeSfx(src) {
    const a = new Audio(src);
    a.volume = 0.7;
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
    } catch (e) {
      /* autoplay blocked until next gesture */
    }
  }

  function syncThemeAttr() {
    const href = themeLink?.getAttribute("href") || "";
    const theme = href.includes("dark") ? "dark" : "light";
    document.body.setAttribute("data-theme", theme);
  }

  function shuffleWasabi() {
    wasabiIndex = Math.floor(Math.random() * PLATE_COUNT);
  }

  function setStatus(count, hint) {
    statusEl.innerHTML = `
      <span>남은 접시</span>
      <span class="bw-wasabi-count">${count}</span>
      <span>${hint || ""}</span>
    `;
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
    `;
  }

  function buildBoard() {
    board.innerHTML = "";
    plates = [];
    remaining = PLATE_COUNT;
    locked = false;
    hideResult();
    shuffleWasabi();

    for (let i = 0; i < PLATE_COUNT; i += 1) {
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

    setStatus(remaining, "· 와사비를 피하세요");
  }

  function freezeBoard() {
    locked = true;
    plates.forEach((p) => {
      p.disabled = true;
    });
  }

  function onPick(index) {
    if (locked) return;
    const plate = plates[index];
    if (!plate || plate.classList.contains("is-opened")) return;

    unlockAndPlayBgm();

    const isWasabi = index === wasabiIndex;
    plate.classList.add("is-opened");
    plate.disabled = true;

    if (isWasabi) {
      plate.classList.add("is-wasabi");
      playSfx(SFX_WASABI);
      freezeBoard();
      setStatus(0, "");
      showResult(
        "lose",
        "벌칙 당첨!",
        "와사비 초밥을 집었습니다. 커피내기·점심내기 벌칙!"
      );
      return;
    }

    playSfx(SFX_SAFE);
    plate.classList.add("is-safe");
    remaining -= 1;

    if (remaining === 1) {
      setStatus(remaining, "· 마지막 접시… 집으면 벌칙!");
    } else {
      setStatus(remaining, "· 와사비를 피하세요");
    }
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
