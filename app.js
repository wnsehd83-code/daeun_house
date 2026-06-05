const INCOME_MEMBERS = [
  { id: "dad", name: "아빠", role: "고정 월급 + 부가소득", color: "#1d3557", hasFixedSalary: true },
  { id: "mom", name: "엄마", role: "고정 월급 + 부가소득", color: "#7b2cbf", hasFixedSalary: true },
];

const EXPENSE_CATEGORIES = {
  fluid: {
    label: "유동성",
    budgetLabel: "유동성 지출",
    desc: "생활비, 식비, 교통, 의류 등 매월 변동되는 지출",
    color: "#3a86ff",
  },
  investment: {
    label: "투자성",
    budgetLabel: "투자성 지출",
    desc: "적금, 주식, 펀드, 교육·자기계발 투자 등 미래를 위한 지출",
    color: "#8338ec",
  },
  fixed: {
    label: "고정성",
    budgetLabel: "고정성 지출",
    desc: "월세·대출, 보험료, 통신·구독 등 매월 비슷한 금액의 지출",
    color: "#fb5607",
  },
};

const BUDGET_KEYS = ["total", ...Object.keys(EXPENSE_CATEGORIES)];

/** 투자성·고정성: 저장 시 템플릿으로 보관, 새 달에 자동 반영 */
const RECURRING_EXPENSE_CATS = ["investment", "fixed"];

const defaultBudgets = () => ({
  total: 0,
  fluid: 0,
  investment: 0,
  fixed: 0,
  alertsEnabled: true,
});

const defaultRecurringExpenses = () => ({
  investment: [],
  fixed: [],
});

const defaultSettings = () => ({
  baseSalaries: { dad: 0, mom: 0 },
  budgets: defaultBudgets(),
  recurringExpenses: defaultRecurringExpenses(),
});

const defaultMonthData = () => ({
  extraIncome: { dad: [], mom: [] },
  expenses: {
    fluid: [],
    investment: [],
    fixed: [],
  },
});

function loadStore() {
  return { settings: defaultSettings(), months: {} };
}

function saveStore() {
  // 데이터는 현재 열린 화면에서만 유지하고 브라우저 저장소에는 남기지 않습니다.
}

function formatWon(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("ko-KR") + "원";
}

function parseAmount(val) {
  if (typeof val === "number") return val;
  return Number(String(val).replace(/[^\d]/g, "")) || 0;
}

const AMOUNT_INPUT_SELECTOR =
  "[data-base-salary], [data-extra-amount], [data-exp-amount], [data-budget]";

function formatAmountInput(val) {
  const n = parseAmount(val);
  if (!n) return "";
  return n.toLocaleString("ko-KR");
}

function formatAmountField(input) {
  const start = input.selectionStart ?? input.value.length;
  const digitsBefore = input.value.slice(0, start).replace(/[^\d]/g, "").length;
  const digits = input.value.replace(/[^\d]/g, "");
  input.value = digits ? Number(digits).toLocaleString("ko-KR") : "";

  if (document.activeElement !== input) return;

  let pos = 0;
  let seen = 0;
  for (let i = 0; i < input.value.length; i++) {
    if (/\d/.test(input.value[i])) seen++;
    if (seen >= digitsBefore) {
      pos = i + 1;
      break;
    }
  }
  if (digitsBefore === 0) pos = 0;
  input.setSelectionRange(pos, pos);
}

function initAmountInputs() {
  document.addEventListener("input", (e) => {
    if (e.target.matches(AMOUNT_INPUT_SELECTOR)) formatAmountField(e.target);
  });
  document.addEventListener(
    "blur",
    (e) => {
      if (e.target.matches(AMOUNT_INPUT_SELECTOR)) formatAmountField(e.target);
    },
    true
  );
}

function currentMonthKey() {
  return document.getElementById("monthPicker").value;
}

