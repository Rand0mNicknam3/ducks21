/* ========================================================================
   Охота на уточек — логика
   ------------------------------------------------------------------------
   Что здесь происходит:
   • динамически создаём N AR-целей (по числу картинок в targets.mind);
   • при наведении на стикер показываем 3D-уточку;
   • тап по экрану ловит видимую уточку (надёжнее, чем рейкаст по 3D на слабых телефонах);
   • каждая уточка ловится один раз (учёт в localStorage, переживает перезагрузку);
   • опционально — общая таблица лидеров через Firebase (по умолчанию выключена).
   ======================================================================== */

const CONFIG = {
  // === ГЛАВНОЕ: число должно совпадать с числом картинок, скомпилированных в targets.mind ===
  numTargets: 3,

  // Внешний вид уточки на стикере (можно подстроить под себя):
  duckScale: 0.4,   // модель ~165 ед. шириной → 0.005 ≈ размер со стикер
  duckOffsetY: 0.1,  // подъём над центром стикера
  duckOffsetZ: 0.3,  // «выезд» уточки в сторону зрителя от стены
  bobAmplitude: 0.08, // насколько качается вверх-вниз
  spin: true,         // медленное вращение (чтобы не зависеть от того, куда смотрит клюв)

  // === Таблица лидеров (необязательно). Подробности — в README, раздел «Таблица лидеров». ===
  leaderboard: {
    enabled: false,                 // ← поставь true, вставь firebaseConfig ниже
    firebaseVersion: "10.12.2",
    firebaseConfig: {
      // apiKey: "...",
      // authDomain: "...",
      // databaseURL: "https://ВАШ-ПРОЕКТ-default-rtdb.firebaseio.com",
      // projectId: "...",
    },
    eventId: "school21-ducks",      // ключ мероприятия (можно менять между ивентами)
  },
};

/* ----------------------------- Состояние ----------------------------- */
const LS_CAUGHT = "duckhunt:caught";
const LS_NAME   = "duckhunt:name";

let caught = loadCaught();          // Set<number> пойманных индексов
let playerName = localStorage.getItem(LS_NAME) || "";
let currentVisible = null;          // индекс уточки сейчас в кадре и доступной для ловли
let arStarted = false;

function loadCaught() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_CAUGHT) || "[]")); }
  catch (_) { return new Set(); }
}
function saveCaught() {
  localStorage.setItem(LS_CAUGHT, JSON.stringify([...caught]));
}

/* ----------------------------- Хелперы DOM ----------------------------- */
const $ = (id) => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("is-active"));
  if (id) $(id).classList.add("is-active");
  // пауза/возобновление AR, чтобы не греть процессор под открытой модалкой
  const inModal = !!id;
  if (arStarted) inModal ? pauseAR() : resumeAR();
}

function updateHUD() {
  $("count-now").textContent = caught.size;
  $("count-total").textContent = CONFIG.numTargets;
}

function addLog(text) {
  const log = $("hud-log");
  const t = new Date();
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  const line = document.createElement("div");
  line.textContent = `> ${hh}:${mm} ${text}`;
  log.prepend(line);
  while (log.children.length > 3) log.removeChild(log.lastChild);
}

function setHint(state) {
  const hint = $("hint");
  const text = $("hint-text");
  hint.dataset.state = state;
  if (state === "scan") text.textContent = "Наведи камеру на стикер с уточкой";
  if (state === "catch") text.textContent = "🦆 Уточка! Тапни, чтобы поймать";
  if (state === "already") text.textContent = "Эту уточку ты уже поймал ✓";
}

function showPop() {
  const pop = $("pop");
  pop.classList.remove("show");
  void pop.offsetWidth;          // перезапуск анимации
  pop.classList.add("show");
}

