(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    const color = document.body.getAttribute("data-theme-color");
    if (color) {
      try {
        tg.setHeaderColor(color);
        tg.setBackgroundColor(color);
      } catch (error) {
        /* older clients ignore header color */
      }
    }
  }

  document.querySelectorAll("[data-open]").forEach(function (button) {
    button.addEventListener("click", function () {
      openNotebook(button.getAttribute("data-open"));
    });
  });

  const hash = location.hash || "";
  const notebook = hash.match(/^#notebook-(\d+)$/);
  if (notebook) {
    openNotebook("nb-" + notebook[1]);
    const task = document.getElementById("task-" + notebook[1]);
    if (task) task.scrollIntoView();
  } else if (hash && document.querySelector(hash)) {
    document.querySelector(hash).scrollIntoView();
  }

  deliverTelegramFile();

  const node = document.getElementById("quiz-data");
  if (!node) return;
  const data = JSON.parse(node.textContent);
  const stage = document.getElementById("stage");
  if (!stage) return;
  if (sealedMode()) {
    const tutor = document.querySelector("main .tutor");
    if (tutor) {
      tutor.textContent = "Файл с вопросами не содержит ответов. В конце будет показано, сколько ответов верных и сколько неверных.";
    }
  }
  showStart(data, stage);
})();

function telegramApp() {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg) return null;
  const inside = (tg.initData && String(tg.initData).length > 0) || (tg.platform && tg.platform !== "unknown");
  return inside ? tg : null;
}

function sealedMode() {
  if (telegramApp()) return true;
  return /(?:^|[?&])seal=1(?:&|$)/.test(location.search || "");
}

function exportSpec() {
  const path = location.pathname || "";
  const file = (path.split("/").pop() || "").replace(/\.html$/, "");
  if (!file) return null;
  if (/\/t\/[^/]+\.html$/.test(path)) {
    return { rel: "../export/lessons/" + file + ".txt", name: file + ".txt" };
  }
  if (/\/tests\/t\/[^/]+\.html$/.test(path) || /\/tests\/b\/[^/]+\.html$/.test(path) || /\/tests\/s\/[^/]+\.html$/.test(path)) {
    return { rel: "../../export/tests/" + file + ".txt", name: file + ".txt" };
  }
  if (/\/tests\/exam\.html$/.test(path)) {
    return { rel: "../export/tests/exam.txt", name: "exam.txt" };
  }
  return null;
}

function deliverTelegramFile() {
  const tg = telegramApp();
  const spec = exportSpec();
  if (!tg || !spec || typeof tg.downloadFile !== "function") return;
  const key = "vfrc-file:" + spec.name;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch (error) {
    /* private mode can block storage; still try once */
  }
  const url = new URL(spec.rel, location.href).href;
  try {
    tg.downloadFile({ url: url, file_name: spec.name });
  } catch (error) {
    /* older clients keep the ordinary link on the page */
  }
}

function openNotebook(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.hidden = false;
  document.querySelectorAll('[data-open="' + id + '"]').forEach(function (button) {
    button.hidden = true;
  });
}

function shuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

function rank(correct, total) {
  const percent = total ? Math.round((100 * correct) / total) : 0;
  if (total && correct === total) {
    return ["Результат", "Все ответы верные."];
  }
  if (percent >= 80) return ["Результат", "Верных ответов больше 80%. Имеет смысл вернуться к вопросам, где была ошибка."];
  if (percent >= 60) return ["Результат", "Верных ответов больше половины. Материал тем, где были ошибки, стоит повторить."];
  if (percent >= 40) return ["Результат", "Верных ответов меньше двух третей. Перед повторной попыткой разберите тему."];
  return ["Результат", "Верных ответов мало. Сначала разберите тему, затем пройдите проверку снова."];
}

var MAX_ON_SITE = 15;

function bankCount(data) {
  return (data.pools || []).reduce(function (sum, group) { return sum + group.length; }, 0);
}

function plannedCount(data) {
  var pools = data.pools || [];
  var total = bankCount(data);
  var planned;
  if (data.perPool) planned = data.perPool * pools.length;
  else planned = Math.min(data.size || total, total);
  if (planned > MAX_ON_SITE) planned = MAX_ON_SITE;
  if (planned > total) planned = total;
  return planned;
}

function showStart(data, stage) {
  var count = plannedCount(data);
  stage.innerHTML = "";
  var card = document.createElement("div");
  card.className = "q-card";
  var lead = document.createElement("p");
  lead.textContent = "В проверке " + count + " вопросов.";
  card.appendChild(lead);
  var startButton = document.createElement("button");
  startButton.type = "button";
  startButton.textContent = "Начать";
  startButton.addEventListener("click", function () { start(data, stage); });
  card.appendChild(startButton);
  stage.appendChild(card);
}

