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

function firebaseDb() {
  return window.daeunFirebase?.db || null;
}

function firebaseTimestamp() {
  return window.firebase?.database?.ServerValue?.TIMESTAMP || Date.now();
}

function normalizeEvents(data) {
  return Object.entries(data || {})
    .map(([id, ev]) => ({
      id: ev.id || id,
      date: ev.date || "",
      endDate: ev.endDate || ev.date || "",
      title: ev.title || "",
      time: ev.time || "",
      member: ev.member || "family",
      memo: ev.memo || "",
    }))
    .filter((ev) => ev.date && ev.title);
}

function eventsToFirebaseData() {
  return events.reduce((acc, ev) => {
    acc[ev.id] = {
      date: ev.date,
      endDate: ev.endDate || ev.date,
      title: ev.title,
      time: ev.time || "",
      member: ev.member || "family",
      memo: ev.memo || "",
      updatedAt: firebaseTimestamp(),
    };
    return acc;
  }, {});
}

function loadEvents() {
  return [];
}

function saveEvents() {
  const db = firebaseDb();
  if (!db) return Promise.resolve();

  return db
    .ref("schedule/events")
    .set(eventsToFirebaseData())
    .catch((err) => {
      console.error(err);
      alert("Firebase 일정 저장에 실패했습니다.");
    });
}

async function loadEventsFromFirebase() {
  const db = firebaseDb();
  if (!db) return;

  try {
    const snapshot = await db.ref("schedule/events").once("value");
    events = normalizeEvents(snapshot.val());
    renderCalendar();
  } catch (err) {
    console.error(err);
    alert("Firebase 일정을 불러오지 못했습니다.");
  }
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

function getEventEndDate(ev) {
  return ev.endDate || ev.date;
}

function eventSpansDate(ev, dateKey) {
  const endDate = getEventEndDate(ev);
  return ev.date <= dateKey && dateKey <= endDate;
}

function isMultiDayEvent(ev) {
  return ev.date !== getEventEndDate(ev);
}

function formatEventRange(ev) {
  const endDate = getEventEndDate(ev);
  if (ev.date === endDate) return ev.date;
  return `${ev.date} ~ ${endDate}`;
}

function eventRangeClass(ev, dateKey, dayOfWeek) {
  const endDate = getEventEndDate(ev);
  if (ev.date === endDate) return "cal-day__event--single";

  const classes = ["cal-day__event--range"];
  if (dateKey === ev.date || dayOfWeek === 0) classes.push("cal-day__event--range-start");
  if (dateKey === endDate || dayOfWeek === 6) classes.push("cal-day__event--range-end");
  if (classes.length === 1) classes.push("cal-day__event--range-middle");
  return classes.join(" ");
}

function eventRangeLabel(ev, dateKey, dayOfWeek) {
  if (ev.date === getEventEndDate(ev) || dateKey === ev.date || dayOfWeek === 0) {
    return escapeHtml(ev.title);
  }
  return "&nbsp;";
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
    .filter((e) => eventSpansDate(e, dateKey))
    .sort((a, b) => {
      const rangeDiff = Number(isMultiDayEvent(b)) - Number(isMultiDayEvent(a));
      if (rangeDiff) return rangeDiff;
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time) || a.date.localeCompare(b.date);
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

    const visibleEvents = dayEvents.slice(0, 1);
    const previews =
      visibleEvents.length > 0
        ? `<div class="cal-day__events">${visibleEvents
            .map((ev) => {
              const member = MEMBERS[ev.member] || MEMBERS.family;
              return `<span class="cal-day__event ${eventRangeClass(ev, dateKey, dow)}" style="--member-color:${member.color}" title="${escapeHtml(ev.title)}">${eventRangeLabel(ev, dateKey, dow)}</span>`;
            })
            .join("")}${dayEvents.length > visibleEvents.length ? `<span class="cal-day__more">+${dayEvents.length - visibleEvents.length}</span>` : ""}</div>`
        : "";

    btn.innerHTML = `<span class="cal-day__num">${d}</span>${holidayTag}${previews}`;
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
      const range = formatEventRange(ev);
      return `
      <li>
        <button type="button" class="event-item" data-edit-id="${ev.id}"
          style="--member-color:${member.color}">
          <span class="event-item__time">${time}</span>
          <div class="event-item__body">
            <div class="event-item__title">${escapeHtml(ev.title)}</div>
            <div class="event-item__meta">${member.name} · ${escapeHtml(range)}${ev.memo ? " · " + escapeHtml(ev.memo) : ""}</div>
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
  document.getElementById("eventEndDate").value = selectedDate;
  document.getElementById("eventEndDate").min = selectedDate;
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
  document.getElementById("eventEndDate").value = getEventEndDate(ev);
  document.getElementById("eventEndDate").min = ev.date;
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

  const existing = events.find((e) => e.id === editingId);
  const startDate = existing?.date || selectedDate;
  const endDate = document.getElementById("eventEndDate").value || startDate;
  if (endDate < startDate) {
    alert("종료일은 시작일보다 빠를 수 없습니다.");
    document.getElementById("eventEndDate").focus();
    return;
  }

  const payload = {
    id: editingId || `ev-${Date.now()}`,
    date: startDate,
    endDate,
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
loadEventsFromFirebase();
