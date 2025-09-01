/*
 * Application logic for the hydrate‑based desalination calculator.
 *
 * This script implements the Hu–Lee–Sum correlation to estimate the maximum
 * achievable salinity (MAS) and maximum water yield (MWY) under
 * user‑specified conditions. It also generates equilibrium curves that
 * illustrate how the hydrate dissociation curve shifts with the presence of
 * salt. The core scientific formulas are implemented directly in
 * JavaScript without external dependencies.
 */

// Constants for water activity correlation (Hu–Lee–Sum coefficients)
// Updated (Table 2: Salts, Avg.)
const B1 = -1.06152;
const B2 = 3.25726;
const B3 = -37.2263;

// Molar mass of pure water (g/mol)
const WATER_MOLAR_MASS = 18.01528;

// Local storage key for saved results
const STORAGE_KEY = 'hls_saved_results';

// Salt properties: molar mass and stoichiometry for calculating X and salinity
const saltProps = {
  NaCl: {
    molarMass: 58.44,
    // number of ionic species (Na+ and Cl‑)
    ionCount: 2
  },
  KCl: {
    molarMass: 74.55,
    ionCount: 2
  },
  MgCl2: {
    molarMass: 95.21,
    // MgCl₂ dissociates into 1 Mg²⁺ and 2 Cl⁻, i.e. 3 ionic species
    ionCount: 3
  }
};

// Gas properties: structure (sI or sII), base β coefficient (×10³) and PT data
const gasData = {
  CH4: {
    structure: 'sI',
    betaX: -0.9115,
    data: [
      [273.4, 2.68], [274.6, 3.05], [276.7, 3.72], [278.3, 4.39],
      [279.6, 5.02], [280.9, 5.77], [282.3, 6.65], [283.6, 7.59],
      [284.7, 8.55], [285.7, 9.17], [286.4, 10.5]
    ]
  },
  C2H6: {
    structure: 'sI',
    betaX: -0.8657,
    data: [
      [273.7055556,0.51021204],
      [274.8166667,0.579159613],
      [275.9277778,0.661896701],
      [277.5944444,0.813581361],
      [278.7055556,0.930792236],
      [279.2611111,1.006634566],
      [279.8166667,1.082476896],
      [280.3722222,1.165213984],
      [280.9277778,1.254845829],
      [281.4833333,1.344477674],
      [282.0388889,1.447899033],
      [282.5944444,1.55821515],
      [283.15,1.689215539],
      [284.2611111,1.985690102],
      [285.3722222,2.302848938],
      [286.4833333,2.730323891]
    ]
  },
  C3H8: {
    structure: 'sII',
    betaX: -1.0582,
    data: [
      [273.6, 0.207], [274.6, 0.248], [276.2, 0.338], [277.2, 0.417], [278.0, 0.51]
    ]
  },
  CO2: {
    structure: 'sI',
    betaX: -0.9143,
    data: [
      [274.3, 1.42], [275.5, 1.63], [276.8, 1.9], [277.6, 2.11], [279.1, 2.55],
      [280.6, 3.12], [281.5, 3.51], [282.1, 3.81], [282.9, 4.37]
    ]
  },
  CP: {
    structure: 'sII',
    // From ΔH_d ≈ 113.7 kJ/mol-guest and n ≈ 17 → nR/ΔH_d ≈ 0.0012426
    betaX: -1.2426,
    t0_atm: 280.15, // K at ~0 wt% NaCl (measured)
    // Measured T(K) vs NaCl(wt%) pairs for overlay
    ts_data: [
      [0,280.15],[1,279.45],[2,278.85],[3.5,278.05],[5,277.15],[6,276.55],
      [7,275.75],[8,274.95],[9,274.45],[10,273.55],[11,272.85],[12,272.05],
      [13,271.35],[14,270.45],[15,269.75],[16,268.85],[17,267.75],[18,266.65],[19,265.25]
    ]
  }
};

// Structure II correction coefficient (Hu–Lee–Sum correlation adjustment)
const ALPHA_SII = 0.927;

// DOM elements
// Tabs
const tabInput = document.getElementById('tab-input');
const tabResults = document.getElementById('tab-results');
const tabCharts = document.getElementById('tab-charts');
const tabInfo = document.getElementById('tab-info');
const tabParam = document.getElementById('tab-param');
const tabSaved = document.getElementById('tab-saved');

const sectionInput = document.getElementById('section-input');
const sectionResults = document.getElementById('section-results');
const sectionCharts = document.getElementById('section-charts');
const sectionInfo = document.getElementById('section-info');
const sectionParam = document.getElementById('section-param');
const sectionSaved = document.getElementById('section-saved');

// Input elements
const gasSelect = document.getElementById('gas');
const saltSelect = document.getElementById('salt');
const salinityInput = document.getElementById('salinity');
const pressureInput = document.getElementById('pressure');
// Custom gas inputs
const customPanel = document.getElementById('customGasPanel');
const customStructure = document.getElementById('customStructure');
const customBetaX = document.getElementById('customBetaX');
const customTPData = document.getElementById('customTPData');
const dTminInput = document.getElementById('dTmin');
const dTmaxInput = document.getElementById('dTmax');
const calculateBtn = document.getElementById('calculateBtn');
const resetBtn = document.getElementById('resetBtn');
const preset1Btn = document.getElementById('preset1Btn');
const preset2Btn = document.getElementById('preset2Btn');
const siiAlphaToggle = document.getElementById('siiAlphaToggle');

// Capture initial defaults (to keep reset consistent with initial UI)
const initialDefaults = {
  gas: gasSelect ? gasSelect.value : 'CH4',
  salt: saltSelect ? saltSelect.value : 'NaCl',
  salinity: salinityInput ? salinityInput.value : '8',
  dTmin: dTminInput ? dTminInput.value : '0.5',
  dTmax: dTmaxInput ? dTmaxInput.value : '5',
  siiAlpha: siiAlphaToggle ? !!siiAlphaToggle.checked : true
};

// Result elements
const masValueElem = document.getElementById('masValue');
const mwyValueElem = document.getElementById('mwyValue');

// KPI readouts at operating pressure
const tPureVal = document.getElementById('tPureVal');
const tInitVal = document.getElementById('tInitVal');
const tMasVal = document.getElementById('tMasVal');
const dtInitVal = document.getElementById('dtInitVal');
const dtExtraVal = document.getElementById('dtExtraVal');
const dtTotalVal = document.getElementById('dtTotalVal');

// Detailed parameters table
const detailedResultsTable = document.getElementById('detailedResultsTable');

// Export & Save elements
const exportBtn = document.getElementById('exportBtn');
const exportMenu = document.getElementById('exportMenu');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const saveResultBtn = document.getElementById('saveResultBtn');
const savedResultsContainer = document.getElementById('savedResultsContainer');
const noSavedResults = document.getElementById('noSavedResults');
// CP T–S comparison chart elements
const cpTsCard = document.getElementById('cpTsCard');
const cpTsCanvas = document.getElementById('cpTsChart');
// Chart card wrapper for P–T chart and fit-method selectors
const ptCard = (function(){ const el = document.getElementById('curveChart'); return el ? el.closest('.glass-card') : null; })();
const t0FitMethodSelect = document.getElementById('t0FitMethodInput') || document.getElementById('t0FitMethod');

// Chart instances (will be initialised on first calculation)
let curveChart;
let mwyChart;
let heatmapMwyChart;
let heatmapMasChart;
let cpTsChart;

// Current calculation result data
let currentCalculationData = null;

