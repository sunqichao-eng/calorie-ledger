const foods = [
  ["白米饭", 116], ["全麦面包", 247], ["鸡胸肉", 165], ["鸡蛋", 143],
  ["牛肉", 250], ["三文鱼", 208], ["豆腐", 76], ["西兰花", 34],
  ["苹果", 52], ["香蕉", 89], ["拿铁", 55], ["奶茶", 70],
  ["炒饭", 188], ["牛肉面", 120], ["披萨", 266], ["薯条", 312]
];

const exercises = [
  ["快走", 4.3], ["跑步", 8.3], ["骑行", 6.8], ["游泳", 7.0],
  ["力量训练", 5.0], ["跳绳", 11.8], ["瑜伽", 2.5], ["篮球", 6.5]
];

const ids = [
  "syncStatus", "installBtn", "date", "prevDay", "nextDay", "balance", "balanceHint",
  "intake", "totalBurn", "bmr", "exerciseBurn", "photo", "preview", "photoEmpty",
  "analyzeMeal", "foodPreset", "usePreset", "foodName", "foodAmount", "foodCal",
  "foodProtein", "foodFat", "foodCarbs", "totalProtein", "totalFat", "totalCarbs", "weeklyChart",
  "addMeal", "exerciseType", "exerciseMinutes", "exerciseMet", "addExercise",
  "sex", "age", "height", "weight", "activity", "mealList", "exerciseList", "clearDay"
];

const els = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
let state = { meals: [], exercises: [] };
let pendingPhoto = "";
let deferredInstallPrompt = null;
let chartInstance = null;

if (els.date) els.date.value = new Date().toISOString().slice(0, 10);

foods.forEach(([name, kcal]) => {
  const option = document.createElement("option");
  option.value = `${name}|${kcal}`;
  option.textContent = `${name} · ${kcal}`;
  if(els.foodPreset) els.foodPreset.appendChild(option);
});

exercises.forEach(([name, met]) => {
  const option = document.createElement("option");
  option.value = `${name}|${met}`;
  option.textContent = `${name} · MET ${met}`;
  if(els.exerciseType) els.exerciseType.appendChild(option);
});

function dayKey() {
  return `calorie-ledger-pwa:${els.date ? els.date.value : ''}`;
}

