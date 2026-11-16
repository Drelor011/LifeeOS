"use strict";

/* ============================================================
   LifeOS — script.js

   1. Утилиты            6. Задачи
   2. Даты               7. Привычки
   3. Состояние          8. Календарь
   4. Помощники UI       9. Дашборд
   5. Навигация         10. Статистика
                        11. Запуск

   Поток данных: действие пользователя -> изменение state -> commit()
   (сохранить в LocalStorage + перерисовать всё). Рендер-функции
   только читают state и обновляют DOM, поэтому экран всегда
   соответствует данным.
   ============================================================ */

/* ---------- 1. Утилиты ---------- */
const $ = (selector) => document.querySelector(selector);

// Создаёт элемент; текст вставляется через textContent (защита от HTML-вставок)
function el(tag, className = "", text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const makeId = () => Date.now().toString(36);

// Склонение: 1 день, 2 дня, 5 дней
function pluralDays(n) {
  const last = n % 10, lastTwo = n % 100;
  if (last === 1 && lastTwo !== 11) return "день";
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "дня";
  return "дней";
}

// Перезапуск CSS-анимации на уже существующем элементе
function restartAnimation(node, className) {
  node.classList.remove(className);
  void node.offsetWidth; // принудительный reflow
  node.classList.add(className);
}

/* ---------- 2. Даты ---------- */
// День хранится строкой "2026-11-16" в локальном времени
// (toISOString не подходит: он считает по UTC и сдвигает день)
function dayKey(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shiftDays(date, delta) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + delta);
  return copy;
}

const todayKey = () => dayKey(new Date());
const monthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const monthIndex = (date) => date.getFullYear() * 12 + date.getMonth();
const formatDate = (date, options) => date.toLocaleDateString("ru-RU", options);

// Последние N дней, от старого к новому (сегодня — последний)
function lastDays(count) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => shiftDays(now, i - (count - 1)));
}

/* ---------- 3. Состояние и хранилище ---------- */
const STORAGE_KEY = "lifeos:v1";

const emptyState = () => ({ tasks: [], habits: [], events: [] });
const asArray = (value) => (Array.isArray(value) ? value : []);

function loadState() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      tasks: asArray(data?.tasks),
      habits: asArray(data?.habits),
      events: asArray(data?.events),
    };
  } catch {
    return emptyState(); // повреждённые данные или LocalStorage недоступен
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* переполнение или приватный режим — приложение продолжает работать */
  }
}

// Единственный источник правды:
//   task  = { id, text, done }
//   habit = { id, name, days: ["2026-11-16", ...] }  — дни выполнения
//   event = { id, date: "2026-11-16", text }
const state = loadState();

const findItem = (collection, id) => state[collection].find((item) => item.id === id);

function removeItem(collection, id) {
  state[collection] = state[collection].filter((item) => item.id !== id);
  commit();
}

// Любое изменение данных: сохранить -> перерисовать
function commit() {
  saveState();
  render();
}

/* ---------- 4. Общие помощники UI ---------- */
// Рисует список и показывает/прячет подсказку «пусто»
function renderList(listNode, emptyNode, items, createItem) {
  listNode.replaceChildren(...items.map(createItem));
  emptyNode.hidden = items.length > 0;
}

// Форма с одним полем: проверяет непустой текст и очищает поле
function bindForm(form, input, onSubmit) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    onSubmit(text);
    input.value = "";
    input.focus();
  });
}

// Делегирование: один обработчик на весь список.
// actions = { toggle: (id) => ..., delete: (id) => ... } по значению data-action
function bindListActions(listNode, itemSelector, actions) {
  listNode.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.closest(itemSelector).dataset.id;
    actions[btn.dataset.action]?.(id);
  });
}

function createDeleteButton(label) {
  const btn = el("button", "del", "×");
  btn.dataset.action = "delete";
  btn.setAttribute("aria-label", label);
  return btn;
}

/* ---------- 5. Навигация ---------- */
const navButtons = document.querySelectorAll(".nav-btn");
const pages = document.querySelectorAll(".page");
const EXIT_MS = 160; // должно совпадать с длительностью page-out в CSS

let currentPage = "dashboard";

