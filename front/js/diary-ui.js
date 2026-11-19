/* Дата в шапке страницы. */
(function () {
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


})();

})();