/* -------------------- Построение AR-целей (уточек) -------------------- */
function buildTargets() {
  const scene = $("scene");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  for (let i = 0; i < CONFIG.numTargets; i++) {
    const target = document.createElement("a-entity");
    target.setAttribute("mindar-image-target", `targetIndex: ${i}`);

    const duck = document.createElement("a-gltf-model");
    duck.id = `duck-${i}`;
    duck.setAttribute("src", "#duckModel");
    duck.setAttribute("visible", "false");
    duck.setAttribute("position", `0 ${CONFIG.duckOffsetY} ${CONFIG.duckOffsetZ}`);
    duck.setAttribute("scale", `${CONFIG.duckScale} ${CONFIG.duckScale} ${CONFIG.duckScale}`);

    if (!reduceMotion) {
      const yTo = CONFIG.duckOffsetY + CONFIG.bobAmplitude;
      duck.setAttribute(
        "animation__bob",
        `property: position; to: 0 ${yTo} ${CONFIG.duckOffsetZ}; dir: alternate; dur: 1200; loop: true; easing: easeInOutSine`
      );
      if (CONFIG.spin) {
        duck.setAttribute(
          "animation__spin",
          "property: rotation; to: 0 360 0; loop: true; dur: 4500; easing: linear"
        );
      }
    }

    target.appendChild(duck);
    scene.appendChild(target);

    // Появление / исчезновение стикера в кадре
    target.addEventListener("targetFound", () => onTargetFound(i));
    target.addEventListener("targetLost", () => onTargetLost(i));
  }
  updateHUD();
}

function onTargetFound(i) {
  const duck = $(`duck-${i}`);
  if (caught.has(i)) {
    if (duck) duck.setAttribute("visible", "false");
    currentVisible = null;
    setHint("already");
  } else {
    if (duck) {
      duck.setAttribute("visible", "true");
      duck.setAttribute("scale", `${CONFIG.duckScale} ${CONFIG.duckScale} ${CONFIG.duckScale}`);
    }
    currentVisible = i;
    setHint("catch");
  }
}

function onTargetLost(i) {
  if (currentVisible === i) currentVisible = null;
  const duck = $(`duck-${i}`);
  if (duck) duck.setAttribute("visible", "false");
  setHint("scan");
}

/* ------------------------------ Поимка ------------------------------- */
function catchDuck() {
  if (currentVisible === null) return;     // нет видимой уточки — тап вхолостую
  const i = currentVisible;
  if (caught.has(i)) return;               // защита от повторной ловли

  caught.add(i);
  saveCaught();
  currentVisible = null;                   // сразу запрещаем повторный тап

  // анимация исчезновения + прячем модель
  const duck = $(`duck-${i}`);
  if (duck) {
    duck.removeAttribute("animation__bob");
    duck.setAttribute("animation__catch", "property: scale; to: 0 0 0; dur: 280; easing: easeInBack");
    setTimeout(() => { if (duck) duck.setAttribute("visible", "false"); }, 300);
  }

  showPop();
  addLog(`поймал уточку #${i + 1}`);
  setHint("scan");
  updateHUD();
  if (navigator.vibrate) navigator.vibrate(40);

  submitScore();                            // отправит в лидерборд, если включён

  if (caught.size >= CONFIG.numTargets) {
    setTimeout(showDone, 600);              // все пойманы — поздравляем
  }
}

/* ------------------- Запуск/пауза дополненной реальности ------------------- */
async function startAR() {
  if (isInAppBrowser()) { showError("inapp"); return; }

  // 1) Проверяем, что targets.mind вообще на месте
  try {
    const r = await fetch("./assets/targets.mind", { method: "HEAD", cache: "no-store" });
    if (!r.ok) { showError("notargets"); return; }
  } catch (_) { showError("notargets"); return; }

  // 2) Проверяем доступ к камере заранее — чтобы дать понятную ошибку
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    probe.getTracks().forEach((t) => t.stop());
  } catch (err) {
    showError(err && err.name === "NotFoundError" ? "nocamera" : "camera");
    return;
  }

  // 3) Запускаем MindAR
  const scene = $("scene");
  const sys = scene.systems && scene.systems["mindar-image-system"];
  if (!sys) { showError("init"); return; }
  try {
    await sys.start();
    arStarted = true;
    document.body.classList.add("playing");
    showScreen(null);
    setHint("scan");
  } catch (_) {
    showError("camera");
  }
}

