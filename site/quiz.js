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

  const node = document.getElementById("quiz-data");
  if (!node) return;
  const data = JSON.parse(node.textContent);
  const stage = document.getElementById("stage");
  if (!stage) return;
  showStart(data, stage);
})();

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
    return ["Безупречно", "Все ответы верные. Можно спокойно открывать следующую тему."];
  }
  if (percent >= 80) return ["Уверенно", "Основа уже держится. Загляни в темы, где ошибся."];
  if (percent >= 60) return ["Хороший заход", "Больше половины с собой. Слабое место лучше перечитать, а не заучить букву."];
  if (percent >= 40) return ["Есть зацепка", "Картина уже не пустая. Вернись в разбор и пройди ещё раз."];
  return ["Разминка", "Так и начинают. Открой тему и разбери один промах вслух."];
}

function showStart(data, stage) {
  const pool = data.pools || [];
  const flat = pool.reduce(function (all, group) { return all.concat(group); }, []);
  const shortSize = data.perPool
    ? data.perPool * pool.length
    : Math.min(data.size || flat.length, flat.length);
  stage.innerHTML = "";
  const card = document.createElement("div");
  card.className = "q-card";
  const lead = document.createElement("p");
  lead.textContent = "В банке " + flat.length + " вопросов. Короткий заход — " + shortSize + ".";
  card.appendChild(lead);
  const short = document.createElement("button");
  short.type = "button";
  short.textContent = flat.length === shortSize ? "Начать" : "Короткий заход";
  short.addEventListener("click", function () { start(data, stage, false); });
  card.appendChild(short);
  if (flat.length > shortSize) {
    const full = document.createElement("button");
    full.type = "button";
    full.className = "ghost";
    full.style.marginLeft = "8px";
    full.textContent = "Весь банк";
    full.addEventListener("click", function () { start(data, stage, true); });
    card.appendChild(full);
  }
  stage.appendChild(card);
}

function pick(data, full) {
  if (full) {
    const all = (data.pools || []).reduce(function (list, group) { return list.concat(group); }, []);
    return shuffle(all);
  }
  if (data.perPool) {
    let picked = [];
    (data.pools || []).forEach(function (group) {
      picked = picked.concat(shuffle(group).slice(0, data.perPool));
    });
    return shuffle(picked);
  }
  const only = (data.pools && data.pools[0]) || [];
  const size = data.size || only.length;
  return shuffle(only).slice(0, size);
}

function start(data, stage, full) {
  const items = pick(data, full).map(function (question) {
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
  Array.from(choices.children).forEach(function (button, index) {
    button.disabled = true;
    const original = item.order[index];
    if (original === question.correct) button.classList.add("good");
    else if (index === displayIndex) button.classList.add("bad");
  });
  const why = document.createElement("p");
  why.className = "explain";
  why.textContent = (ok ? "Да. " : "Не то. ") + (question.why || "");
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = state.index + 1 === state.items.length ? "К итогу" : "Дальше";
  next.style.marginTop = "12px";
  next.addEventListener("click", function () {
    state.index += 1;
    renderQuestion(data, stage, state);
  });
  choices.parentElement.append(why, next);
}

function renderResult(stage, state) {
  const total = state.items.length;
  const pair = rank(state.correct, total);
  stage.innerHTML = "";
  const card = document.createElement("div");
  card.className = "q-card";
  const title = document.createElement("h2");
  title.textContent = pair[0];
  const score = document.createElement("p");
  score.textContent = state.correct + " из " + total + ". " + pair[1];
  card.append(title, score);
  state.missed.forEach(function (question) {
    const row = document.createElement("p");
    row.className = "miss";
    row.textContent = question.topic + ": " + question.prompt;
    card.appendChild(row);
  });
  const again = document.createElement("button");
  again.type = "button";
  again.textContent = "Ещё раз";
  again.addEventListener("click", function () { showStart(JSON.parse(document.getElementById("quiz-data").textContent), stage); });
  card.appendChild(again);
  stage.appendChild(card);
}
