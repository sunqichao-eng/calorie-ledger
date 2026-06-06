const foods = [
  ["白米饭", 116],
  ["全麦面包", 247],
  ["鸡胸肉", 165],
  ["鸡蛋", 143],
  ["牛肉", 250],
  ["三文鱼", 208],
  ["豆腐", 76],
  ["西兰花", 34],
  ["苹果", 52],
  ["香蕉", 89],
  ["拿铁", 55],
  ["奶茶", 70],
  ["炒饭", 188],
  ["牛肉面", 120],
  ["披萨", 266],
  ["薯条", 312]
];

const exercises = [
  ["快走", 4.3],
  ["跑步", 8.3],
  ["骑行", 6.8],
  ["游泳", 7.0],
  ["力量训练", 5.0],
  ["跳绳", 11.8],
  ["瑜伽", 2.5],
  ["篮球", 6.5]
];

const ids = [
  "syncStatus", "installBtn", "date", "prevDay", "nextDay", "balance", "balanceHint",
  "intake", "totalBurn", "bmr", "exerciseBurn", "photo", "preview", "photoEmpty",
  "analyzeMeal", "foodPreset", "usePreset", "foodName", "foodAmount", "foodCal",
  "addMeal", "exerciseType", "exerciseMinutes", "exerciseMet", "addExercise",
  "sex", "age", "height", "weight", "activity", "mealList", "exerciseList", "clearDay"
];

const els = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
let state = { meals: [], exercises: [] };
let pendingPhoto = "";
let deferredInstallPrompt = null;

els.date.value = new Date().toISOString().slice(0, 10);

foods.forEach(([name, kcal]) => {
  const option = document.createElement("option");
  option.value = `${name}|${kcal}`;
  option.textContent = `${name} · ${kcal}`;
  els.foodPreset.appendChild(option);
});

exercises.forEach(([name, met]) => {
  const option = document.createElement("option");
  option.value = `${name}|${met}`;
  option.textContent = `${name} · MET ${met}`;
  els.exerciseType.appendChild(option);
});

function dayKey() {
  return `calorie-ledger-pwa:${els.date.value}`;
}

function n(value) {
  return Number(value) || 0;
}

