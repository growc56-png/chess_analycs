/* Современный календарь активности для дневника. */
(function () {
  const MONTHS = [
    "янв", "фев", "мар", "апр", "май", "июн",
    "июл", "авг", "сен", "окт", "ноя", "дек"
  ];
  const DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

  function parseLocalDate(value) {
    const parts = String(value).slice(0, 10).split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    const date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function sameMonth(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  }

  function formatDate(date) {
    return date.toLocaleDateString("ru-RU", {
      day: "numeric", month: "short", year: "numeric"
    });
  }

  function drawCalendar(canvas, activeDates) {
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const today = new Date();
    today.setHours(12, 0, 0, 0);

    const end = new Date(today);
    const start = new Date(today);
    start.setDate(start.getDate() - 363);
    start.setDate(start.getDate() - start.getDay());

    const cell = 12;
    const gap = 4;
    const step = cell + gap;
    const left = 42;
    const top = 31;
    const weeks = 53;

    ctx.font = "11px Segoe UI, Arial, sans-serif";
    ctx.fillStyle = "#80939f";
    ctx.textAlign = "left";
    [1, 3, 5].forEach(day => {
      ctx.fillText(DAYS[day], 3, top + day * step + 9);
    });

    let previousMonth = -1;
    const monthLabels = [];

    for (let week = 0; week < weeks; week++) {
      const firstDay = new Date(start);
      firstDay.setDate(start.getDate() + week * 7);
      if (firstDay.getMonth() !== previousMonth) {
        monthLabels.push({ week, month: firstDay.getMonth() });
        previousMonth = firstDay.getMonth();
      }
    }

    ctx.font = "11px Segoe UI, Arial, sans-serif";
    ctx.fillStyle = "#9aabb6";
    monthLabels.forEach(item => {
      ctx.fillText(MONTHS[item.month], left + item.week * step, 17);
    });

    const emptyColor = "#273943";
    const activeColor = "#81b64c";
    const todayKey = dateKey(today);

    for (let week = 0; week < weeks; week++) {
      for (let day = 0; day < 7; day++) {
        const date = new Date(start);
        date.setDate(start.getDate() + week * 7 + day);
        if (date > end) continue;

        const active = activeDates.has(dateKey(date));
        const x = left + week * step;
        const y = top + day * step;

        ctx.fillStyle = active ? activeColor : emptyColor;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x, y, cell, cell, 3);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, cell, cell);
        }

        if (dateKey(date) === todayKey) {
          ctx.strokeStyle = "#dce8d3";
          ctx.lineWidth = 1.4;
          ctx.strokeRect(x - 1, y - 1, cell + 2, cell + 2);
        }
      }
    }

    const fromLabel = formatDate(start);
    const toLabel = formatDate(end);
    ctx.fillStyle = "#718592";
    ctx.font = "10px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${fromLabel} — ${toLabel}`, width - 6, height - 7);
  }

  // Индикатор даты в шапке: отдельные строки вместо длинной серой строки.
  window.addEventListener("load", function () {
    const dateNode = document.getElementById("today-date");
    if (!dateNode) return;
    const today = new Date();
    const weekday = today.toLocaleDateString("ru-RU", { weekday: "long" });
    const dateText = today.toLocaleDateString("ru-RU", {
      day: "numeric", month: "long", year: "numeric"
    });
    const capitalizedWeekday = weekday.charAt(0).toLocaleUpperCase("ru-RU") + weekday.slice(1);
    dateNode.innerHTML = `<span class="today-label">СЕГОДНЯ</span><strong>${capitalizedWeekday}</strong><small>${dateText}</small>`;
  });

  window.drawDiary = async function drawDiary() {
    const canvas = document.getElementById("diaryCanvas");
    if (!canvas) return;

    const emptyMessage = document.getElementById("diaryEmpty");
    const totalElement = document.getElementById("diaryDaysTotal");
    const monthElement = document.getElementById("diaryMonthTotal");
    const lastElement = document.getElementById("diaryLastDate");

    try {
      const response = await fetch("/api/diary", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Сервер вернул ${response.status}`);
      }

      const data = await response.json();
      const rawDates = Array.isArray(data.activity) ? data.activity : [];
      const parsedDates = rawDates.map(parseLocalDate).filter(Boolean);
      const uniqueDates = new Map(parsedDates.map(date => [dateKey(date), date]));
      const dates = [...uniqueDates.values()].sort((a, b) => a - b);
      const activeDates = new Set(uniqueDates.keys());

      const today = new Date();
      const thisMonthCount = dates.filter(date => sameMonth(date, today)).length;

      if (totalElement) totalElement.textContent = String(dates.length);
      if (monthElement) monthElement.textContent = String(thisMonthCount);
      if (lastElement) lastElement.textContent = dates.length ? formatDate(dates[dates.length - 1]) : "Пока нет";

      drawCalendar(canvas, activeDates);

      if (emptyMessage) {
        emptyMessage.hidden = dates.length > 0;
      }
    } catch (error) {
      console.error("Не удалось загрузить дневник активности:", error);
      if (totalElement) totalElement.textContent = "—";
      if (monthElement) monthElement.textContent = "—";
      if (lastElement) lastElement.textContent = "Нет данных";
      if (emptyMessage) {
        emptyMessage.hidden = false;
        emptyMessage.textContent = "Не удалось загрузить календарь активности. Обнови страницу и попробуй снова.";
      }
    }
  };
})();