function pick(data) {
  var limit = plannedCount(data);
  var picked;
  if (data.perPool) {
    picked = [];
    (data.pools || []).forEach(function (group) {
      picked = picked.concat(shuffle(group).slice(0, data.perPool));
    });
    picked = shuffle(picked);
  } else {
    var only = (data.pools && data.pools[0]) || [];
    var size = data.size || only.length;
    picked = shuffle(only).slice(0, size);
  }
  return picked.slice(0, limit);
}

function start(data, stage) {
  const items = pick(data).map(function (question) {
    const order = shuffle(question.options.map(function (_, index) { return index; }));
    return { question: question, order: order };
  });
  const state = { items: items, index: 0, correct: 0, missed: [] };
  renderQuestion(data, stage, state);
}

function renderQuestion(data, stage, state) {
  if (state.index >= state.items.length) {
    renderResult(stage, state);
    return;
  }
  const item = state.items[state.index];
  const question = item.question;
  stage.innerHTML = "";
  const bar = document.createElement("div");
  bar.className = "bar";
  const fill = document.createElement("span");
  fill.style.width = Math.round((100 * state.index) / state.items.length) + "%";
  bar.appendChild(fill);
  stage.appendChild(bar);
  const card = document.createElement("div");
  card.className = "q-card";
  const progress = document.createElement("p");
  progress.className = "kicker";
  progress.textContent = "Вопрос " + (state.index + 1) + " из " + state.items.length;
  const prompt = document.createElement("h2");
  prompt.textContent = question.prompt;
  const choices = document.createElement("div");
  choices.className = "choices";
  const letters = ["А", "Б", "В", "Г", "Д", "Е"];
  item.order.forEach(function (optionIndex, displayIndex) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = letters[displayIndex] + ". " + question.options[optionIndex];
    button.addEventListener("click", function () {
      choose(data, stage, state, displayIndex, choices);
    });
    choices.appendChild(button);
  });
  card.append(progress, prompt, choices);
  stage.appendChild(card);
}

function choose(data, stage, state, displayIndex, choices) {
  const item = state.items[state.index];
  const question = item.question;
  const picked = item.order[displayIndex];
  const ok = picked === question.correct;
  if (ok) state.correct += 1;
  else state.missed.push(question);
  const sealed = sealedMode();
  Array.from(choices.children).forEach(function (button, index) {
    button.disabled = true;
    if (sealed) {
      if (index === displayIndex) button.classList.add("picked");
      return;
    }
    const original = item.order[index];
    if (original === question.correct) button.classList.add("good");
    else if (index === displayIndex) button.classList.add("bad");
  });
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = state.index + 1 === state.items.length ? "К итогу" : "Дальше";
  next.style.marginTop = "12px";
  next.addEventListener("click", function () {
    state.index += 1;
    renderQuestion(data, stage, state);
  });
  if (!sealed) {
    const why = document.createElement("p");
    why.className = "explain";
    why.textContent = (ok ? "Верно. " : "Неверно. ") + (question.why || "");
    choices.parentElement.append(why, next);
    return;
  }
  choices.parentElement.append(next);
}

function renderResult(stage, state) {
  const total = state.items.length;
  const wrong = total - state.correct;
  const sealed = sealedMode();
  stage.innerHTML = "";
  const card = document.createElement("div");
  card.className = "q-card";
  const title = document.createElement("h2");
  const score = document.createElement("p");
  if (sealed) {
    title.textContent = "Итог";
    score.textContent = "Правильно: " + state.correct + ". Неправильно: " + wrong + ".";
    card.append(title, score);
  } else {
    const pair = rank(state.correct, total);
    title.textContent = pair[0];
    score.textContent = state.correct + " из " + total + ". " + pair[1];
    card.append(title, score);
    state.missed.forEach(function (question) {
      const row = document.createElement("p");
      row.className = "miss";
      row.textContent = question.topic + ": " + question.prompt;
      card.appendChild(row);
    });
  }
  const again = document.createElement("button");
  again.type = "button";
  again.textContent = "Пройти ещё раз";
  again.addEventListener("click", function () { showStart(JSON.parse(document.getElementById("quiz-data").textContent), stage); });
  card.appendChild(again);
  const tg = telegramApp();
  if (tg && typeof tg.sendData === "function") {
    const report = document.createElement("button");
    report.type = "button";
    report.className = "ghost";
    report.style.marginLeft = "8px";
    report.textContent = "Передать боту только счёт";
    report.addEventListener("click", function () {
      try {
        tg.sendData(JSON.stringify({
          result: "score",
          correct: state.correct,
          wrong: wrong,
          total: total
        }));
      } catch (error) {
        /* sendData exists only for a WebApp opened from the bot keyboard */
      }
    });
    card.appendChild(report);
  }
  stage.appendChild(card);
}