function pauseAR() {
  const sys = $("scene").systems && $("scene").systems["mindar-image-system"];
  try { if (sys && sys.pause) sys.pause(true); } catch (_) {}
}
function resumeAR() {
  const sys = $("scene").systems && $("scene").systems["mindar-image-system"];
  try { if (sys && sys.unpause) sys.unpause(); } catch (_) {}
}

/* --------------- Детект встроенного браузера (камера часто блокируется) --------------- */
function isInAppBrowser() {
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|Instagram|Line|Twitter|TikTok|Snapchat|Pinterest|MicroMessenger|VKClient|OK\b|YandexSearch/i.test(ua);
}

/* ------------------------------ Экраны ------------------------------- */
function renderCollection() {
  const grid = $("collection-grid");
  grid.innerHTML = "";
  for (let i = 0; i < CONFIG.numTargets; i++) {
    const cell = document.createElement("div");
    const got = caught.has(i);
    cell.className = "cell" + (got ? " got" : "");
    cell.innerHTML =
      `<span class="idx">#${i + 1}</span>` +
      `<span class="${got ? "" : "lock"}">🦆</span>` +
      (got ? `<span class="got-check">ok</span>` : "");
    grid.appendChild(cell);
  }
  $("collection-summary").textContent = `Поймано ${caught.size} из ${CONFIG.numTargets}`;
  showScreen("screen-collection");
}

function showDone() {
  $("done-count").textContent = caught.size;
  $("done-total").textContent = CONFIG.numTargets;
  $("done-name").textContent = playerName ? `игрок: ${playerName}` : "";
  if (caught.size >= CONFIG.numTargets) {
    $("done-title").textContent = "Все уточки твои!";
    $("done-text").textContent = "Ты собрал полный набор. Покажи этот экран организатору.";
  } else {
    $("done-title").textContent = "Промежуточный итог";
    $("done-text").textContent = "Можешь продолжить охоту или показать результат организатору.";
  }
  if (CONFIG.leaderboard.enabled) $("btn-board-from-done").hidden = false;
  showScreen("screen-done");
}

const ERRORS = {
  inapp: {
    title: "Открой в браузере",
    text: "Похоже, ссылка открыта во встроенном браузере приложения — он не даёт доступ к камере. Нажми «…» или «Поделиться» и выбери «Открыть в Safari/Chrome».",
    retry: "Я открыл в браузере",
    anyway: true,
  },
  camera: {
    title: "Нет доступа к камере",
    text: "Разреши доступ к камере для этого сайта в настройках браузера и попробуй снова.",
    retry: "Попробовать снова",
  },
  nocamera: {
    title: "Камера не найдена",
    text: "На устройстве не обнаружена камера. Открой игру на смартфоне с камерой.",
    retry: "Попробовать снова",
  },
  notargets: {
    title: "Нет файла целей",
    text: "Не найден assets/targets.mind. Скомпилируй стикеры в MindAR Image Compiler и положи файл в папку assets (см. README).",
    retry: "Попробовать снова",
  },
  init: {
    title: "Не удалось запустить AR",
    text: "Библиотека дополненной реальности не загрузилась. Проверь соединение и обнови страницу.",
    retry: "Обновить",
  },
};

function showError(kind) {
  const e = ERRORS[kind] || ERRORS.init;
  $("error-title").textContent = e.title;
  $("error-text").textContent = e.text;
  $("btn-error-retry").textContent = e.retry || "Попробовать снова";
  $("btn-error-anyway").hidden = !e.anyway;
  document.body.classList.remove("playing");
  showScreen("screen-error");
}

/* ============================ ТАБЛИЦА ЛИДЕРОВ (опц.) ============================ */
let fbDb = null;
let fbReady = null;

