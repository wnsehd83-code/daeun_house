const VIEWS = {
  household: {
    src: "household.html",
    title: "다은이네 가계현황 대시보드",
  },
  schedule: {
    src: "schedule.html",
    title: "다은이네 일정공유",
  },
};

const frame = document.getElementById("viewFrame");
const navItems = document.querySelectorAll(".nav-item[data-view]");
let deferredInstallPrompt = null;

function switchView(viewId) {
  const view = VIEWS[viewId];
  if (!view) return;

  navItems.forEach((btn) => {
    const active = btn.dataset.view === viewId;
    btn.classList.toggle("nav-item--active", active);
    btn.setAttribute("aria-current", active ? "page" : null);
  });

  frame.src = view.src;
  frame.title = view.title;
  document.title = view.title + " · 다은이네";
}

navItems.forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

function initPwa() {
  if (!("serviceWorker" in navigator)) return;

  const isSecure =
    location.protocol === "https:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";

  if (isSecure) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    document.getElementById("installPwa").hidden = false;
  });

  document.getElementById("installPwa")?.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      document.getElementById("installPwa").hidden = true;
      return;
    }
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      alert("Safari 공유 → 홈 화면에 추가로 설치할 수 있습니다.");
      return;
    }
    if (!isSecure) {
      alert("PWA 설치는 localhost 또는 HTTPS에서 가능합니다.");
      return;
    }
    alert("브라우저 메뉴에서 '앱 설치'를 선택해 주세요.");
  });
}

initPwa();