// Tab handling
function switchTab(tabId) {
  // Hide all sections
  sectionInput.classList.add('hidden');
  sectionResults.classList.add('hidden');
  sectionCharts.classList.add('hidden');
  sectionInfo.classList.add('hidden');
  sectionSaved.classList.add('hidden');
  if (sectionParam) sectionParam.classList.add('hidden');
  
  // Remove active class from all tabs
  tabInput.classList.remove('active');
  tabResults.classList.remove('active');
  tabCharts.classList.remove('active');
  tabInfo.classList.remove('active');
  tabSaved.classList.remove('active');
  if (tabParam) tabParam.classList.remove('active');
  
  // Show selected section and activate tab
  switch(tabId) {
    case 'input':
      sectionInput.classList.remove('hidden');
      tabInput.classList.add('active');
      break;
    case 'results':
      sectionResults.classList.remove('hidden');
      tabResults.classList.add('active');
      break;
    case 'charts':
      sectionCharts.classList.remove('hidden');
      tabCharts.classList.add('active');
      break;
    case 'info':
      sectionInfo.classList.remove('hidden');
      tabInfo.classList.add('active');
      break;
    case 'param':
      if (sectionParam) sectionParam.classList.remove('hidden');
      if (tabParam) tabParam.classList.add('active');
      break;
    case 'saved':
      sectionSaved.classList.remove('hidden');
      tabSaved.classList.add('active');
      loadSavedResults();
      break;
  }
}

// Tab click event listeners
tabInput.addEventListener('click', () => switchTab('input'));
tabResults.addEventListener('click', () => switchTab('results'));
tabCharts.addEventListener('click', () => switchTab('charts'));
tabInfo.addEventListener('click', () => switchTab('info'));
if (tabParam) tabParam.addEventListener('click', () => switchTab('param'));
tabSaved.addEventListener('click', () => switchTab('saved'));

// Initialize with input tab active
switchTab('input');

// Haptic feedback on button press (progressive enhancement for mobile)
// Uses the Vibration API when available (commonly Android Chrome). iOS Safari
// does not currently support navigator.vibrate, so this is a safe no‑op there.
(() => {
  const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  const isMobileLike = (() => {
    try {
      return (
        (typeof window !== 'undefined' && (
          (window.matchMedia && (window.matchMedia('(any-pointer: coarse)').matches || window.matchMedia('(pointer: coarse)').matches)) ||
          ('ontouchstart' in window) ||
          (navigator && (navigator.maxTouchPoints || navigator.msMaxTouchPoints))
        ))
      );
    } catch (_) { return false; }
  })();
  if (!canVibrate || !isMobileLike) return;
  const recent = new WeakMap();
  const pulse = (el) => {
    const now = Date.now();
    const last = recent.get(el) || 0;
    if (now - last < 120) return; // throttle per element
    recent.set(el, now);
    try { navigator.vibrate(12); } catch (_) { /* ignore */ }
  };
  const selector = 'button, .btn, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]';
  const onPointerDown = (e) => {
    const target = e.target && (e.target.closest ? e.target.closest(selector) : null);
    if (!target) return;
    pulse(target);
  };
  // Capture early to feel immediate on press
  window.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
})();

// CP gas: fix pressure input to ~0.1 MPa and disable when selected
function median(arr) {
  const a = arr.slice().sort((x,y)=>x-y);
  const n = a.length; if (n === 0) return NaN;
  return n % 2 ? a[(n-1)/2] : (a[n/2-1]+a[n/2])/2;
}
function getCustomDataPoints() {
  const lines = (customTPData?.value || '').split(/\n+/).map(s=>s.trim()).filter(Boolean);
  const pts = [];
  for (const line of lines) {
    const m = line.split(/[,\s]+/);
    if (m.length >= 2) {
      const T = parseFloat(m[0]);
      const P = parseFloat(m[1]);
      if (isFinite(T) && isFinite(P)) pts.push([T,P]);
    }
  }
  return pts;
}
function syncPressureForGas() {
  if (!gasSelect || !pressureInput) return;
  const gasKey = gasSelect.value;
  if (customPanel) customPanel.classList.toggle('hidden', gasKey !== 'Custom');
  if (gasKey === 'CP') {
    pressureInput.value = '0.10';
    pressureInput.disabled = true;
  } else {
    pressureInput.disabled = false;
    let pts = [];
    if (gasKey === 'Custom') pts = getCustomDataPoints();
    else if (gasData[gasKey]?.data) pts = gasData[gasKey].data;
    const pList = pts.map(p=>p[1]).filter(v=>isFinite(v));
    const pMed = pList.length ? median(pList) : (gasKey==='CP'?0.1:1.0);
    if (isFinite(pMed)) pressureInput.value = String(parseFloat(pMed.toFixed(3)));
  }
}
if (gasSelect) {
  gasSelect.addEventListener('change', syncPressureForGas);
  syncPressureForGas();
}
if (customTPData) {
  customTPData.addEventListener('input', () => {
    if (gasSelect && gasSelect.value === 'Custom') syncPressureForGas();
  });
}

// Export menu toggle
exportBtn.addEventListener('click', function(e) {
  e.stopPropagation();
  exportMenu.classList.toggle('hidden');
});

// Close export menu when clicking elsewhere
document.addEventListener('click', function() {
  exportMenu.classList.add('hidden');
});

// Export functions
exportCsvBtn.addEventListener('click', function() {
  if (!currentCalculationData) return;
  
  const { 
    dTRange, masValues, mwyValues, gasKey, saltKey, initialSalinity, pressure, 
    salinityMolValues, xValues, lnawValues, dtT0TValues, thlsValues, 
    tmaxValues, naclGValues, waterGValues, waterSolutionGValues, 
    waterHydrateGValues, maxPureWaterYieldValues 
  } = currentCalculationData;
  
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "과냉각도 (K),최대 달성 염도 (wt%),최대 물 전환율 (%),염도 (mol %),X_NaCl,ln(aw),dT/T0T,T_HLS,T_Max (supercooling),NaCl (g),Water (g),최종 염도 (wt%),용액 내 물 (g),하이드레이트 내 물 (g),최대 물 전환율 (%)\n";
  
  for (let i = 0; i < dTRange.length; i++) {
    csvContent += `${dTRange[i]},${masValues[i]},${mwyValues[i]},${salinityMolValues[i]},${xValues[i]},${lnawValues[i]},${dtT0TValues[i]},${thlsValues[i]},${tmaxValues[i]},${naclGValues[i]},${waterGValues[i]},${masValues[i]},${waterSolutionGValues[i]},${waterHydrateGValues[i]},${maxPureWaterYieldValues[i]}\n`;
  }
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `HLS_결과_${gasKey}_${saltKey}_${initialSalinity}wt_${pressure}MPa.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  exportMenu.classList.add('hidden');
});

exportJsonBtn.addEventListener('click', function() {
  if (!currentCalculationData) return;
  
  const jsonData = JSON.stringify(currentCalculationData, null, 2);
  const blob = new Blob([jsonData], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const { gasKey, saltKey, initialSalinity, pressure } = currentCalculationData;
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `HLS_결과_${gasKey}_${saltKey}_${initialSalinity}wt_${pressure}MPa.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  exportMenu.classList.add('hidden');
});

// Save current result
saveResultBtn.addEventListener('click', function() {
  if (!currentCalculationData) return;
  
  const savedResults = getSavedResults();
  const timestamp = new Date().toISOString();
  const resultWithTimestamp = { ...currentCalculationData, timestamp };
  
  savedResults.push(resultWithTimestamp);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedResults));
  
  alert('결과가 저장되었습니다.');
});

// Get saved results from localStorage
function getSavedResults() {
  const savedResults = localStorage.getItem(STORAGE_KEY);
  return savedResults ? JSON.parse(savedResults) : [];
}