function kcal(value) {
  return Math.round(value).toLocaleString("zh-CN");
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function saveProfile() {
  const profile = {
    sex: els.sex.value,
    age: els.age.value,
    height: els.height.value,
    weight: els.weight.value,
    activity: els.activity.value
  };
  localStorage.setItem("calorie-ledger-pwa:profile", JSON.stringify(profile));
}

function loadProfile() {
  try {
    const raw = localStorage.getItem("calorie-ledger-pwa:profile");
    if (!raw) return;
    const profile = JSON.parse(raw);
    Object.entries(profile).forEach(([key, value]) => {
      if (els[key]) els[key].value = value;
    });
  } catch (_) {}
}

function loadDay() {
  try {
    state = JSON.parse(localStorage.getItem(dayKey())) || { meals: [], exercises: [] };
  } catch (_) {
    state = { meals: [], exercises: [] };
  }
  render();
}

function saveDay() {
  localStorage.setItem(dayKey(), JSON.stringify(state));
  saveProfile();
  render();
}

function calcBmr() {
  const weight = n(els.weight.value);
  const height = n(els.height.value);
  const age = n(els.age.value);
  const sexOffset = els.sex.value === "male" ? 5 : -161;
  return 10 * weight + 6.25 * height - 5 * age + sexOffset;
}

function totals() {
  const bmr = calcBmr();
  const baseBurn = bmr * n(els.activity.value);
  const intake = state.meals.reduce((sum, meal) => sum + n(meal.kcal), 0);
  const exercise = state.exercises.reduce((sum, item) => sum + n(item.kcal), 0);
  const totalBurn = baseBurn + exercise;
  return { bmr, intake, exercise, totalBurn, balance: intake - totalBurn };
}

function render() {
  const t = totals();
  els.intake.textContent = kcal(t.intake);
  els.exerciseBurn.textContent = kcal(t.exercise);
  els.totalBurn.textContent = kcal(t.totalBurn);
  els.bmr.textContent = kcal(t.bmr);
  els.balance.textContent = `${t.balance > 0 ? "+" : ""}${kcal(t.balance)}`;
  els.balance.className = t.balance > 0 ? "positive" : "negative";
  els.balanceHint.textContent = t.balance > 0 ? "kcal 盈余" : "kcal 缺口";

  els.mealList.innerHTML = "";
  if (!state.meals.length) {
    els.mealList.innerHTML = `<div class="empty-state">还没有饮食记录</div>`;
  }
  state.meals.forEach((meal, index) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      ${meal.photo ? `<img class="thumb" src="${meal.photo}" alt="">` : `<div class="thumb empty">食</div>`}
      <div>
        <strong>${escapeHtml(meal.name)}</strong>
        <small>${kcal(meal.amount)}g/ml · ${kcal(meal.calPer100)} kcal/100g</small>
      </div>
      <div style="display:grid;gap:7px;justify-items:end">
        <span class="tag">${kcal(meal.kcal)}</span>
        <button class="delete" type="button" aria-label="删除饮食" data-meal="${index}">x</button>
      </div>
    `;
    els.mealList.appendChild(item);
  });

  els.exerciseList.innerHTML = "";
  state.exercises.forEach((exercise, index) => {
    const item = document.createElement("div");
    item.className = "item exercise";
    item.innerHTML = `
      <div class="thumb empty">动</div>
      <div>
        <strong>${escapeHtml(exercise.name)}</strong>
        <small>${kcal(exercise.minutes)} 分钟 · MET ${exercise.met}</small>
      </div>
      <div style="display:grid;gap:7px;justify-items:end">
        <span class="tag">${kcal(exercise.kcal)}</span>
        <button class="delete" type="button" aria-label="删除运动" data-exercise="${index}">x</button>
      </div>
    `;
    els.exerciseList.appendChild(item);
  });
}

function resetPhoto() {
  pendingPhoto = "";
  els.photo.value = "";
  els.preview.removeAttribute("src");
  els.preview.style.display = "none";
  els.photoEmpty.style.display = "block";
}

function addMeal({ name, amount, calPer100, kcal: mealKcal, photo }) {
  const safeAmount = Math.max(1, n(amount));
  const safeCalPer100 = Math.max(0, n(calPer100));
  const calories = n(mealKcal) || safeAmount * safeCalPer100 / 100;
  if (!safeAmount || !calories) return;
  state.meals.push({
    name: name || "未命名餐食",
    amount: Math.round(safeAmount),
    calPer100: Math.round(safeCalPer100 || calories * 100 / safeAmount),
    kcal: calories,
    photo: photo || ""
  });
}

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(item => item.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(panel => panel.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.panel).classList.add("active");
  });
});

els.photo.addEventListener("change", event => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    pendingPhoto = reader.result;
    els.preview.src = pendingPhoto;
    els.preview.style.display = "block";
    els.photoEmpty.style.display = "none";
  };
  reader.readAsDataURL(file);
});

els.usePreset.addEventListener("click", () => {
  const [name, calories] = els.foodPreset.value.split("|");
  els.foodName.value = name;
  els.foodCal.value = calories;
});

els.addMeal.addEventListener("click", () => {
  addMeal({
    name: els.foodName.value.trim(),
    amount: els.foodAmount.value,
    calPer100: els.foodCal.value,
    photo: pendingPhoto
  });
  els.foodName.value = "";
  resetPhoto();
  saveDay();
});

els.analyzeMeal.addEventListener("click", async () => {
  if (!pendingPhoto) {
    alert("请先拍照或上传餐食照片。");
    return;
  }

  const oldText = els.analyzeMeal.textContent;
  els.analyzeMeal.disabled = true;
  els.analyzeMeal.textContent = "识别中...";
  els.syncStatus.textContent = "AI 识别中";

  try {
    const response = await fetch("/api/analyze-meal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageDataUrl: pendingPhoto })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "识别失败");

    const items = Array.isArray(result.items) ? result.items : [];
    if (!items.length) throw new Error("没有识别到可记录的食物");

    items.forEach(item => addMeal({
      name: item.name || "AI识别餐食",
      amount: item.amount_g,
      calPer100: item.calories_per_100g,
      kcal: item.calories,
      photo: pendingPhoto
    }));
    resetPhoto();
    saveDay();
    els.syncStatus.textContent = `已加入 ${items.length} 项`;
  } catch (error) {
    els.syncStatus.textContent = "AI 未连接";
    alert(error.message);
  } finally {
    els.analyzeMeal.disabled = false;
    els.analyzeMeal.textContent = oldText;
  }
});

els.exerciseType.addEventListener("change", () => {
  const [, met] = els.exerciseType.value.split("|");
  els.exerciseMet.value = met;
});

els.addExercise.addEventListener("click", () => {
  const [name] = els.exerciseType.value.split("|");
  const minutes = n(els.exerciseMinutes.value);
  const met = n(els.exerciseMet.value);
  const weight = n(els.weight.value);
  if (!minutes || !met || !weight) return;

  state.exercises.push({
    name,
    minutes,
    met,
    kcal: met * weight * minutes / 60
  });
  saveDay();
});

els.mealList.addEventListener("click", event => {
  const button = event.target.closest("[data-meal]");
  if (!button) return;
  state.meals.splice(Number(button.dataset.meal), 1);
  saveDay();
});

els.exerciseList.addEventListener("click", event => {
  const button = event.target.closest("[data-exercise]");
  if (!button) return;
  state.exercises.splice(Number(button.dataset.exercise), 1);
  saveDay();
});

els.clearDay.addEventListener("click", () => {
  if (!state.meals.length && !state.exercises.length) return;
  if (!confirm("清空今天的记录？")) return;
  state = { meals: [], exercises: [] };
  saveDay();
});

["sex", "age", "height", "weight", "activity"].forEach(id => {
  els[id].addEventListener("input", () => {
    saveProfile();
    render();
  });
  els[id].addEventListener("change", () => {
    saveProfile();
    render();
  });
});

els.date.addEventListener("change", loadDay);

els.prevDay.addEventListener("click", () => {
  const date = new Date(`${els.date.value}T00:00:00`);
  date.setDate(date.getDate() - 1);
  els.date.value = date.toISOString().slice(0, 10);
  loadDay();
});

els.nextDay.addEventListener("click", () => {
  const date = new Date(`${els.date.value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  els.date.value = date.toISOString().slice(0, 10);
  loadDay();
});

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  els.installBtn.hidden = false;
});

els.installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  els.installBtn.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

loadProfile();
loadDay();
els.exerciseType.dispatchEvent(new Event("change"));