// Старая страница плавно уходит, затем появляется новая
function showPage(name) {
  if (name === currentPage) return;

  const from = $(`#page-${currentPage}`);
  const to = $(`#page-${name}`);
  currentPage = name;

  navButtons.forEach((b) => b.classList.toggle("active", b.dataset.page === name));
  pages.forEach((p) => p.classList.remove("active"));
  from.classList.add("leaving");

  setTimeout(() => {
    from.classList.remove("leaving");
    if (currentPage === name) to.classList.add("active");
  }, EXIT_MS);
}

navButtons.forEach((btn) => btn.addEventListener("click", () => showPage(btn.dataset.page)));

/* ---------- 6. Задачи ---------- */
const CHECK_ICON = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';

const taskForm = $("#task-form");
const taskInput = $("#task-input");
const taskList = $("#task-list");
const taskEmpty = $("#task-empty");

function addTask(text) {
  state.tasks.unshift({ id: makeId(), text, done: false }); // новые — сверху
  commit();
}

function toggleTask(id) {
  const task = findItem("tasks", id);
  if (task) task.done = !task.done;
  commit();
}

function createTaskElement(task) {
  const li = el("li", "task" + (task.done ? " done" : ""));
  li.dataset.id = task.id;

  const check = el("button", "check");
  check.dataset.action = "toggle";
  check.setAttribute("aria-label", "Отметить выполненной");
  check.setAttribute("aria-pressed", String(task.done));
  check.innerHTML = CHECK_ICON;

  li.append(check, el("span", "task-text", task.text), createDeleteButton("Удалить задачу"));
  return li;
}

const renderTasks = () => renderList(taskList, taskEmpty, state.tasks, createTaskElement);

bindForm(taskForm, taskInput, addTask);
bindListActions(taskList, ".task", {
  toggle: toggleTask,
  delete: (id) => removeItem("tasks", id),
});

// Общая сводка по задачам: нужна и дашборду, и статистике
function getTaskStats() {
  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.done).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  return { total, done, percent };
}

/* ---------- 7. Привычки ---------- */
const habitForm = $("#habit-form");
const habitInput = $("#habit-input");
const habitList = $("#habit-list");
const habitEmpty = $("#habit-empty");

const isDoneOn = (habit, key) => habit.days.includes(key);

// Текущая серия: дни подряд, считая назад. Если сегодня ещё не отмечено,
// серия не обрывается до конца дня — считаем от вчера.
function calcStreak(habit) {
  const done = new Set(habit.days);
  let cursor = new Date();
  if (!done.has(dayKey(cursor))) cursor = shiftDays(cursor, -1);

  let streak = 0;
  while (done.has(dayKey(cursor))) {
    streak++;
    cursor = shiftDays(cursor, -1);
  }
  return streak;
}

// Самая длинная серия за всё время: ищем самый длинный отрезок подряд идущих дат
function bestStreak(habit) {
  const days = [...new Set(habit.days)].sort(); // YYYY-MM-DD сортируется как строка
  let best = 0, run = 0, prev = null;
  for (const key of days) {
    run = prev && dayKey(shiftDays(parseKey(prev), 1)) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = key;
  }
  return best;
}

function addHabit(name) {
  state.habits.push({ id: makeId(), name, days: [] });
  commit();
}

// Отметить/снять отметку «выполнено сегодня»
function toggleHabit(id) {
  const habit = findItem("habits", id);
  if (!habit) return;
  const today = todayKey();
  habit.days = isDoneOn(habit, today)
    ? habit.days.filter((d) => d !== today)
    : [...habit.days, today];
  commit();
}

function createHabitStreak(streak) {
  const box = el("div", "habit-streak" + (streak ? " active" : ""));
  box.append(
    el("span", "habit-streak-num", streak),
    el("span", "habit-streak-label", streak ? `${pluralDays(streak)} подряд` : "серия не начата")
  );
  return box;
}

// Полоска последних 7 дней; сегодня — справа
function createHabitWeek(habit) {
  const week = el("div", "habit-week");
  lastDays(7).forEach((date, i, all) => {
    const isToday = i === all.length - 1;
    const day = el("div", "habit-day" + (isToday ? " today" : ""));
    day.append(
      el("span", "habit-dot" + (isDoneOn(habit, dayKey(date)) ? " on" : "")),
      el("span", "habit-dow", formatDate(date, { weekday: "short" }))
    );
    week.append(day);
  });
  return week;
}

