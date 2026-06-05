const STORAGE_KEY = "daeeun-schedule-v1";

const MEMBERS = {
  dad: { name: "아빠", color: "#1d3557" },
  mom: { name: "엄마", color: "#7b2cbf" },
  daeun: { name: "다은이", color: "#e07a5f" },
  family: { name: "가족 전체", color: "#2d6a4f" },
};

let events = loadEvents();
let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();
let selectedDate = null;
let editingId = null;

function loadEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEvents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function toDateKey(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m: m - 1, d };
}

function formatDateTitle(key) {
  const { y, m, d } = parseDateKey(key);
  const dt = new Date(y, m, d);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${y}년 ${m + 1}월 ${d}일 (${weekdays[dt.getDay()]})`;
}

function formatMonthTitle(y, m) {
  return `${y}년 ${m + 1}월`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function eventsOnDate(dateKey) {
  return events
    .filter((e) => e.date === dateKey)
    .sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });
}

function renderCalendar() {
  document.getElementById("calTitle").textContent = formatMonthTitle(viewYear, viewMonth);

  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";

  const first = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startPad = first.getDay();
  const todayKey = toDateKey(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate()
  );

  for (let i = 0; i < startPad; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-day cal-day--empty";
    empty.setAttribute("aria-hidden", "true");
    grid.appendChild(empty);
  }

  for (let d = 1; d <= lastDay; d++) {
    const dateKey = toDateKey(viewYear, viewMonth, d);
    const dayEvents = eventsOnDate(dateKey);
    const dt = new Date(viewYear, viewMonth, d);
    const dow = dt.getDay();

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cal-day";
    btn.setAttribute("role", "gridcell");
    btn.dataset.date = dateKey;
    if (dateKey === todayKey) btn.classList.add("cal-day--today");
    if (dow === 0) btn.classList.add("cal-day--sun");
    if (dow === 6) btn.classList.add("cal-day--sat");

    const holidayName = getKrHoliday(dateKey);
    if (holidayName) {
      btn.classList.add("cal-day--holiday");
      btn.title = holidayName;
    }

    const dots = document.createElement("div");
    dots.className = "cal-day__dots";
    const seenMembers = new Set();
    dayEvents.forEach((ev) => {
      if (seenMembers.has(ev.member)) return;
      seenMembers.add(ev.member);
      const dot = document.createElement("span");
      dot.className = `cal-dot cal-dot--${ev.member}`;
      dots.appendChild(dot);
    });

    const holidayTag = holidayName
      ? `<span class="cal-day__holiday">${escapeHtml(getKrHolidayShort(holidayName))}</span>`
      : "";

    const preview =
      dayEvents.length > 0
        ? `<span class="cal-day__preview">${escapeHtml(dayEvents[0].title)}${dayEvents.length > 1 ? ` +${dayEvents.length - 1}` : ""}</span>`
        : "";

    btn.innerHTML = `<span class="cal-day__num">${d}</span>${holidayTag}${preview}`;
    btn.appendChild(dots);
    btn.addEventListener("click", () => openDayModal(dateKey));
    grid.appendChild(btn);
  }
}

function openDayModal(dateKey) {
  selectedDate = dateKey;
  editingId = null;
  const holidayName = getKrHoliday(dateKey);
  const title = formatDateTitle(dateKey);
  document.getElementById("modalDateTitle").textContent = holidayName
    ? `${title} · ${holidayName}`
    : title;
  resetForm();
  renderEventList();
  document.getElementById("dayModal").showModal();
}

function renderEventList() {
  const list = document.getElementById("eventList");
  const dayEvents = eventsOnDate(selectedDate);
  const holidayName = getKrHoliday(selectedDate);
  const holidayBanner = holidayName
    ? `<li class="holiday-banner" aria-label="공휴일">${escapeHtml(holidayName)}</li>`
    : "";

  list.innerHTML = holidayBanner + dayEvents
    .map((ev) => {
      const member = MEMBERS[ev.member] || MEMBERS.family;
      const time = ev.time ? ev.time.slice(0, 5) : "종일";
      return `
      <li>
        <button type="button" class="event-item" data-edit-id="${ev.id}"
          style="--member-color:${member.color}">
          <span class="event-item__time">${time}</span>
          <div class="event-item__body">
            <div class="event-item__title">${escapeHtml(ev.title)}</div>
            <div class="event-item__meta">${member.name}${ev.memo ? " · " + escapeHtml(ev.memo) : ""}</div>
          </div>
        </button>
      </li>`;
    })
    .join("");

  list.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => startEdit(btn.dataset.editId));
  });
}

function resetForm() {
  editingId = null;
  document.getElementById("eventId").value = "";
  document.getElementById("eventTitle").value = "";
  document.getElementById("eventTime").value = "";
  document.getElementById("eventMember").value = "family";
  document.getElementById("eventMemo").value = "";
  document.getElementById("formTitle").textContent = "일정 추가";
  document.getElementById("deleteEvent").hidden = true;
  document.getElementById("cancelEdit").hidden = true;
  document.getElementById("eventFormSection").hidden = false;
}

function startEdit(id) {
  const ev = events.find((e) => e.id === id);
  if (!ev) return;
  editingId = id;
  document.getElementById("eventId").value = id;
  document.getElementById("eventTitle").value = ev.title;
  document.getElementById("eventTime").value = ev.time || "";
  document.getElementById("eventMember").value = ev.member;
  document.getElementById("eventMemo").value = ev.memo || "";
  document.getElementById("formTitle").textContent = "일정 수정";
  document.getElementById("deleteEvent").hidden = false;
  document.getElementById("cancelEdit").hidden = false;
  document.getElementById("eventFormSection").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function saveEventFromForm() {
  const title = document.getElementById("eventTitle").value.trim();
  if (!title) {
    document.getElementById("eventTitle").focus();
    return;
  }

  const payload = {
    id: editingId || `ev-${Date.now()}`,
    date: selectedDate,
    title,
    time: document.getElementById("eventTime").value || "",
    member: document.getElementById("eventMember").value,
    memo: document.getElementById("eventMemo").value.trim(),
  };

  const idx = events.findIndex((e) => e.id === payload.id);
  if (idx >= 0) events[idx] = payload;
  else events.push(payload);

  saveEvents();
  resetForm();
  renderEventList();
  renderCalendar();
}

function deleteCurrentEvent() {
  if (!editingId) return;
  if (!confirm("이 일정을 삭제할까요?")) return;
  events = events.filter((e) => e.id !== editingId);
  saveEvents();
  resetForm();
  renderEventList();
  renderCalendar();
}

document.getElementById("calPrev").addEventListener("click", () => {
  viewMonth--;
  if (viewMonth < 0) {
    viewMonth = 11;
    viewYear--;
  }
  renderCalendar();
});

document.getElementById("calNext").addEventListener("click", () => {
  viewMonth++;
  if (viewMonth > 11) {
    viewMonth = 0;
    viewYear++;
  }
  renderCalendar();
});

document.getElementById("calToday").addEventListener("click", () => {
  const now = new Date();
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();
  renderCalendar();
});

document.getElementById("closeModal").addEventListener("click", () => {
  document.getElementById("dayModal").close();
});

document.getElementById("addNewEvent").addEventListener("click", () => {
  resetForm();
  document.getElementById("eventTitle").focus();
});

document.getElementById("cancelEdit").addEventListener("click", resetForm);

document.getElementById("saveEvent").addEventListener("click", (e) => {
  e.preventDefault();
  saveEventFromForm();
});

document.getElementById("deleteEvent").addEventListener("click", deleteCurrentEvent);

document.getElementById("dayForm").addEventListener("submit", (e) => {
  e.preventDefault();
  saveEventFromForm();
});

renderCalendar();