function initLeaderboard() {
  if (!CONFIG.leaderboard.enabled) return null;
  if (fbReady) return fbReady;
  const v = CONFIG.leaderboard.firebaseVersion;
  fbReady = (async () => {
    await loadScript(`https://www.gstatic.com/firebasejs/${v}/firebase-app-compat.js`);
    await loadScript(`https://www.gstatic.com/firebasejs/${v}/firebase-database-compat.js`);
    // eslint-disable-next-line no-undef
    firebase.initializeApp(CONFIG.leaderboard.firebaseConfig);
    // eslint-disable-next-line no-undef
    fbDb = firebase.database();
  })();
  return fbReady;
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

function playerKey() {
  // стабильный id игрока на этом устройстве
  let k = localStorage.getItem("duckhunt:pid");
  if (!k) { k = "p" + Math.random().toString(36).slice(2, 10); localStorage.setItem("duckhunt:pid", k); }
  return k;
}

async function submitScore() {
  if (!CONFIG.leaderboard.enabled) return;
  try {
    await initLeaderboard();
    const ev = CONFIG.leaderboard.eventId;
    await fbDb.ref(`scores/${ev}/${playerKey()}`).set({
      name: playerName || "аноним",
      count: caught.size,
      ts: Date.now(),
    });
  } catch (e) { /* молча: оффлайн не должен ломать игру */ }
}

async function renderLeaderboard() {
  showScreen("screen-board");
  const list = $("board-list");
  list.innerHTML = `<li class="board-empty">загрузка…</li>`;
  try {
    await initLeaderboard();
    const ev = CONFIG.leaderboard.eventId;
    const snap = await fbDb.ref(`scores/${ev}`).get();
    const rows = [];
    snap.forEach((c) => { rows.push({ key: c.key, ...c.val() }); });
    rows.sort((a, b) => b.count - a.count || a.ts - b.ts);
    const me = playerKey();
    list.innerHTML = "";
    if (!rows.length) { list.innerHTML = `<li class="board-empty">пока пусто — лови первым</li>`; return; }
    rows.slice(0, 20).forEach((r, idx) => {
      const li = document.createElement("li");
      if (r.key === me) li.classList.add("me");
      li.innerHTML =
        `<span class="rank">${idx + 1}</span>` +
        `<span class="who">${escapeHtml(r.name)}</span>` +
        `<span class="score">${r.count}</span>`;
      list.appendChild(li);
    });
  } catch (e) {
    list.innerHTML = `<li class="board-empty">не удалось загрузить</li>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ------------------------------ Привязки ------------------------------ */
function wireUI() {
  // имя из прошлой сессии
  if (playerName) $("name-input").value = playerName;

  $("btn-start").addEventListener("click", () => {
    playerName = $("name-input").value.trim().slice(0, 24);
    localStorage.setItem(LS_NAME, playerName);
    startAR();
  });

  // тап по экрану ловит видимую уточку (pointerdown — мгновенно)
  $("tap-catch").addEventListener("pointerdown", catchDuck);

  $("btn-collection").addEventListener("click", renderCollection);
  $("btn-finish").addEventListener("click", showDone);
  $("btn-back-collection").addEventListener("click", () => showScreen(null));
  $("btn-resume").addEventListener("click", () => showScreen(null));
  $("btn-back-board").addEventListener("click", () => showScreen(null));
  $("btn-board-from-done").addEventListener("click", renderLeaderboard);

  $("btn-error-retry").addEventListener("click", startAR);
  $("btn-error-anyway").addEventListener("click", () => {
    // пользователь настаивает, что он в обычном браузере — пробуем камеру напрямую
    showScreen(null);
    proceedAfterInApp();
  });

  // показать кнопку лидерборда на старте незачем, но даём доступ через «Готово»
  if (CONFIG.leaderboard.enabled) initLeaderboard();
}

async function proceedAfterInApp() {
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    probe.getTracks().forEach((t) => t.stop());
  } catch (err) {
    showError(err && err.name === "NotFoundError" ? "nocamera" : "camera");
    return;
  }
  const sys = $("scene").systems && $("scene").systems["mindar-image-system"];
  if (!sys) { showError("init"); return; }
  try { await sys.start(); arStarted = true; document.body.classList.add("playing"); showScreen(null); setHint("scan"); }
  catch (_) { showError("camera"); }
}

/* ------------------------------- Старт -------------------------------- */
function init() {
  buildTargets();
  wireUI();
}

const sceneEl = $("scene");
if (sceneEl.hasLoaded) init();
else sceneEl.addEventListener("loaded", init);