function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function csvEscape(val) {
  const s = String(val ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

let store = loadStore();
let activeExpenseCategory = "fluid";
let incomeChart = null;
let expenseChart = null;
let deferredInstallPrompt = null;

function cloneExpenseRows(rows) {
  return (rows || []).map((r) => ({ label: r.label || "", amount: parseAmount(r.amount) }));
}

function ensureRecurringSettings() {
  if (!store.settings.recurringExpenses) {
    store.settings.recurringExpenses = defaultRecurringExpenses();
  }
}

function getRecurringRowsForCategory(cat, monthKey) {
  ensureRecurringSettings();
  const recurring = store.settings.recurringExpenses[cat];
  if (recurring?.length) return cloneExpenseRows(recurring);

  const prevKey = shiftMonth(monthKey, -1);
  const prevRows = store.months[prevKey]?.expenses?.[cat];
  if (prevRows?.length) return cloneExpenseRows(prevRows);

  return [];
}

function seedRecurringExpenses(monthKey) {
  const m = store.months[monthKey];
  for (const cat of RECURRING_EXPENSE_CATS) {
    if (!m.expenses[cat].length) {
      const seeded = getRecurringRowsForCategory(cat, monthKey);
      if (seeded.length) m.expenses[cat] = seeded;
    }
  }
}

function syncRecurringExpenses(category, rows) {
  if (!RECURRING_EXPENSE_CATS.includes(category)) return;
  ensureRecurringSettings();
  store.settings.recurringExpenses[category] = cloneExpenseRows(rows);
}

function getMonthData(key) {
  const isNewMonth = !store.months[key];
  if (isNewMonth) store.months[key] = defaultMonthData();
  const m = store.months[key];
  for (const cat of Object.keys(EXPENSE_CATEGORIES)) {
    if (!Array.isArray(m.expenses[cat])) m.expenses[cat] = [];
  }
  if (isNewMonth) seedRecurringExpenses(key);
  return m;
}

function calcMemberIncome(memberId, monthKey) {
  const month = getMonthData(monthKey);
  const settings = store.settings;
  let total = 0;
  if (memberId === "dad") total += parseAmount(settings.baseSalaries.dad);
  if (memberId === "mom") total += parseAmount(settings.baseSalaries.mom);
  (month.extraIncome[memberId] || []).forEach((row) => {
    total += parseAmount(row.amount);
  });
  return total;
}

function calcTotalIncome(monthKey) {
  return INCOME_MEMBERS.reduce((sum, m) => sum + calcMemberIncome(m.id, monthKey), 0);
}

function calcCategoryTotal(category, monthKey) {
  const month = getMonthData(monthKey);
  return (month.expenses[category] || []).reduce((s, row) => s + parseAmount(row.amount), 0);
}

function calcTotalExpense(monthKey) {
  return Object.keys(EXPENSE_CATEGORIES).reduce(
    (s, cat) => s + calcCategoryTotal(cat, monthKey),
    0
  );
}

function getBudgetOverages(monthKey) {
  const budgets = store.settings.budgets;
  if (!budgets.alertsEnabled) return [];

  const over = [];
  const totalSpent = calcTotalExpense(monthKey);
  const totalBudget = parseAmount(budgets.total);

  if (totalBudget > 0 && totalSpent > totalBudget) {
    over.push({
      key: "total",
      label: "총 지출",
      budget: totalBudget,
      spent: totalSpent,
      over: totalSpent - totalBudget,
    });
  }

  for (const [catId, cat] of Object.entries(EXPENSE_CATEGORIES)) {
    const budget = parseAmount(budgets[catId]);
    const spent = calcCategoryTotal(catId, monthKey);
    if (budget > 0 && spent > budget) {
      over.push({
        key: catId,
        label: cat.budgetLabel,
        budget,
        spent,
        over: spent - budget,
      });
    }
  }
  return over;
}

function showToast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("toast--show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("toast--show"), 2800);
}

function renderBudgetAlerts() {
  const key = currentMonthKey();
  const overages = getBudgetOverages(key);
  const container = document.getElementById("budgetAlerts");

  if (overages.length === 0) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  container.hidden = false;
  container.innerHTML = overages
    .map(
      (o) => `
    <div class="alert alert--danger" role="alert">
      <strong>${escapeHtml(o.label)} 예산 초과</strong> —
      목표 ${formatWon(o.budget)}, 실제 ${formatWon(o.spent)}
      (${formatWon(o.over)} 초과)
    </div>`
    )
    .join("");
}

function renderBudgetSection() {
  const key = currentMonthKey();
  const budgets = store.settings.budgets;

  const items = [
    { key: "total", label: "총 지출 예산", spent: calcTotalExpense(key) },
    ...Object.entries(EXPENSE_CATEGORIES).map(([id, cat]) => ({
      key: id,
      label: cat.budgetLabel,
      spent: calcCategoryTotal(id, key),
    })),
  ];

  document.getElementById("budgetSection").innerHTML = items
    .map((item) => {
      const budget = parseAmount(budgets[item.key]);
      const isOver = budget > 0 && item.spent > budget;
      return `
    <div class="budget-item ${isOver ? "budget-item--over" : ""}">
      <p class="budget-item__label">${escapeHtml(item.label)} 목표</p>
      <input type="text" inputmode="numeric" class="input-amount" data-budget="${item.key}"
        value="${formatAmountInput(budget)}" placeholder="0 (미설정)" />
      <p class="budget-item__spent ${isOver ? "budget-item__spent--over" : ""}">
        이번 달 사용: ${formatWon(item.spent)}${isOver ? ` · ${formatWon(item.spent - budget)} 초과` : ""}
      </p>
    </div>`;
    })
    .join("");
}

function collectBudgetFromDom() {
  document.querySelectorAll("[data-budget]").forEach((input) => {
    store.settings.budgets[input.dataset.budget] = parseAmount(input.value);
  });
  saveStore(store);
  showToast("예산이 저장되었습니다.");
  renderBudgetAlerts();
  renderBudgetSection();
  renderSummary();
}

function renderSummary() {
  const key = currentMonthKey();
  const income = calcTotalIncome(key);
  const expense = calcTotalExpense(key);
  const balance = income - expense;
  const savingsRate = income > 0 ? Math.round((balance / income) * 100) : 0;
  const cards = [
    { label: "총 소득", value: formatWon(income) },
    { label: "총 지출", value: formatWon(expense) },
    {
      label: "월 잔액 (저축)",
      value: formatWon(balance),
      className: balance >= 0 ? "summary-card--positive" : "summary-card--negative",
    },
    { label: "저축률", value: `${savingsRate}%` },
  ];

  document.getElementById("summaryCards").innerHTML = cards
    .map(
      (c) => `
    <article class="summary-card ${c.className || ""}">
      <p class="summary-card__label">${c.label}</p>
      <p class="summary-card__value">${c.value}</p>
    </article>`
    )
    .join("");
}

function renderIncomeSection() {
  const key = currentMonthKey();
  const month = getMonthData(key);
  const settings = store.settings;

  document.getElementById("incomeSection").innerHTML = INCOME_MEMBERS.map((member) => {
    const extras = month.extraIncome[member.id] || [];
    const fixedField = member.hasFixedSalary
      ? `
      <div class="field">
        <label>고정 월급 (매월 자동 반영)</label>
        <input type="text" inputmode="numeric" class="input-amount" data-base-salary="${member.id}"
          value="${formatAmountInput(settings.baseSalaries[member.id])}"
          placeholder="0" />
      </div>`
      : "";

    const extraRows = extras
      .map(
        (row, idx) => `
      <div class="extra-income-row" data-member="${member.id}" data-idx="${idx}">
        <input type="text" placeholder="항목 (예: 용돈, 상여)" data-extra-label
          value="${escapeHtml(row.label || "")}" />
        <input type="text" inputmode="numeric" class="input-amount" placeholder="금액" data-extra-amount
          value="${formatAmountInput(row.amount)}" />
        <button type="button" class="icon-btn" data-remove-extra aria-label="삭제">×</button>
      </div>`
      )
      .join("");

    return `
    <article class="member-card" style="--member-color: ${member.color}">
      <h3 class="member-card__title">${member.name}
        <span class="member-card__role"> · ${member.role}</span>
      </h3>
      ${fixedField}
      <div class="field">
        <label>부가소득 (이번 달)</label>
        <div class="extra-income-list" data-extra-list="${member.id}">
          ${extraRows || '<p class="panel__hint" style="margin:0">부가소득이 없으면 비워두세요.</p>'}
        </div>
        <button type="button" class="btn btn--ghost btn--sm" data-add-extra="${member.id}"
          style="margin-top:0.35rem;font-size:0.85rem">+ 부가소득 추가</button>
      </div>
      <p class="category-total" style="margin:0.75rem 0 0">이번 달 합계: <span>${formatWon(calcMemberIncome(member.id, key))}</span></p>
    </article>`;
  }).join("");
}

function renderExpensePanel() {
  const key = currentMonthKey();
  const cat = EXPENSE_CATEGORIES[activeExpenseCategory];
  const rows = getMonthData(key).expenses[activeExpenseCategory] || [];
  const budget = parseAmount(store.settings.budgets[activeExpenseCategory]);
  const spent = calcCategoryTotal(activeExpenseCategory, key);
  const isOver = budget > 0 && spent > budget;

  const tableRows =
    rows.length > 0
      ? rows
          .map(
            (row, idx) => `
      <tr data-expense-idx="${idx}">
        <td><input type="text" data-exp-label value="${escapeHtml(row.label || "")}" placeholder="내역" /></td>
        <td class="col-amount"><input type="text" inputmode="numeric" class="input-amount" data-exp-amount
          value="${formatAmountInput(row.amount)}" placeholder="0" /></td>
        <td class="col-actions"><button type="button" class="icon-btn" data-remove-expense>×</button></td>
      </tr>`
          )
          .join("")
      : `<tr><td colspan="3" class="panel__hint" style="padding:0.75rem">지출 항목을 추가해 주세요.</td></tr>`;

  const budgetHint =
    budget > 0
      ? `<p class="expense-category-desc ${isOver ? "expense-category-desc--over" : ""}" style="${isOver ? "border:1px solid var(--danger);background:var(--danger-soft);color:var(--danger)" : ""}">
      예산 ${formatWon(budget)} · 사용 ${formatWon(spent)}${isOver ? ` · <strong>${formatWon(spent - budget)} 초과</strong>` : ` · 잔여 ${formatWon(Math.max(0, budget - spent))}`}
    </p>`
      : "";

  const recurringHint = RECURRING_EXPENSE_CATS.includes(activeExpenseCategory)
    ? `<p class="panel__hint panel__hint--recurring">저장한 항목·금액은 이후 새로 여는 달에도 자동으로 불러옵니다. (유동성은 해당 월만)</p>`
    : "";

  document.getElementById("expensePanel").innerHTML = `
    <p class="expense-category-desc"><strong>${cat.label}</strong> — ${cat.desc}</p>
    ${recurringHint}
    ${budgetHint}
    <table class="expense-table">
      <thead>
        <tr><th>내역</th><th>금액 (원)</th><th></th></tr>
      </thead>
      <tbody id="expenseRows">${tableRows}</tbody>
    </table>
    <div class="expense-footer">
      <button type="button" class="btn btn--ghost btn--sm" id="addExpenseRow">+ 지출 항목 추가</button>
      <p class="category-total">${cat.label} 소계: <span>${formatWon(spent)}</span></p>
    </div>
    <div class="panel__actions">
      <button type="button" class="btn btn--primary" id="saveExpense">지출 저장</button>
    </div>`;
}

function collectExpenseFromDom() {
  const key = currentMonthKey();
  const month = getMonthData(key);
  const collected = [];

  document.querySelectorAll("#expenseRows tr[data-expense-idx]").forEach((tr) => {
    const label = tr.querySelector("[data-exp-label]")?.value?.trim() || "";
    const amount = parseAmount(tr.querySelector("[data-exp-amount]")?.value);
    if (label || amount) collected.push({ label, amount });
  });

  month.expenses[activeExpenseCategory] = collected;
  syncRecurringExpenses(activeExpenseCategory, collected);
  saveStore(store);
  const over = getBudgetOverages(key);
  const recurringNote = RECURRING_EXPENSE_CATS.includes(activeExpenseCategory) ? " · 다음 달 반영" : "";
  if (over.length > 0) {
    showToast(`${EXPENSE_CATEGORIES[activeExpenseCategory].label} 저장됨 · 예산 초과 ${over.length}건${recurringNote}`);
  } else {
    showToast(`${EXPENSE_CATEGORIES[activeExpenseCategory].label} 지출이 저장되었습니다.${recurringNote}`);
  }
  renderAll();
}

function addExpenseRow() {
  collectExpenseFromDomSilent();
  const key = currentMonthKey();
  getMonthData(key).expenses[activeExpenseCategory].push({ label: "", amount: 0 });
  saveStore(store);
  renderExpensePanel();
  bindExpenseEvents();
}

function collectExpenseFromDomSilent() {
  const key = currentMonthKey();
  const month = getMonthData(key);
  const collected = [];
  document.querySelectorAll("#expenseRows tr[data-expense-idx]").forEach((tr) => {
    const label = tr.querySelector("[data-exp-label]")?.value?.trim() || "";
    const amount = parseAmount(tr.querySelector("[data-exp-amount]")?.value);
    if (label || amount) collected.push({ label, amount });
  });
  month.expenses[activeExpenseCategory] = collected;
  syncRecurringExpenses(activeExpenseCategory, collected);
  saveStore(store);
}

function collectIncomeFromDom() {
  collectIncomeFromDomSilent();
  showToast("소득이 저장되었습니다.");
  renderAll();
}

function collectIncomeFromDomSilent() {
  document.querySelectorAll("[data-base-salary]").forEach((input) => {
    store.settings.baseSalaries[input.dataset.baseSalary] = parseAmount(input.value);
  });
  const key = currentMonthKey();
  const month = getMonthData(key);
  INCOME_MEMBERS.forEach((member) => {
    const rows = [];
    document.querySelectorAll(`[data-extra-list="${member.id}"] .extra-income-row`).forEach((row) => {
      const label = row.querySelector("[data-extra-label]")?.value?.trim() || "";
      const amount = parseAmount(row.querySelector("[data-extra-amount]")?.value);
      if (label || amount) rows.push({ label, amount });
    });
    month.extraIncome[member.id] = rows;
  });
  saveStore(store);
}

function renderCharts() {
  const key = currentMonthKey();
  const incomeData = INCOME_MEMBERS.map((m) => calcMemberIncome(m.id, key));
  const expenseData = Object.keys(EXPENSE_CATEGORIES).map((c) => calcCategoryTotal(c, key));

  const incomeCtx = document.getElementById("incomeChart");
  const expenseCtx = document.getElementById("expenseChart");

  if (incomeChart) incomeChart.destroy();
  if (expenseChart) expenseChart.destroy();
  incomeChart = null;
  expenseChart = null;

  if (incomeData.some((v) => v > 0)) {
    incomeChart = new Chart(incomeCtx, {
      type: "doughnut",
      data: {
        labels: INCOME_MEMBERS.map((m) => m.name),
        datasets: [{ data: incomeData, backgroundColor: INCOME_MEMBERS.map((m) => m.color), borderWidth: 0 }],
      },
      options: chartOptions("원", incomeData),
    });
  }

  if (expenseData.some((v) => v > 0)) {
    expenseChart = new Chart(expenseCtx, {
      type: "doughnut",
      data: {
        labels: Object.values(EXPENSE_CATEGORIES).map((c) => c.label),
        datasets: [
          {
            data: expenseData,
            backgroundColor: Object.values(EXPENSE_CATEGORIES).map((c) => c.color),
            borderWidth: 0,
          },
        ],
      },
      options: chartOptions("원", expenseData),
    });
  }
}

function chartOptions(unit, values) {
  const total = (values || []).reduce((a, b) => a + b, 0);
  const percentOf = (v) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          font: { family: "Noto Sans KR" },
          padding: 14,
          generateLabels(chart) {
            const dataset = chart.data.datasets[0];
            const labels = chart.data.labels || [];
            return labels.map((label, i) => {
              const value = dataset.data[i];
              const pct = percentOf(value);
              const meta = chart.getDatasetMeta(0);
              const style = meta.controller.getStyle(i);
              return {
                text: `${label} ${pct}%`,
                fillStyle: style.backgroundColor,
                strokeStyle: style.borderColor,
                lineWidth: style.borderWidth,
                hidden: !chart.getDataVisibility(i),
                index: i,
              };
            });
          },
        },
      },
      tooltip: {
        callbacks: {
          label(ctx) {
            const v = ctx.parsed;
            const pct = percentOf(v);
            return ` ${ctx.label}: ${v.toLocaleString("ko-KR")}${unit} (${pct}%)`;
          },
        },
      },
    },
  };
}