// Load and display saved results
function loadSavedResults() {
  const savedResults = getSavedResults();
  
  if (savedResults.length === 0) {
    noSavedResults.classList.remove('hidden');
    savedResultsContainer.innerHTML = '<p id="noSavedResults" class="text-gray-500 italic">저장된 결과가 없습니다.</p>';
    return;
  }
  
  noSavedResults.classList.add('hidden');
  
  let html = '';
  savedResults.forEach((result, index) => {
    const date = new Date(result.timestamp).toLocaleString('ko-KR');
    html += `
      <div class="glass-card p-4 relative">
        <button class="absolute top-2 right-2 text-red-500" onclick="deleteResult(${index})">×</button>
        <h3 class="font-semibold text-lg mb-2">결과 #${index + 1} (${date})</h3>
        <div class="grid grid-cols-2 gap-4 mb-2">
          <div class="bg-gray-100 p-2 rounded">
            <p class="text-xs text-gray-600">기체 / 염</p>
            <p class="font-semibold">${result.gasKey} / ${result.saltKey}</p>
          </div>
          <div class="bg-gray-100 p-2 rounded">
            <p class="text-xs text-gray-600">초기 염도 / 압력</p>
            <p class="font-semibold">${result.initialSalinity} wt% / ${result.pressure} MPa</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-gray-100 p-2 rounded">
            <p class="text-xs text-gray-600">최대 달성 염도 (MAS)</p>
            <p class="font-semibold">${result.masMax.toFixed(2)} wt%</p>
          </div>
          <div class="bg-gray-100 p-2 rounded">
            <p class="text-xs text-gray-600">최대 물 전환율 (MWY)</p>
            <p class="font-semibold">${result.mwyMax.toFixed(2)} %</p>
          </div>
        </div>
        <div class="mt-2 flex gap-2">
          <button class="bg-blue-600 hover:bg-blue-700 text-white text-xs py-1 px-2 rounded" onclick="loadResult(${index})">불러오기</button>
          <button class="bg-green-600 hover:bg-green-700 text-white text-xs py-1 px-2 rounded" onclick="exportResult(${index})">내보내기</button>
        </div>
      </div>
    `;
  });
  
  savedResultsContainer.innerHTML = html;
}

// Delete saved result
window.deleteResult = function(index) {
  if (confirm('저장된 결과를 삭제하시겠습니까?')) {
    const savedResults = getSavedResults();
    savedResults.splice(index, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedResults));
    loadSavedResults();
  }
};

// Load saved result
window.loadResult = function(index) {
  const savedResults = getSavedResults();
  const result = savedResults[index];
  
  if (!result) return;
  
  // Set inputs
  gasSelect.value = result.gasKey;
  saltSelect.value = result.saltKey;
  salinityInput.value = result.initialSalinity;
  pressureInput.value = result.pressure;
  dTminInput.value = result.dTRange[0];
  dTmaxInput.value = result.dTRange[result.dTRange.length - 1];
  
  // Trigger calculation
  calculateBtn.click();
  
  // Switch to results tab
  switchTab('results');
};