function createHabitElement(habit) {
  const doneToday = isDoneOn(habit, todayKey());

  const card = el("li", "habit" + (doneToday ? " done" : ""));
  card.dataset.id = habit.id;

  const head = el("div", "habit-head");
  head.append(el("span", "habit-name", habit.name), createDeleteButton("Удалить привычку"));

  const btn = el("button", "habit-btn", doneToday ? "Выполнено сегодня" : "Отметить сегодня");
  btn.dataset.action = "toggle";
  btn.setAttribute("aria-pressed", String(doneToday));

  card.append(head, createHabitStreak(calcStreak(habit)), createHabitWeek(habit), btn);
  return card;
}

const renderHabits = () => renderList(habitList, habitEmpty, state.habits, createHabitElement);

bindForm(habitForm, habitInput, addHabit);
bindListActions(habitList, ".habit", {
  toggle: toggleHabit,
  delete: (id) => removeItem("habits", id),
});

/* ---------- 8. Календарь ---------- */
// Выбранный день и месяц — состояние экрана, в LocalStorage не сохраняется
const calendar = { view: monthStart(new Date()), selected: todayKey() };

const calTitle = $("#cal-title");
const calGrid = $("#cal-grid");
const dayTitle = $("#day-title");
const dayBadge = $("#day-badge");
const eventForm = $("#event-form");
const eventInput = $("#event-input");
const eventList = $("#event-list");
const eventEmpty = $("#event-empty");

function addEvent(text) {
  state.events.push({ id: makeId(), date: calendar.selected, text });
  commit();
}

// Сетка месяца: неделя с понедельника, ровно столько недель, сколько нужно
function getMonthGridDates(view) {
  const year = view.getFullYear();
  const month = view.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const total = Math.ceil((offset + daysInMonth) / 7) * 7;
  return Array.from({ length: total }, (_, i) => new Date(year, month, 1 - offset + i));
}

// { "2026-11-16": 2, ... } — сколько событий в каждый день
function countEventsByDate() {
  const counts = {};
  state.events.forEach((e) => (counts[e.date] = (counts[e.date] || 0) + 1));
  return counts;
}

function createDayCell(date, count) {
  const key = dayKey(date);
  const cell = el("button", "cal-day");
  cell.type = "button";
  cell.dataset.date = key;
  cell.classList.toggle("other", date.getMonth() !== calendar.view.getMonth());
  cell.classList.toggle("today", key === todayKey());
  cell.classList.toggle("selected", key === calendar.selected);
  cell.setAttribute(
    "aria-label",
    formatDate(date, { day: "numeric", month: "long" }) + (count ? `, событий: ${count}` : "")
  );

  const dots = el("span", "cal-dots"); // до трёх точек-индикаторов
  for (let n = 0; n < Math.min(count, 3); n++) dots.append(el("span", "cal-dot"));

  cell.append(el("span", "cal-num", date.getDate()), dots);
  return cell;
}

function createEventElement(event) {
  const li = el("li", "event");
  li.dataset.id = event.id;
  li.append(el("span", "event-text", event.text), createDeleteButton("Удалить событие"));
  return li;
}

function renderDayPanel() {
  const date = parseKey(calendar.selected);
  dayTitle.textContent = capitalize(formatDate(date, { weekday: "long", day: "numeric", month: "long" }));
  dayBadge.hidden = calendar.selected !== todayKey();

  const items = state.events.filter((e) => e.date === calendar.selected);
  renderList(eventList, eventEmpty, items, createEventElement);
}

function renderCalendar(animate = false) {
  calTitle.textContent = capitalize(formatDate(calendar.view, { month: "long", year: "numeric" }));

  const counts = countEventsByDate();
  calGrid.replaceChildren(
    ...getMonthGridDates(calendar.view).map((date) => createDayCell(date, counts[dayKey(date)] || 0))
  );

  if (animate) restartAnimation(calGrid, "swap");
  renderDayPanel();
}

// Показать месяц; direction (-1/0/1) задаёт сторону сдвига анимации
function showMonth(date, direction = 0) {
  calendar.view = monthStart(date);
  calGrid.style.setProperty("--dir", direction);
  renderCalendar(direction !== 0);
}

function goToToday() {
  const now = new Date();
  const direction = Math.sign(monthIndex(now) - monthIndex(calendar.view));
  calendar.selected = todayKey();
  showMonth(now, direction);
}