function exportCsv() {
  const lines = [];
  const monthKeys = [...new Set([...Object.keys(store.months), currentMonthKey()])].sort();

  lines.push(["다은이네 가계현황 대시보드 CSV보내기", new Date().toLocaleString("ko-KR")].join(","));
  lines.push("");
  lines.push(["고정 월급", "아빠", store.settings.baseSalaries.dad].map(csvEscape).join(","));
  lines.push(["고정 월급", "엄마", store.settings.baseSalaries.mom].map(csvEscape).join(","));
  lines.push("");

  for (const monthKey of monthKeys) {
    const m = getMonthData(monthKey);
    lines.push(["===", monthKey, "==="].map(csvEscape).join(","));
    lines.push(["구분", "카테고리", "항목", "금액"].map(csvEscape).join(","));

    INCOME_MEMBERS.forEach((member) => {
      let base = 0;
      if (member.id === "dad") base = parseAmount(store.settings.baseSalaries.dad);
      if (member.id === "mom") base = parseAmount(store.settings.baseSalaries.mom);
      if (base > 0) {
        lines.push(["소득", member.name, "고정 월급", base].map(csvEscape).join(","));
      }
      (m.extraIncome[member.id] || []).forEach((row) => {
        lines.push(["소득", member.name, row.label, row.amount].map(csvEscape).join(","));
      });
    });

    for (const [catId, cat] of Object.entries(EXPENSE_CATEGORIES)) {
      (m.expenses[catId] || []).forEach((row) => {
        lines.push(["지출", cat.label, row.label, row.amount].map(csvEscape).join(","));
      });
    }

    const income = calcTotalIncome(monthKey);
    const expense = calcTotalExpense(monthKey);
    lines.push(["합계", "총 소득", "", income].map(csvEscape).join(","));
    lines.push(["합계", "총 지출", "", expense].map(csvEscape).join(","));
    lines.push(["합계", "잔액", "", income - expense].map(csvEscape).join(","));
    lines.push("");
  }

  const bom = "\uFEFF";
  const blob = new Blob([bom + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `다은이네_가계_${currentMonthKey()}_전체.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("CSV 파일을 다운로드했습니다.");
}

function bindIncomeEvents() {
  document.getElementById("saveIncome")?.addEventListener("click", collectIncomeFromDom);

  document.querySelectorAll("[data-add-extra]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const memberId = btn.dataset.addExtra;
      collectIncomeFromDomSilent();
      getMonthData(currentMonthKey()).extraIncome[memberId].push({ label: "", amount: 0 });
      saveStore(store);
      renderIncomeSection();
      bindIncomeEvents();
    });
  });

  document.querySelectorAll("[data-remove-extra]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".extra-income-row");
      const memberId = row.dataset.member;
      const idx = Number(row.dataset.idx);
      collectIncomeFromDomSilent();
      getMonthData(currentMonthKey()).extraIncome[memberId].splice(idx, 1);
      saveStore(store);
      renderIncomeSection();
      bindIncomeEvents();
      renderSummary();
      renderCharts();
    });
  });
}

function bindExpenseEvents() {
  document.getElementById("saveExpense")?.addEventListener("click", collectExpenseFromDom);
  document.getElementById("addExpenseRow")?.addEventListener("click", addExpenseRow);

  document.querySelectorAll("[data-remove-expense]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const idx = Number(tr.dataset.expenseIdx);
      collectExpenseFromDomSilent();
      const month = getMonthData(currentMonthKey());
      month.expenses[activeExpenseCategory].splice(idx, 1);
      syncRecurringExpenses(activeExpenseCategory, month.expenses[activeExpenseCategory]);
      saveStore(store);
      renderExpensePanel();
      bindExpenseEvents();
      renderSummary();
      renderCharts();
      renderBudgetAlerts();
      renderBudgetSection();
    });
  });
}

function bindTabs() {
  document.querySelectorAll(".expense-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      collectExpenseFromDomSilent();
      activeExpenseCategory = tab.dataset.category;
      document.querySelectorAll(".expense-tabs .tab").forEach((t) => {
        t.classList.toggle("tab--active", t === tab);
      });
      renderExpensePanel();
      bindExpenseEvents();
    });
  });
}

function renderAll() {
  renderBudgetAlerts();
  renderSummary();
  renderBudgetSection();
  renderIncomeSection();
  bindIncomeEvents();
  renderExpensePanel();
  bindExpenseEvents();
  renderCharts();
}

function initMonthPicker() {
  const picker = document.getElementById("monthPicker");
  const now = new Date();
  picker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  picker.addEventListener("change", renderAll);
  document.getElementById("prevMonth").addEventListener("click", () => {
    picker.value = shiftMonth(picker.value, -1);
    renderAll();
  });
  document.getElementById("nextMonth").addEventListener("click", () => {
    picker.value = shiftMonth(picker.value, 1);
    renderAll();
  });
}

function initPwa() {
  const btn = document.getElementById("installPwa");
  if (!btn) return;

  const isSecure =
    location.protocol === "https:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";

  if ("serviceWorker" in navigator && isSecure) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    btn.hidden = false;
  });

  btn.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      btn.hidden = true;
      return;
    }
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      showToast("Safari 공유 → 홈 화면에 추가로 설치할 수 있습니다.");
      return;
    }
    if (!isSecure) {
      showToast("PWA 설치는 localhost 또는 HTTPS에서 가능합니다. Live Server로 열어 주세요.");
      return;
    }
    showToast("브라우저 메뉴에서 '앱 설치' 또는 '홈 화면에 추가'를 선택해 주세요.");
  });

  window.addEventListener("appinstalled", () => {
    showToast("앱이 설치되었습니다.");
    btn.hidden = true;
  });
}

document.getElementById("saveBudget").addEventListener("click", collectBudgetFromDom);
document.getElementById("exportCsv").addEventListener("click", exportCsv);

document.getElementById("resetData").addEventListener("click", () => {
  if (!confirm("현재 입력된 모든 가계 데이터를 초기화할까요?")) return;
  store = loadStore();
  showToast("데이터가 초기화되었습니다.");
  renderAll();
});

initAmountInputs();
initMonthPicker();
bindTabs();
initPwa();
renderAll();