function n(value) { return Number(value) || 0; }
function kcal(value) { return Math.round(value).toLocaleString("zh-CN"); }

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function saveProfile() {
  const profile = {
    sex: els.sex ? els.sex.value : 'male',
    age: els.age ? els.age.value : 28,
    height: els.height ? els.height.value : 175,
    weight: els.weight ? els.weight.value : 75,
    activity: els.activity ? els.activity.value : 1.2
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
  const weight = n(els.weight ? els.weight.value : 0);
  const height = n(els.height ? els.height.value : 0);
  const age = n(els.age ? els.age.value : 0);
  const sexOffset = (els.sex && els.sex.value === "male") ? 5 : -161;
  return 10 * weight + 6.25 * height - 5 * age + sexOffset;
}

function totals() {
  const bmr = calcBmr();
  const baseBurn = bmr * n(els.activity ? els.activity.value : 1.2);
  const intake = state.meals.reduce((sum, meal) => sum + n(meal.kcal), 0);
  const protein = state.meals.reduce((sum, meal) => sum + n(meal.protein), 0);
  const fat = state.meals.reduce((sum, meal) => sum + n(meal.fat), 0);
  const carbs = state.meals.reduce((sum, meal) => sum + n(meal.carbs), 0);
  const exercise = state.exercises.reduce((sum, item) => sum + n(item.kcal), 0);
  const totalBurn = baseBurn + exercise;
  return { bmr, intake, exercise, totalBurn, balance: intake - totalBurn, protein, fat, carbs };
}

function render() {
  const t = totals();
  if (els.intake) els.intake.textContent = kcal(t.intake);
  if (els.exerciseBurn) els.exerciseBurn.textContent = kcal(t.exercise);
  if (els.totalBurn) els.totalBurn.textContent = kcal(t.totalBurn);
  if (els.bmr) els.bmr.textContent = kcal(t.bmr);
  
  if (els.balance) {
    els.balance.textContent = `${t.balance > 0 ? "+" : ""}${kcal(t.balance)}`;
    els.balance.className = t.balance > 0 ? "positive" : "negative";
  }
  if (els.balanceHint) els.balanceHint.textContent = t.balance > 0 ? "kcal 盈余" : "kcal 缺口";

  if (els.totalProtein) els.totalProtein.textContent = Math.round(t.protein);
  if (els.totalFat) els.totalFat.textContent = Math.round(t.fat);
  if (els.totalCarbs) els.totalCarbs.textContent = Math.round(t.carbs);

  if (els.mealList) {
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
          <small>${meal.amount}g | 碳水:${Math.round(n(meal.carbs))}g 蛋:${Math.round(n(meal.protein))}g 脂:${Math.round(n(meal.fat))}g</small>
        </div>
        <div style="display:grid;gap:7px;justify-items:end">
          <span class="tag">${kcal(meal.kcal)}</span>
          <button class="delete" type="button" aria-label="删除饮食" data-meal="${index}">x</button>
        </div>
      `;
      els.mealList.appendChild(item);
    });
  }

  if (els.exerciseList) {
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

  renderChart();
}

function resetPhoto() {
  pendingPhoto = "";
  if (els.photo) els.photo.value = "";
  if (els.preview) {
    els.preview.removeAttribute("src");
    els.preview.style.display = "none";
  }
  if (els.photoEmpty) els.photoEmpty.style.display = "block";
}

function addMeal({ name, amount, calPer100, kcal: mealKcal, protein, fat, carbs, photo }) {
  const safeAmount = Math.max(1, n(amount));
  const calories = n(mealKcal) || safeAmount * Math.max(0, n(calPer100)) / 100;
  if (!safeAmount || !calories) return;
  state.meals.push({
    name: name || "未命名餐食",
    amount: Math.round(safeAmount),
    kcal: calories,
    protein: n(protein),
    fat: n(fat),
    carbs: n(carbs),
    photo: photo || ""
  });
}

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(item => item.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(panel => panel.classList.remove("active"));
    tab.classList.add("active");
    const targetPanel = document.getElementById(tab.dataset.panel);
    if (targetPanel) targetPanel.classList.add("active");
    if (tab.dataset.panel === "chartPanel") renderChart();
  });
});

if (els.photo) {
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
}

if (els.usePreset) {
  els.usePreset.addEventListener("click", () => {
    if(!els.foodPreset) return;
    const [name, calories] = els.foodPreset.value.split("|");
    if (els.foodName) els.foodName.value = name;
    if (els.foodCal) els.foodCal.value = calories;
  });
}

if (els.addMeal) {
  els.addMeal.addEventListener("click", () => {
    addMeal({
      name: els.foodName ? els.foodName.value.trim() : "",
      amount: els.foodAmount ? els.foodAmount.value : 100,
      kcal: els.foodCal ? els.foodCal.value : 0,
      protein: els.foodProtein ? els.foodProtein.value : 0,
      fat: els.foodFat ? els.foodFat.value : 0,
      carbs: els.foodCarbs ? els.foodCarbs.value : 0,
      photo: pendingPhoto
    });
    if (els.foodName) els.foodName.value = "";
    if (els.foodProtein) els.foodProtein.value = 0;
    if (els.foodFat) els.foodFat.value = 0;
    if (els.foodCarbs) els.foodCarbs.value = 0;
    resetPhoto();
    saveDay();
  });
}

if (els.analyzeMeal) {
  els.analyzeMeal.addEventListener("click", async () => {
    if (!pendingPhoto) {
      alert("请先拍照或上传餐食照片。");
      return;
    }

    const oldText = els.analyzeMeal.textContent;
    els.analyzeMeal.disabled = true;
    els.analyzeMeal.textContent = "识别中...";
    if (els.syncStatus) els.syncStatus.textContent = "AI 识别中";

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
        kcal: item.calories,
        protein: item.protein,
        fat: item.fat,
        carbs: item.carbs,
        photo: pendingPhoto
      }));
      resetPhoto();
      saveDay();
      if (els.syncStatus) els.syncStatus.textContent = `已加入 ${items.length} 项`;
    } catch (error) {
      if (els.syncStatus) els.syncStatus.textContent = "AI 未连接";
      alert(error.message);
    } finally {
      els.analyzeMeal.disabled = false;
      els.analyzeMeal.textContent = oldText;
    }
  });
}

if (els.exerciseType) {
  els.exerciseType.addEventListener("change", () => {
    const [, met] = els.exerciseType.value.split("|");
    if (els.exerciseMet) els.exerciseMet.value = met;
  });
}

if (els.addExercise) {
  els.addExercise.addEventListener("click", () => {
    if(!els.exerciseType) return;
    const [name] = els.exerciseType.value.split("|");
    const minutes = n(els.exerciseMinutes ? els.exerciseMinutes.value : 0);
    const met = n(els.exerciseMet ? els.exerciseMet.value : 0);
    const weight = n(els.weight ? els.weight.value : 0);
    if (!minutes || !met || !weight) return;

    state.exercises.push({
      name,
      minutes,
      met,
      kcal: met * weight * minutes / 60
    });
    saveDay();
  });
}

if (els.mealList) {
  els.mealList.addEventListener("click", event => {
    const button = event.target.closest("[data-meal]");
    if (!button) return;
    state.meals.splice(Number(button.dataset.meal), 1);
    saveDay();
  });
}

if (els.exerciseList) {
  els.exerciseList.addEventListener("click", event => {
    const button = event.target.closest("[data-exercise]");
    if (!button) return;
    state.exercises.splice(Number(button.dataset.exercise), 1);
    saveDay();
  });
}

if (els.clearDay) {
  els.clearDay.addEventListener("click", () => {
    if (!state.meals.length && !state.exercises.length) return;
    if (!confirm("清空今天的记录？")) return;
    state = { meals: [], exercises: [] };
    saveDay();
  });
}

["sex", "age", "height", "weight", "activity"].forEach(id => {
  if (els[id]) {
    els[id].addEventListener("input", () => { saveProfile(); render(); });
    els[id].addEventListener("change", () => { saveProfile(); render(); });
  }
});

if (els.date) {
  els.date.addEventListener("change", loadDay);
}

if (els.prevDay) {
  els.prevDay.addEventListener("click", () => {
    if (!els.date) return;
    const date = new Date(`${els.date.value}T00:00:00`);
    date.setDate(date.getDate() - 1);
    els.date.value = date.toISOString().slice(0, 10);
    loadDay();
  });
}

if (els.nextDay) {
  els.nextDay.addEventListener("click", () => {
    if (!els.date) return;
    const date = new Date(`${els.date.value}T00:00:00`);
    date.setDate(date.getDate() + 1);
    els.date.value = date.toISOString().slice(0, 10);
    loadDay();
  });
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (els.installBtn) els.installBtn.hidden = false;
});

if (els.installBtn) {
  els.installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.installBtn.hidden = true;
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

function renderChart() {
  if (!window.Chart || !els.weeklyChart) return;
  const ctx = els.weeklyChart.getContext('2d');
  
  const labels = [];
  const dataPoints = [];
  const today = new Date((els.date ? els.date.value : new Date().toISOString().slice(0, 10)) + "T00:00:00");
  
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    labels.push(dateStr.slice(5)); // 显示 MM-DD

    const raw = localStorage.getItem(`calorie-ledger-pwa:${dateStr}`);
    const dayState = raw ? JSON.parse(raw) : { meals: [], exercises: [] };
    const bmr = calcBmr(); 
    const baseBurn = bmr * n(els.activity ? els.activity.value : 1.2);
    
    const dIntake = dayState.meals.reduce((sum, m) => sum + n(m.kcal), 0);
    const dExe = dayState.exercises.reduce((sum, m) => sum + n(m.kcal), 0);
    dataPoints.push(Math.round(dIntake - (baseBurn + dExe)));
  }

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '热量盈余/缺口 (kcal)',
        data: dataPoints,
        borderColor: '#1e8a5a',
        backgroundColor: 'rgba(30, 138, 90, 0.2)',
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } }
    }
  });
}

loadProfile();
loadDay();
if (els.exerciseType) els.exerciseType.dispatchEvent(new Event("change"));