// Export saved result
window.exportResult = function(index) {
  const savedResults = getSavedResults();
  const result = savedResults[index];
  
  if (!result) return;
  
  currentCalculationData = result;
  
  const jsonData = JSON.stringify(result, null, 2);
  const blob = new Blob([jsonData], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const { gasKey, saltKey, initialSalinity, pressure } = result;
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `HLS_결과_${gasKey}_${saltKey}_${initialSalinity}wt_${pressure}MPa.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Legacy linear interpolation function (no longer used after cubic fit)
function interpolateT0() { return NaN; }

// Cubic polynomial fit for T0(P): fit once per gas and evaluate for target pressure
const t0FitCache = {};
function fitPolynomial(xs, ys, degree) {
  const n = xs.length;
  const d = Math.min(degree, n - 1);
  const S = new Array(2 * d + 1).fill(0);
  for (let k = 0; k < n; k++) {
    let xp = 1;
    for (let i = 0; i <= 2 * d; i++) { S[i] += xp; xp *= xs[k]; }
  }
  const A = Array.from({ length: d + 1 }, () => new Array(d + 1).fill(0));
  for (let i = 0; i <= d; i++) {
    for (let j = 0; j <= d; j++) A[i][j] = S[i + j];
  }
  const b = new Array(d + 1).fill(0);
  for (let i = 0; i <= d; i++) {
    for (let k = 0; k < n; k++) b[i] += ys[k] * Math.pow(xs[k], i);
  }
  // Solve via Gaussian elimination
  const c = b.slice();
  for (let i = 0; i <= d; i++) {
    let maxRow = i;
    for (let r = i + 1; r <= d; r++) if (Math.abs(A[r][i]) > Math.abs(A[maxRow][i])) maxRow = r;
    if (maxRow !== i) { [A[i], A[maxRow]] = [A[maxRow], A[i]]; [c[i], c[maxRow]] = [c[maxRow], c[i]]; }
    const pivot = A[i][i] || 1e-12;
    for (let j = i; j <= d; j++) A[i][j] /= pivot;
    c[i] /= pivot;
    for (let r = 0; r <= d; r++) {
      if (r === i) continue;
      const f = A[r][i];
      for (let j = i; j <= d; j++) A[r][j] -= f * A[i][j];
      c[r] -= f * c[i];
    }
  }
  return c;
}
function evalPolynomial(coeffs, x) {
  let y = 0, xp = 1;
  for (let i = 0; i < coeffs.length; i++) { y += coeffs[i] * xp; xp *= x; }
  return y;
}
function getGasObject(gasKey) {
  if (gasKey === 'Custom') {
    return {
      structure: (customStructure?.value || 'sI'),
      betaX: parseFloat(customBetaX?.value || '-1.0'),
      data: getCustomDataPoints()
    };
  }
  return gasData[gasKey];
}
function getT0AtPressure(gasKey, P, method) {
  const gas = getGasObject(gasKey);
  if (!gas) return NaN;
  if (gasKey === 'CP') return gas.t0_atm;
  const pts = gas.data || [];
  if (!pts.length) return NaN;
  const methodSel = method || (t0FitMethodSelect ? t0FitMethodSelect.value : 'poly');
  const xs = pts.map(p => p[1]); // pressure
  const ys = pts.map(p => p[0]); // T0
  if (methodSel === 'spline') {
    if (!getT0AtPressure._splineCache) getT0AtPressure._splineCache = {};
    const cache = getT0AtPressure._splineCache;
    if (!cache[gasKey]) cache[gasKey] = buildMonotoneSpline(xs, ys);
    return evalMonotoneSpline(cache[gasKey], P);
  } else {
    if (!t0FitCache[gasKey]) {
      const deg = Math.min(3, xs.length - 1);
      t0FitCache[gasKey] = fitPolynomial(xs, ys, deg);
    }
    return evalPolynomial(t0FitCache[gasKey], P);
  }
}

// Monotone cubic (PCHIP-like) spline utilities
function buildMonotoneSpline(x, y) {
  const n = x.length;
  const h = new Array(n - 1);
  const delta = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) { h[i] = x[i + 1] - x[i]; delta[i] = (y[i + 1] - y[i]) / h[i]; }
  const d = new Array(n);
  if (n === 2) { d[0] = delta[0]; d[1] = delta[0]; }
  else {
    d[0] = ((2 * h[0] + h[1]) * delta[0] - h[0] * delta[1]) / (h[0] + h[1]);
    if (d[0] * delta[0] <= 0) d[0] = 0; else if (Math.abs(d[0]) > 3 * Math.abs(delta[0])) d[0] = 3 * delta[0];
    d[n - 1] = ((2 * h[n - 2] + h[n - 3]) * delta[n - 2] - h[n - 2] * delta[n - 3]) / (h[n - 2] + h[n - 3]);
    if (d[n - 1] * delta[n - 2] <= 0) d[n - 1] = 0; else if (Math.abs(d[n - 1]) > 3 * Math.abs(delta[n - 2])) d[n - 1] = 3 * delta[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (delta[i - 1] * delta[i] <= 0) d[i] = 0;
      else {
        const w1 = 2 * h[i] + h[i - 1];
        const w2 = h[i] + 2 * h[i - 1];
        d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
      }
    }
  }
  return { x, y, h, d };
}
function evalMonotoneSpline(s, xp) {
  const { x, y, h, d } = s; const n = x.length;
  if (xp <= x[0]) return y[0]; if (xp >= x[n - 1]) return y[n - 1];
  let i = 0; while (i < n - 1 && xp > x[i + 1]) i++;
  const t = (xp - x[i]) / h[i];
  const h00 = (1 + 2 * t) * (1 - t) * (1 - t);
  const h10 = t * (1 - t) * (1 - t);
  const h01 = t * t * (3 - 2 * t);
  const h11 = t * t * (t - 1);
  return h00 * y[i] + h10 * h[i] * d[i] + h01 * y[i + 1] + h11 * h[i] * d[i + 1];
}

// Compute effective β value for chosen gas
function computeBeta(gasKey) {
  const gas = getGasObject(gasKey);
  const betaBase = gas.betaX * 1e-3; // convert β (×10³) into proper scale
  const useAlpha = siiAlphaToggle && siiAlphaToggle.checked;
  const alpha = gas.structure === 'sII' && useAlpha ? ALPHA_SII : 1.0;
  return betaBase * alpha;
}

// Compute β with a custom sII-alpha toggle (for parametric studies)
function computeBetaCustom(gasKey, useAlphaFlag) {
  const gas = getGasObject(gasKey);
  const betaBase = gas.betaX * 1e-3;
  const alpha = gas.structure === 'sII' && useAlphaFlag ? ALPHA_SII : 1.0;
  return betaBase * alpha;
}

// Compute X (effective ionic mole fraction) from salinity s (wt%)
function computeXFromSalinity(salinity, saltKey) {
  const { molarMass, ionCount } = saltProps[saltKey];
  const massSalt = salinity;
  const massWater = 100 - salinity;
  const molesSalt = massSalt / molarMass;
  const molesWater = massWater / WATER_MOLAR_MASS;
  if (saltKey === 'MgCl2') {
    // MgCl2 yields 1 Mg²⁺ and 2 Cl⁻: 3 ionic species; contribution X = 4*moles_salt/(moles_water + 3*moles_salt)
    const totalMoles = molesWater + 3 * molesSalt;
    return (4 * molesSalt) / totalMoles;
  } else {
    // NaCl or KCl: 1 cation + 1 anion
    const totalMoles = molesWater + 2 * molesSalt;
    return (2 * molesSalt) / totalMoles;
  }
}

// Compute water activity ln(a_w) from X using HLS correlation
function computeLnawFromX(X) {
  return B1 * X + B2 * X * X + B3 * X * X * X;
}

// Compute ΔT from ln(a_w), β and T0 using rearranged HLS equation
function computeDeltaT(beta, lnaw, T0) {
  return (beta * lnaw * T0 * T0) / (1 + beta * lnaw * T0);
}

// Compute ln(a_w) from ΔT, β and T0
function computeLnawFromDelta(beta, dT, T0) {
  const denominator = beta * T0 * (T0 - dT);
  return dT / denominator;
}

// Solve X from a given ln(a_w) using bisection (monotonic root)
function solveXFromLnaw(lnawTarget) {
  // Define the function f(X) = computeLnawFromX(X) - lnawTarget.
  const f = (X) => computeLnawFromX(X) - lnawTarget;
  // Start with a small bracket for X; X should lie between 0 and ~0.2 for typical desalination ranges.
  let low = 0;
  let high = 0.2;
  // Expand high bound until f(high) <= 0 (meaning computeLnawFromX(high) <= lnawTarget) or until high reaches 1.
  while (f(high) > 0 && high < 1) {
    high += 0.1;
  }
  // Perform bisection
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    const val = f(mid);
    if (val > 0) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

// Compute salinity (wt%) from X for a given salt type using analytical formulae
function computeSalinityFromX(X, saltKey) {
  const { molarMass, ionCount } = saltProps[saltKey];
  if (saltKey === 'MgCl2') {
    // Derived from X = 4*moles_salt/(moles_water + 3*moles_salt)
    return (
      (molarMass * X * 100) /
      ((4 - 3 * X) * WATER_MOLAR_MASS + molarMass * X)
    );
  } else {
    // NaCl or KCl: X = 2*moles_salt/(moles_water + 2*moles_salt)
    return (
      (molarMass * X * 100) /
      ((2 - 2 * X) * WATER_MOLAR_MASS + molarMass * X)
    );
  }
}

// Pretty label for salt symbols (e.g., MgCl2 -> MgCl₂)
function getSaltLabel(saltKey) {
  try {
    const map = { '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '0': '₀' };
    return saltKey.replace(/[0-9]/g, (d)=> map[d] || d);
  } catch (_) {
    return saltKey;
  }
}

// Reset & Presets handling
function clearOutputs() {
  sectionResults.classList.add('hidden');
  sectionCharts.classList.add('hidden');
  if (curveChart) { try { curveChart.destroy(); } catch (e) {} curveChart = null; }
  if (mwyChart) { try { mwyChart.destroy(); } catch (e) {} mwyChart = null; }
  // Switch to input tab
  switchTab('input');
}

if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    gasSelect.value = initialDefaults.gas;
    saltSelect.value = initialDefaults.salt;
    salinityInput.value = initialDefaults.salinity;
    // Set after gas selection based on dataset median
    dTminInput.value = initialDefaults.dTmin;
    dTmaxInput.value = initialDefaults.dTmax;
    if (siiAlphaToggle) siiAlphaToggle.checked = initialDefaults.siiAlpha;
    syncPressureForGas();
    clearOutputs();
  });
}

// Presets removed (buttons no longer in DOM)

// Remove legacy Excel test button and helpers

// Handler for calculation
calculateBtn.addEventListener('click', () => {
  // Parse user inputs
  const gasKey = gasSelect.value;
  const saltKey = saltSelect.value;
  const initialSalinity = parseFloat(salinityInput.value);
  const pressure = gasKey === 'CP' ? 0.1 : parseFloat(pressureInput.value);
  let dTmin = parseFloat(dTminInput.value);
  let dTmax = parseFloat(dTmaxInput.value);
  if (isNaN(initialSalinity) || isNaN(pressure) || isNaN(dTmin) || isNaN(dTmax)) {
    alert('모든 입력값을 올바르게 입력해 주세요.');
    return;
  }
  if (dTmin > dTmax) {
    // Swap values if user inadvertently enters min > max
    [dTmin, dTmax] = [dTmax, dTmin];
  }
  // Compute effective β
  const beta = computeBeta(gasKey);
  const gas = getGasObject(gasKey);
  
  // T0 at operating pressure via cubic fit (CP uses fixed atmospheric T0)
  const methodMain = t0FitMethodSelect ? t0FitMethodSelect.value : 'poly';
  const T0_op = getT0AtPressure(gasKey, pressure, methodMain);
  if (!isFinite(T0_op)) {
    alert('선택한 기체의 순수 평형 T₀(P) 데이터를 확인해 주세요. (Custom인 경우 T,P 데이터를 입력)');
    return;
  }
  
  // Compute ln(a_w) for initial salinity
  const X_init = computeXFromSalinity(initialSalinity, saltKey);
  const lnaw_init = computeLnawFromX(X_init);
  // Compute initial supercooling at operating pressure (relative to pure water)
  const dT_init_op = computeDeltaT(beta, lnaw_init, T0_op);
  // Generate arrays of ΔT and corresponding MAS and MWY
  const nPoints = 50;
  const dTRange = [];
  const masValues = [];
  const mwyValues = [];
  // Additional arrays for detailed parameters
  const salinityMolValues = [];
  const xValues = [];
  const lnawValues = [];
  const dtT0TValues = [];
  const thlsValues = [];
  const tmaxValues = [];
  const naclGValues = [];
  const waterGValues = [];
  const waterSolutionGValues = [];
  const waterHydrateGValues = [];
  const maxPureWaterYieldValues = [];
  
  const step = (dTmax - dTmin) / (nPoints - 1);
  // Assume initial 100g of solution (salt + water)
  const initialNaClG = initialSalinity; // For 100g total, this is directly the wt%
  const initialWaterG = 100 - initialNaClG; // Rest is water
  
  for (let i = 0; i < nPoints; i++) {
    // Interpret input as extra supercooling relative to initial-salinity equilibrium at P_op
    const dT_extra = dTmin + step * i;
    const dT_total = dT_init_op + dT_extra;
    // ensure dT does not exceed T0
    if (dT_total >= T0_op) continue;
    const lnawMas = computeLnawFromDelta(beta, dT_total, T0_op);
    // Only proceed if lnawMas is negative (physically meaningful)
    if (!isFinite(lnawMas) || lnawMas >= 0) {
      continue;
    }
    const X_mas = solveXFromLnaw(lnawMas);
    const mas = computeSalinityFromX(X_mas, saltKey);
    // Guard against division by zero or unrealistic MAS
    if (!isFinite(mas) || mas <= 0) continue;
    
    // MWY 계산 (일관)
    const totalWaterInSolutionTmp = initialNaClG * (100 / mas - 1);
    const waterInHydrateTmp = initialWaterG - totalWaterInSolutionTmp;
    const mwy = (waterInHydrateTmp / initialWaterG) * 100;
    
    // Calculate detailed parameters
    // Salinity in mol% - 엑셀과 일치하도록 계산 방식 개선
    const saltMolarMass = saltProps[saltKey].molarMass;
    const molesNaCl = initialNaClG / saltMolarMass;
    const molesWater = initialWaterG / WATER_MOLAR_MASS;
    
    // 이온 기반 표현 (엑셀과 일치)
    const ionCount = saltProps[saltKey].ionCount;
    const totalMolesIons = ionCount * molesNaCl + molesWater;
    const salinityMol = ((ionCount * molesNaCl) / totalMolesIons) * 100;
    
    // Note: X_mas is already calculated as effective ionic mole fraction
    
    // Calculate dT/T0T
    const dtT0T = dT_total / (T0_op * (T0_op - dT_total));
    
    // Calculate T_HLS: T0 * (1 + (dT/T0T) * T0)^-1
    const thls = T0_op * Math.pow(1 + dtT0T * T0_op, -1);
    
    // T_max (supercooling)
    const tmax = T0_op - dT_total;
    
    // Calculate water distribution for 100g initial solution
    const finalNaClG = initialNaClG; // Salt mass is conserved
    const totalWaterNeeded = (finalNaClG / mas) * 100 - finalNaClG;
    const waterInSolution = totalWaterNeeded;
    const waterInHydrate = initialWaterG - waterInSolution;
    const maxPureWaterYield = (waterInHydrate / initialWaterG) * 100;
    
    // Push all calculated values
    dTRange.push(dT_extra);
    masValues.push(mas);
    mwyValues.push(mwy);
    salinityMolValues.push(salinityMol);
    xValues.push(X_mas);
    lnawValues.push(lnawMas);
    dtT0TValues.push(dtT0T);
    thlsValues.push(thls);
    tmaxValues.push(tmax);
    naclGValues.push(finalNaClG);
    waterGValues.push(initialWaterG);
    waterSolutionGValues.push(waterInSolution);
    waterHydrateGValues.push(waterInHydrate);
    maxPureWaterYieldValues.push(maxPureWaterYield);
  }
  // Derive MAS & MWY at maximum ΔT (last element)
  if (dTRange.length === 0) {
    alert('입력된 조건에서 계산을 수행할 수 없습니다.');
    return;
  }
  const masMax = masValues[masValues.length - 1];
  const mwyMax = mwyValues[mwyValues.length - 1];
  const dtExtraMax = dTRange[dTRange.length - 1];
  const dtTotalAtOp = dT_init_op + dtExtraMax;
  const tPureOp = T0_op;
  const tInitOp = T0_op - dT_init_op;
  const tMasOp = T0_op - dtTotalAtOp;
  
  //
  
  // Save current calculation data for export and save functions
  currentCalculationData = {
    gasKey,
    saltKey,
    initialSalinity,
    pressure,
    dTRange,
    masValues,
    mwyValues,
    beta,
    T0_op,
    dT_init_op,
    masMax,
    mwyMax,
    dtExtraMax,
    dtTotalAtOp,
    tPureOp,
    tInitOp,
    tMasOp,
    // Additional detailed data
    salinityMolValues,
    xValues,
    lnawValues,
    dtT0TValues,
    thlsValues,
    tmaxValues,
    naclGValues,
    waterGValues,
    waterSolutionGValues,
    waterHydrateGValues,
    maxPureWaterYieldValues
  };
  
  // Update result section
  masValueElem.textContent = masMax.toFixed(2) + ' wt%';
  mwyValueElem.textContent = mwyMax.toFixed(2) + ' %';
  if (tPureVal) tPureVal.textContent = tPureOp.toFixed(2) + ' K';
  if (tInitVal) tInitVal.textContent = tInitOp.toFixed(2) + ' K';
  if (tMasVal) tMasVal.textContent = tMasOp.toFixed(2) + ' K';
  if (dtInitVal) dtInitVal.textContent = dT_init_op.toFixed(2) + ' K';
  if (dtExtraVal) dtExtraVal.textContent = dtExtraMax.toFixed(2) + ' K';
  if (dtTotalVal) dtTotalVal.textContent = dtTotalAtOp.toFixed(2) + ' K';
  // Update dynamic table headers for salt
  const xHeaderEl = document.getElementById('xHeader');
  const saltMassHeaderEl = document.getElementById('saltMassHeader');
  if (xHeaderEl) xHeaderEl.textContent = getSaltLabel(saltKey);
  if (saltMassHeaderEl) saltMassHeaderEl.textContent = `${getSaltLabel(saltKey)} (g)`;
  // Fill gas constants details
  const gasNameMap = { CH4: 'CH₄', C2H6: 'C₂H₆', C3H8: 'C₃H₈', CO2: 'CO₂', CP: 'CP', Custom: 'Custom' };
  const gasInfoGas = document.getElementById('gasInfoGas');
  const gasInfoStruct = document.getElementById('gasInfoStruct');
  const gasInfoNRDiv = document.getElementById('gasInfoNRDiv');
  const gasInfoAlpha = document.getElementById('gasInfoAlpha');
  const gasInfoBetaEff = document.getElementById('gasInfoBetaEff');
  const alphaUsed = (gas.structure === 'sII' && siiAlphaToggle && siiAlphaToggle.checked) ? ALPHA_SII : 1.0;
  if (gasInfoGas) gasInfoGas.textContent = gasNameMap[gasKey] || gasKey;
  if (gasInfoStruct) gasInfoStruct.textContent = gas.structure;
  if (gasInfoNRDiv) gasInfoNRDiv.textContent = `${Math.abs(gas.betaX).toFixed(4)} ×10⁻³ 1/K`;
  if (gasInfoAlpha) gasInfoAlpha.textContent = alphaUsed.toFixed(3);
  if (gasInfoBetaEff) gasInfoBetaEff.textContent = (beta).toExponential(6);
  
  // Populate detailed results table
  if (detailedResultsTable) {
    let tableHtml = '';
    for (let i = 0; i < dTRange.length; i++) {
      tableHtml += `<tr>
        <td class="p-2 border">${dTRange[i].toFixed(1)}</td>
        <td class="p-2 border">${salinityMolValues[i].toFixed(8)}</td>
        <td class="p-2 border">${xValues[i].toFixed(8)}</td>
        <td class="p-2 border">${lnawValues[i].toFixed(8)}</td>
        <td class="p-2 border">${dtT0TValues[i].toExponential(5)}</td>
        <td class="p-2 border">${thlsValues[i].toFixed(6)}</td>
        <td class="p-2 border">${tmaxValues[i].toFixed(6)}</td>
        <td class="p-2 border">${naclGValues[i].toFixed(1)}</td>
        <td class="p-2 border">${waterGValues[i].toFixed(1)}</td>
        <td class="p-2 border">${masValues[i].toFixed(8)}</td>
        <td class="p-2 border">${waterSolutionGValues[i].toFixed(8)}</td>
        <td class="p-2 border">${waterHydrateGValues[i].toFixed(8)}</td>
        <td class="p-2 border">${maxPureWaterYieldValues[i].toFixed(8)}</td>
      </tr>`;
    }
    detailedResultsTable.innerHTML = tableHtml;
  }
  
  // Prepare equilibrium curves
  const lnawMasMax = computeLnawFromDelta(beta, dT_init_op + dTRange[dTRange.length - 1], T0_op);
  const pureCurve = [];
  const initCurve = [];
  const masCurve = [];
  if (gas.data && gas.data.length) {
    gas.data.forEach(([T0, P]) => {
      const dT_init = computeDeltaT(beta, lnaw_init, T0);
      const T_init_eq = T0 - dT_init;
      const dT_mas = computeDeltaT(beta, lnawMasMax, T0);
      const T_mas_eq = T0 - dT_mas;
      pureCurve.push({ x: T0, y: P });
      initCurve.push({ x: T_init_eq, y: P });
      masCurve.push({ x: T_mas_eq, y: P });
    });
  }
  // Sort curves by temperature ascending for better rendering
  pureCurve.sort((a, b) => a.x - b.x);
  initCurve.sort((a, b) => a.x - b.x);
  masCurve.sort((a, b) => a.x - b.x);
  
  // Destroy existing charts to avoid memory leaks
  if (curveChart) {
    try {
      curveChart.destroy();
    } catch (e) {
      console.warn('Failed to destroy existing curve chart', e);
    }
    curveChart = null;
  }
  if (mwyChart) {
    try {
      mwyChart.destroy();
    } catch (e) {
      console.warn('Failed to destroy existing MWY chart', e);
    }
    mwyChart = null;
  }
  if (cpTsChart) {
    try { cpTsChart.destroy(); } catch (e) { console.warn('Failed to destroy CP chart', e); }
    cpTsChart = null;
  }
  
  // Obtain Chart constructor safely from global scope; Chart.js 4 UMD attaches
  // itself to the window object. Fallback to undefined if not present.
  const ChartLib = window.Chart;
  try {
    if (ChartLib) {
      // Create equilibrium curve chart
      const ctxCurve = document.getElementById('curveChart').getContext('2d');
      curveChart = new ChartLib(ctxCurve, {
        type: 'line',
        data: {
          datasets: [
            {
              label: '순수 물 평형',
              data: pureCurve,
              borderColor: '#2563eb',
              backgroundColor: 'rgba(37,99,235,0.1)',
              fill: false,
              tension: 0.1,
              pointRadius: 2
            },
            {
              label: '초기 염도 평형',
              data: initCurve,
              borderColor: '#059669',
              backgroundColor: 'rgba(5,150,105,0.1)',
              fill: false,
              tension: 0.1,
              pointRadius: 2
            },
            {
              label: '최대 염도 평형',
              data: masCurve,
              borderColor: '#dc2626',
              backgroundColor: 'rgba(220,38,38,0.1)',
              fill: false,
              tension: 0.1,
              pointRadius: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          aspectRatio: 1, // 1:1 aspect ratio
          scales: {
            x: {
              type: 'linear',
              title: {
                display: true,
                text: '온도 (K)'
              }
            },
            y: {
              type: 'linear',
              title: {
                display: true,
                text: '압력 (MPa)'
              }
            }
          },
          plugins: {
            legend: { position: 'top' },
            tooltip: { mode: 'nearest', intersect: false, animation: { duration: 0 }, displayColors: false }
          },
          animation: { duration: 0 },
          transitions: { active: { animation: { duration: 0 } } },
          elements: { point: { radius: 2, hoverRadius: 2, hitRadius: 6 } }
        }
      });
      // Create MWY vs ΔT chart
      const ctxMwy = document.getElementById('mwyChart').getContext('2d');
      const mwyData = dTRange.map((dT, idx) => ({ x: dT, y: mwyValues[idx] }));
      mwyChart = new ChartLib(ctxMwy, {
        type: 'line',
        data: {
          datasets: [
            {
              label: '최대 물 전환율',
              data: mwyData,
              borderColor: '#2563eb',
              backgroundColor: 'rgba(37,99,235,0.1)',
              fill: true,
              tension: 0.2,
              pointRadius: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          aspectRatio: 1, // 1:1 aspect ratio
          scales: {
            x: {
              type: 'linear',
              title: { display: true, text: '과냉각도 (K)' }
            },
            y: {
              type: 'linear',
              title: { display: true, text: 'MWY (%)' },
              min: 0,
              max: 100
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: { mode: 'nearest', intersect: false, animation: { duration: 0 }, displayColors: false }
          },
          animation: { duration: 0 },
          transitions: { active: { animation: { duration: 0 } } },
          elements: { point: { radius: 2, hoverRadius: 2, hitRadius: 6 } }
        }
      });

      // CP 전용 T–S 비교 차트
      if (gasKey === 'CP' && cpTsCanvas && cpTsCard) {
        const t0cp = gasData.CP.t0_atm;
        const measured = gasData.CP.ts_data.map(([S, T]) => ({ x: S, y: T }));
        const predicted = gasData.CP.ts_data.map(([S, _T]) => {
          const Xs = computeXFromSalinity(S, saltKey);
          const lnaws = computeLnawFromX(Xs);
          const dTs = computeDeltaT(beta, lnaws, t0cp);
          return { x: S, y: t0cp - dTs };
        });
        cpTsChart = new ChartLib(cpTsCanvas.getContext('2d'), {
          type: 'line',
          data: { datasets: [
            { label: '예측 (HLS)', data: predicted, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', fill: false, tension: 0.1, pointRadius: 0 },
            { label: '실험 (측정)', data: measured, type: 'scatter', pointBackgroundColor: '#dc2626', borderColor: '#dc2626', pointRadius: 3 }
          ]},
          options: {
            responsive: true,
            maintainAspectRatio: false,
            aspectRatio: 1,
            scales: { x: { type: 'linear', title: { display: true, text: 'NaCl (wt%)' } }, y: { type: 'linear', title: { display: true, text: '온도 (K)' } } },
            plugins: { legend: { position: 'top' } },
            animation: { duration: 0 }
          }
        });
        cpTsCard.classList.remove('hidden');
        if (ptCard) ptCard.classList.add('hidden');
      } else if (cpTsCard) {
        cpTsCard.classList.add('hidden');
        if (ptCard) ptCard.classList.remove('hidden');
      }
    }
  } catch (err) {
    // Swallow chart errors so that numeric results still display
    console.error('Chart rendering failed:', err);
  }
  
  // Show results and charts sections
  sectionResults.classList.remove('hidden');
  sectionCharts.classList.remove('hidden');
  // Hide P–T chart card if CP is selected
  if (ptCard) {
    if (gasKey === 'CP') ptCard.classList.add('hidden');
    else ptCard.classList.remove('hidden');
  }
  
  // Switch to results tab
  switchTab('results');
});

// Keyboard shortcuts
function showShortcuts() {
  const modal = document.getElementById('shortcutModal');
  if (modal) modal.classList.remove('hidden');
}
function hideShortcuts() {
  const modal = document.getElementById('shortcutModal');
  if (modal) modal.classList.add('hidden');
}
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t?.id === 'shortcutCloseBtn') { hideShortcuts(); return; }
  if (t && typeof t.closest === 'function' && t.closest('#shortcutHintBtn')) { showShortcuts(); return; }
});
document.addEventListener('keydown', (e) => {
  try {
    const isMeta = e.ctrlKey || e.metaKey;
    if (!isMeta) {
      if (e.key === 'Escape') hideShortcuts();
      return;
    }
    const k = e.key.toLowerCase();
    if (k === '/') { e.preventDefault(); showShortcuts(); return; }
    if (k === 'enter') { e.preventDefault(); document.getElementById('calculateBtn')?.click(); return; }
    if (k === '1') { e.preventDefault(); switchTab('input'); return; }
    if (k === '2') { e.preventDefault(); switchTab('results'); return; }
    if (k === '3') { e.preventDefault(); switchTab('charts'); return; }
    if (k === '4') { e.preventDefault(); switchTab('param'); return; }
    if (k === '5') { e.preventDefault(); switchTab('info'); return; }
    if (k === '6') { e.preventDefault(); switchTab('saved'); return; }
    if (k === 'r') { e.preventDefault(); document.getElementById('resetBtn')?.click(); return; }
    if (k === 'e') { e.preventDefault(); document.getElementById('exportBtn')?.click(); return; }
    if (k === 's') { e.preventDefault(); document.getElementById('saveResultBtn')?.click(); return; }
    if (k === 'h') { e.preventDefault(); document.getElementById('generateHeatmapBtn')?.click(); return; }
  } catch (_) { /* no-op */ }
});

// Floating hint button
// Also bind directly if element exists on load (progressive enhancement)
const shortcutHintBtn = document.getElementById('shortcutHintBtn');
if (shortcutHintBtn) shortcutHintBtn.addEventListener('click', showShortcuts);

// =========================
// Parametric heatmaps (MWY/MAS)
// =========================

// Parametric DOM elements
const paramGas = document.getElementById('paramGas');
const paramSalt = document.getElementById('paramSalt');
const paramPressure = document.getElementById('paramPressure');
const paramTMin = document.getElementById('paramTMin');
const paramTMax = document.getElementById('paramTMax');
const paramTStep = document.getElementById('paramTStep');
const paramSMin = document.getElementById('paramSMin');
const paramSMax = document.getElementById('paramSMax');
const paramSStep = document.getElementById('paramSStep');
const paramSiiAlphaToggle = document.getElementById('paramSiiAlphaToggle');
const generateHeatmapBtn = document.getElementById('generateHeatmapBtn');
const resetHeatmapBtn = document.getElementById('resetHeatmapBtn');
const paramMasMin = document.getElementById('paramMasMin');
const paramMasMax = document.getElementById('paramMasMax');
const paramMasHideZero = document.getElementById('paramMasHideZero');
const paramT0FitMethodSelect = document.getElementById('paramT0FitMethod');
// Auto param pressure based on gas selection (median P)
function syncParamPressureForGas() {
  if (!paramGas || !paramPressure) return;
  const g = paramGas.value;
  let pts = [];
  if (g === 'Custom') pts = getCustomDataPoints();
  else if (gasData[g]?.data) pts = gasData[g].data;
  const pList = pts.map(p=>p[1]).filter(v=>isFinite(v));
  const pMed = pList.length ? median(pList) : 1.0;
  if (isFinite(pMed)) paramPressure.value = String(parseFloat(pMed.toFixed(3)));
}
if (paramGas) paramGas.addEventListener('change', syncParamPressureForGas);
// Initialize param pressure once after DOM ready
syncParamPressureForGas();

function linspace(start, end, step) {
  const out = [];
  if (step <= 0) return out;
  for (let v = start; v <= end + 1e-9; v += step) out.push(parseFloat(v.toFixed(6)));
  return out;
}

// Simple blue-yellow-red color scale for values in [vmin,vmax]
function colorBYR(v, vmin, vmax) {
  if (!isFinite(v)) return 'rgba(0,0,0,0)';
  const x = Math.max(0, Math.min(1, (v - vmin) / (vmax - vmin || 1)));
  // interpolate: 0 -> blue(14,165,233), 0.5 -> yellow(253,224,71), 1 -> red(239,68,68)
  let r, g, b;
  if (x < 0.5) {
    const t = x / 0.5; // 0..1
    // blue -> yellow
    r = Math.round(14 + t * (253 - 14));
    g = Math.round(165 + t * (224 - 165));
    b = Math.round(233 + t * (71 - 233));
  } else {
    const t = (x - 0.5) / 0.5; // 0..1
    // yellow -> red
    r = Math.round(253 + t * (239 - 253));
    g = Math.round(224 + t * (68 - 224));
    b = Math.round(71 + t * (68 - 71));
  }
  return `rgb(${r},${g},${b})`;
}

function destroyIfExists(chart) {
  if (chart) {
    try { chart.destroy(); } catch (e) {}
  }
}

function generateParametricHeatmaps() {
  if (!window.Chart || !window.Chart.registry || !window.Chart.registry.controllers.get('matrix')) {
    console.warn('Matrix chart plugin not available; cannot render heatmaps.');
  }
  const gasKey = paramGas.value;
  const saltKey = paramSalt.value;
  const pressure = parseFloat(paramPressure.value);
  const Tmin = parseFloat(paramTMin.value);
  const Tmax = parseFloat(paramTMax.value);
  const Tstep = parseFloat(paramTStep.value);
  const Smin = parseFloat(paramSMin.value);
  const Smax = parseFloat(paramSMax.value);
  const Sstep = parseFloat(paramSStep.value);
  if ([pressure,Tmin,Tmax,Tstep,Smin,Smax,Sstep].some(x => isNaN(x))) {
    alert('모든 파라메트릭 입력값을 올바르게 입력하세요.');
    return;
  }
  if (Tmin > Tmax || Smin > Smax || Tstep <= 0 || Sstep <= 0) {
    alert('입력 범위를 확인하세요. (최소 ≤ 최대, 간격 > 0)');
    return;
  }
  const useAlpha = !!(paramSiiAlphaToggle && paramSiiAlphaToggle.checked);
  const masMinNorm = Math.max(0, Math.min(1, parseFloat(paramMasMin?.value ?? '0')));
  const masMaxNorm = Math.max(0, Math.min(1, parseFloat(paramMasMax?.value ?? '1')));
  const hideZero = !!(paramMasHideZero && paramMasHideZero.checked);
  const range = Math.max(1e-12, masMaxNorm - masMinNorm);
  const beta = computeBetaCustom(gasKey, useAlpha);
  const gas = getGasObject(gasKey);
  const methodParam = paramT0FitMethodSelect ? paramT0FitMethodSelect.value : (t0FitMethodSelect ? t0FitMethodSelect.value : 'poly');
  const T0_op = getT0AtPressure(gasKey, pressure, methodParam);

  const temps = linspace(Tmin, Tmax, Tstep);
  const salts = linspace(Smin, Smax, Sstep);

  const dataMWY = [];
  const dataMAS = [];
  let minMWY = +Infinity, maxMWY = -Infinity;
  let minMAS = +Infinity, maxMAS = -Infinity;

  for (const sInit of salts) {
    const X_init = computeXFromSalinity(sInit, saltKey);
    const lnaw_init = computeLnawFromX(X_init);
    const dT_init_op = computeDeltaT(beta, lnaw_init, T0_op);
    for (const Tform of temps) {
      let mwyVal = 0;
      let masVal = sInit;
      let masIncr = 0;
      const dT_total = Math.max(0, T0_op - Tform);
      if (dT_total >= dT_init_op && dT_total < T0_op) {
        const lnawMas = computeLnawFromDelta(beta, dT_total, T0_op);
        if (isFinite(lnawMas) && lnawMas < 0) {
          const X_mas = solveXFromLnaw(lnawMas);
          const mas = computeSalinityFromX(X_mas, saltKey);
          if (isFinite(mas) && mas > 0) {
            masVal = mas;
            masIncr = Math.max(0, masVal - sInit);
            const mwy = ((mas - sInit) / mas) * 100;
            mwyVal = Math.max(0, Math.min(100, mwy));
          }
        }
      }
      // Swap axes: x = Initial Salinity (wt%), y = Formation Temperature (K)
      dataMWY.push({ x: sInit, y: Tform, v: mwyVal });
      const headroom = Math.max(0, 100 - sInit);
      const masNormRaw = headroom > 0 ? Math.max(0, Math.min(1, masIncr / headroom)) : 0;
      // Apply user color range [masMinNorm, masMaxNorm]
      const masNorm = Math.max(0, Math.min(1, (masNormRaw - masMinNorm) / range));
      dataMAS.push({ x: sInit, y: Tform, v: masNorm, mas: masVal, dmas: masIncr, vraw: masNormRaw });
      if (isFinite(mwyVal)) { minMWY = Math.min(minMWY, mwyVal); maxMWY = Math.max(maxMWY, mwyVal); }
      if (isFinite(masVal)) { minMAS = Math.min(minMAS, masVal); maxMAS = Math.max(maxMAS, masVal); }
    }
  }

  const ChartLib = window.Chart;
  // Destroy previous
  destroyIfExists(heatmapMwyChart);
  destroyIfExists(heatmapMasChart);

  try {
    const ctx1 = document.getElementById('heatmapMwy').getContext('2d');
    heatmapMwyChart = new ChartLib(ctx1, {
      type: 'matrix',
      data: { datasets: [{
        label: 'MWY',
        data: dataMWY,
        borderWidth: 0,
        backgroundColor: (c) => colorBYR(c.raw.v, 0, 100),
        // width by number of salinity bins (x), height by number of temp bins (y)
        width: ({chart}) => (chart.chartArea ? chart.chartArea.width / Math.max(1, salts.length) : 10),
        height: ({chart}) => (chart.chartArea ? chart.chartArea.height / Math.max(1, temps.length) : 10)
      }]},
      options: {
        responsive: true,
        maintainAspectRatio: false,
        aspectRatio: 1,
        scales: {
          x: { type: 'linear', min: Smin, max: Smax, title: { display: true, text: '초기 염도 (wt%)' } },
          y: { type: 'linear', min: Tmin, max: Tmax, reverse: false, title: { display: true, text: '형성 온도 (K)' } }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => `S=${items[0].raw.x.toFixed(2)} wt%, T=${items[0].raw.y.toFixed(2)} K`,
              label: (item) => `MWY=${item.raw.v.toFixed(2)} %`
            }
          }
        }
      }
    });

    // Draw MWY legend (0%..100%) using same BYR mapping
    drawLegend('legendMwy', (t) => colorBYR(t * 100, 0, 100), ['0%', '50%', '100%']);

    const ctx2 = document.getElementById('heatmapMas').getContext('2d');
    const masMaxForScale = Math.max(maxMAS, Smax); // retained for potential legends
    heatmapMasChart = new ChartLib(ctx2, {
      type: 'matrix',
      data: { datasets: [{
        label: 'MAS',
        data: dataMAS,
        borderWidth: 0,
        // Color by normalized ΔMAS (0..1). Hide zero region if requested.
        backgroundColor: (c) => {
          const r = c.raw;
          const eps = 1e-9;
          if (hideZero && (r.dmas ?? 0) <= eps) return 'rgba(0,0,0,0)';
          return colorBYR(r.v, 0, 1);
        },
        width: ({chart}) => (chart.chartArea ? chart.chartArea.width / Math.max(1, salts.length) : 10),
        height: ({chart}) => (chart.chartArea ? chart.chartArea.height / Math.max(1, temps.length) : 10)
      }]},
      options: {
        responsive: true,
        maintainAspectRatio: false,
        aspectRatio: 1,
        scales: {
          x: { type: 'linear', min: Smin, max: Smax, title: { display: true, text: '초기 염도 (wt%)' } },
          y: { type: 'linear', min: Tmin, max: Tmax, reverse: false, title: { display: true, text: '형성 온도 (K)' } }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => `S=${items[0].raw.x.toFixed(2)} wt%, T=${items[0].raw.y.toFixed(2)} K`,
              label: (item) => {
                const r = item.raw;
                const mas = (r.mas ?? 0).toFixed(2);
                const dmas = (r.dmas ?? 0).toFixed(2);
                const vraw = ((r.vraw ?? 0) * 100).toFixed(1);
                const vmapped = ((r.v ?? 0) * 100).toFixed(1);
                return `ΔMAS=${dmas} wt% (norm ${vraw}%, mapped ${vmapped}%), MAS=${mas} wt%`;
              }
            }
          }
        }
      }
    });

    // Draw MAS legend: mapped ΔMAS range [masMinNorm..masMaxNorm]
    const leftPct = (masMinNorm * 100).toFixed(0) + '%';
    const midPct = (((masMinNorm + masMaxNorm) / 2) * 100).toFixed(0) + '%';
    const rightPct = (masMaxNorm * 100).toFixed(0) + '%';
    drawLegend('legendMas', (t) => colorBYR(t, 0, 1), [leftPct, midPct, rightPct]);
  } catch (e) {
    console.error('Heatmap rendering failed:', e);
  }
}

  if (generateHeatmapBtn) {
    generateHeatmapBtn.addEventListener('click', () => {
      generateParametricHeatmaps();
      switchTab('param');
    });
  }
  if (resetHeatmapBtn) {
    resetHeatmapBtn.addEventListener('click', () => {
  if (paramGas) paramGas.value = 'CH4';
      if (paramSalt) paramSalt.value = 'NaCl';
      // paramPressure will be set by syncParamPressureForGas below
      if (paramTMin) paramTMin.value = '271';
      if (paramTMax) paramTMax.value = '285';
      if (paramTStep) paramTStep.value = '0.3';
      if (paramSMin) paramSMin.value = '0';
      if (paramSMax) paramSMax.value = '15';
      if (paramSStep) paramSStep.value = '0.3';
      if (paramSiiAlphaToggle) paramSiiAlphaToggle.checked = true;
      if (paramMasMin) paramMasMin.value = '0.05';
      if (paramMasMax) paramMasMax.value = '0.3';
      if (paramMasHideZero) paramMasHideZero.checked = true;
      destroyIfExists(heatmapMwyChart); heatmapMwyChart = null;
      destroyIfExists(heatmapMasChart); heatmapMasChart = null;
      syncParamPressureForGas();
    });
  }

// Draw heatmap legends
function drawLegend(canvasId, colorAt, labels) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  let widthCSS = rect.width || canvas.clientWidth || 300;
  let heightCSS = rect.height || parseFloat(getComputedStyle(canvas).height) || 36;
  // Ensure minimum CSS height for labels
  heightCSS = Math.max(32, heightCSS);
  canvas.width = Math.floor(widthCSS * dpr);
  canvas.height = Math.floor(heightCSS * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Layout constants
  const padX = 8;
  const padY = 6;
  const fontSize = 12;
  const labelGap = 4;
  const barH = Math.max(10, heightCSS - (padY * 2 + fontSize + labelGap));
  const barY = padY;
  const barW = Math.max(10, widthCSS - padX * 2);
  // Draw gradient
  for (let i = 0; i < barW; i++) {
    const t = i / Math.max(1, barW - 1);
    ctx.fillStyle = colorAt(t);
    ctx.fillRect(padX + i, barY, 1, barH);
  }
  // Border
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.strokeRect(padX, barY, barW, barH);
  // Labels
  ctx.fillStyle = '#374151';
  ctx.font = `${fontSize}px system-ui, -apple-system, Segoe UI, Roboto`;
  ctx.textBaseline = 'top';
  const positions = [0, 0.5, 1];
  const text = labels && labels.length === 3 ? labels : ['0', '0.5', '1'];
  positions.forEach((p, idx) => {
    const x = padX + p * barW;
    const txt = text[idx];
    const textW = ctx.measureText(txt).width;
    const tx = Math.max(padX, Math.min(padX + barW - textW, x - textW / 2));
    const ty = barY + barH + labelGap;
    ctx.fillText(txt, tx, ty);
  });
}