function selectDay(key) {
  calendar.selected = key;
  const picked = parseKey(key);
  // Клик по дню соседнего месяца переключает на этот месяц (без анимации)
  if (picked.getMonth() !== calendar.view.getMonth()) calendar.view = monthStart(picked);
  renderCalendar();
  calGrid.querySelector(`[data-date="${key}"]`)?.focus(); // фокус не теряется для клавиатуры
}

$("#cal-prev").addEventListener("click", () => showMonth(new Date(calendar.view.getFullYear(), calendar.view.getMonth() - 1, 1), -1));
$("#cal-next").addEventListener("click", () => showMonth(new Date(calendar.view.getFullYear(), calendar.view.getMonth() + 1, 1), 1));
$("#cal-today").addEventListener("click", goToToday);

calGrid.addEventListener("click", (e) => {
  const cell = e.target.closest(".cal-day");
  if (cell) selectDay(cell.dataset.date);
});

bindForm(eventForm, eventInput, addEvent);
bindListActions(eventList, ".event", { delete: (id) => removeItem("events", id) });

/* ---------- 9. Дашборд ---------- */
function renderDashboard() {
  const { total, done, percent } = getTaskStats();
  $("#m-total").textContent = total;
  $("#m-done").textContent = done;
  $("#m-percent").textContent = percent + "%";
  $("#m-bar").style.width = percent + "%";
}

function renderDate() {
  $("#today-date").textContent = capitalize(
    formatDate(new Date(), { weekday: "long", day: "numeric", month: "long" })
  );
}

/* ---------- 10. Статистика ---------- */
function renderTaskStats() {
  const { total, done, percent } = getTaskStats();
  $("#s-done").textContent = done;
  $("#s-done-label").textContent = `Задач выполнено из ${total}`;
  $("#s-percent").textContent = percent + "%";
  $("#s-bar").style.width = percent + "%";
}

function createStreakRow({ name, best, now }, maxBest) {
  const value = el("span", "streak-value", `${best} ${pluralDays(best)}`);
  value.append(el("small", "", ` · сейчас ${now}`));

  const head = el("div", "streak-top");
  head.append(el("span", "streak-name", name), value);

  const fill = el("div", "streak-fill");
  fill.style.width = (best / maxBest) * 100 + "%";
  const track = el("div", "streak-track");
  track.append(fill);

  const row = el("li", "streak-row");
  row.append(head, track);
  return row;
}

function renderStreakStats() {
  // Привычки по убыванию рекорда; первая — обладатель лучшей серии
  const ranked = state.habits
    .map((h) => ({ name: h.name, best: bestStreak(h), now: calcStreak(h) }))
    .sort((a, b) => b.best - a.best);
  const top = ranked[0];

  $("#s-streak").textContent = top ? top.best : 0;
  $("#s-streak-label").textContent =
    top && top.best ? `${pluralDays(top.best)} подряд · ${top.name}` : "Лучшая серия пока не началась";

  const maxBest = Math.max(1, top ? top.best : 1); // длина полоски — относительно лидера
  renderList($("#streak-list"), $("#streak-empty"), ranked, (r) => createStreakRow(r, maxBest));
}

function createBarColumn(date, count, isToday) {
  const fill = el("div", "bar-fill");
  fill.style.height = (count / state.habits.length) * 100 + "%"; // доля привычек за день
  const track = el("div", "bar-track");
  track.append(fill);

  const col = el("div", "bar-col" + (isToday ? " today" : ""));
  col.append(el("span", "bar-val", count), track, el("span", "bar-label", formatDate(date, { weekday: "short" })));
  return col;
}

function renderWeekChart() {
  const hasHabits = state.habits.length > 0;
  const days = lastDays(7);
  let sum = 0;

  const columns = hasHabits
    ? days.map((date, i) => {
        const key = dayKey(date);
        const count = state.habits.filter((h) => isDoneOn(h, key)).length;
        sum += count;
        return createBarColumn(date, count, i === days.length - 1);
      })
    : [];

  $("#week-chart").replaceChildren(...columns);
  $("#week-empty").hidden = hasHabits;
  $("#week-summary").textContent = hasHabits ? `всего отметок: ${sum}` : "";
}

function renderStats() {
  renderTaskStats();
  renderStreakStats();
  renderWeekChart();
}

/* ---------- 11. Запуск ---------- */
function render() {
  renderTasks();
  renderHabits();
  renderCalendar();
  renderDashboard();
  renderStats();
}

renderDate();
render();
