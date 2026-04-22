// ================================================================
// THE AI CAPEX WALL — app.js
// ================================================================
// This is the core data engine and visualization controller.
// Architecture:
//   1. CONSTANTS  — Reference hardware specs, layout margins.
//   2. STATE      — Reactive slider values and loaded datasets.
//   3. DATA LAYER — PapaParse CSV loading + cleaning.
//   4. COST MODEL — The "Stakeholder-Proof Math" function.
//   5. D3 CHART   — bindChart() creates the SVG once; updateChart()
//                    re-renders data points whenever sliders move.
//   6. CONTROLS   — Slider event wiring + formatting helpers.
//   7. BOOTSTRAP  — init() ties everything together on page load.
// ================================================================

// ────────────────────────────────────────────────────────────────
// 1. CONSTANTS — Reference Hardware: NVIDIA H100 SXM5 80 GB
// ────────────────────────────────────────────────────────────────
// These values come directly from the ml_hardware.csv dataset and
// NVIDIA's published datasheet for the H100 SXM5 variant.

const H100 = {
  // Tensor-core BF16 throughput (FLOP per second).
  // Source: ml_hardware.csv row "NVIDIA H100 SXM5 80GB" → 989.4 TFLOP/s
  flopsPerSecond: 989.4e12,

  // Thermal Design Power in watts.
  // Source: same row → TDP 700 W
  tdpWatts: 700,

  // Model Floating-point Utilization (MFU).
  // Real-world large-model training typically achieves 25-40% of peak.
  // We use 30% as a conservative, defensible midpoint for C-Suite audiences.
  utilization: 0.30,

  // Useful life for hardware amortization (in hours).
  // Industry standard: 5-year depreciation schedule ≈ 43,800 hours.
  // This converts a one-time GPU purchase price into a per-hour cost rate.
  amortizationHours: 5 * 365.25 * 24, // ≈ 43,830 hours
};

// ────────────────────────────────────────────────────────────────
// 2. REACTIVE STATE
// ────────────────────────────────────────────────────────────────
// `sliders` holds the current value of each executive assumption.
// These are mutated by slider event listeners and read by the
// cost calculation function on every update cycle.

const state = {
  sliders: {
    costPerGPU:      30000,
    powerCostPerKWh: 0.07,
    pueOverhead:     1.4,
  },
  // Cleaned model data (array of objects) — populated after CSV load
  models: [],
};

// ────────────────────────────────────────────────────────────────
// 3. DATA LAYER — Asynchronous CSV Loading with PapaParse
// ────────────────────────────────────────────────────────────────

/**
 * loadCSV — Wraps PapaParse in a Promise for async/await usage.
 * PapaParse handles edge cases like quoted fields with embedded
 * newlines (which both of our CSVs contain in their "Notes" columns).
 *
 * @param {string} url  - Relative path to the CSV file.
 * @returns {Promise<Array<Object>>}  - Array of row objects.
 */
function loadCSV(url) {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,       // Fetch the file via XHR
      header: true,         // Use the first row as column keys
      skipEmptyLines: true, // Ignore blank lines in the CSV
      dynamicTyping: true,  // Auto-convert numeric strings to Numbers
      complete: (results) => resolve(results.data),
      error: (err) => reject(err),
    });
  });
}

/**
 * cleanModelData — Filters and transforms the raw frontier_ai_models
 * CSV into a minimal array of objects the chart needs.
 *
 * Why filter?  Many rows have missing FLOP values or unparseable dates.
 * Showing incomplete data would undermine credibility with executives.
 *
 * @param {Array<Object>} raw - Raw PapaParse output rows.
 * @returns {Array<Object>}   - Cleaned model objects.
 */
function cleanModelData(raw) {
  return raw
    .map((row) => {
      // ── Extract the columns we care about ──────────────────
      const flop = parseFloat(row["Training compute (FLOP)"]);
      const dateStr = row["Publication date"];
      const model = (row["Model"] || "").trim();
      const org = (row["Organization"] || "").trim();

      // ── Parse the publication date ─────────────────────────
      // The CSV stores dates as ISO-ish strings like "2025-07-09".
      // D3's time scale needs real Date objects.
      const date = dateStr ? new Date(dateStr) : null;

      return { model, org, flop, date };
    })
    .filter((d) => {
      // ── Discard rows with missing or invalid data ──────────
      // A row must have:  a positive FLOP count AND a valid date.
      return (
        d.flop > 0 &&
        !isNaN(d.flop) &&
        d.date instanceof Date &&
        !isNaN(d.date.getTime()) &&
        d.model.length > 0
      );
    })
    // ── Sort chronologically for a clean left→right visual flow ──
    .sort((a, b) => a.date - b.date);
}

// ────────────────────────────────────────────────────────────────
// 4. COST MODEL — "Stakeholder-Proof Math"
// ────────────────────────────────────────────────────────────────
//
// CONCEPT:
//   Total Cost  =  Hardware Amortization Cost  +  Energy Cost
//
// STEP-BY-STEP:
//   1. Compute total GPU-hours needed:
//        gpuHours = totalFLOP / (flopsPerGPU × utilization × 3600)
//      The ×3600 converts FLOP/s to FLOP/hour.
//
//   2. Hardware amortization cost:
//        hwCost = gpuHours × (costPerGPU / amortizationHours)
//      This spreads the one-time GPU purchase over its useful life,
//      then charges only for the hours actually consumed.
//
//   3. Energy cost:
//        energyCost = gpuHours × (tdpWatts / 1000) × PUE × $/kWh
//      TDP is per-GPU power draw; PUE accounts for cooling/infra
//      overhead; dividing by 1000 converts W to kW.
//
// NOTE: This normalizes ALL models to H100-equivalent GPU-hours,
// regardless of what hardware they were actually trained on.
// This is an intentional simplification for the MVP — it answers
// the question "What would it cost to train this TODAY on H100s?"
// ────────────────────────────────────────────────────────────────

/**
 * calculateCost — Returns the estimated total training cost in USD
 * for a model with the given FLOP requirement, based on the current
 * slider assumptions.
 *
 * @param {number} totalFLOP       - Training compute in FLOP.
 * @param {Object} assumptions     - Current slider values.
 * @param {number} assumptions.costPerGPU      - USD per GPU.
 * @param {number} assumptions.powerCostPerKWh - USD per kilowatt-hour.
 * @param {number} assumptions.pueOverhead     - Power Usage Effectiveness.
 * @returns {number}               - Estimated cost in USD.
 */
function calculateCost(totalFLOP, assumptions) {
  const { costPerGPU, powerCostPerKWh, pueOverhead } = assumptions;

  // Step 1: Total GPU-hours required
  // Effective throughput per GPU = peak FLOP/s × MFU
  const effectiveFLOPsPerSecond = H100.flopsPerSecond * H100.utilization;
  // Convert seconds → hours (×3600), then divide total FLOP by hourly rate
  const gpuHours = totalFLOP / (effectiveFLOPsPerSecond * 3600);

  // Step 2: Hardware amortization cost
  // Per-hour GPU cost = purchase price / total useful-life hours
  const perHourGPUCost = costPerGPU / H100.amortizationHours;
  const hardwareCost = gpuHours * perHourGPUCost;

  // Step 3: Energy cost
  // Per-GPU power in kW = TDP (watts) / 1000
  // Multiply by PUE to account for cooling, networking, etc.
  const powerPerGPU_kW = (H100.tdpWatts / 1000) * pueOverhead;
  const energyCost = gpuHours * powerPerGPU_kW * powerCostPerKWh;

  // Total = hardware amortization + energy
  return hardwareCost + energyCost;
}

// ────────────────────────────────────────────────────────────────
// 5. D3 VISUALIZATION — Scatter Plot with Logarithmic Y-Axis
// ────────────────────────────────────────────────────────────────

// Chart dimensions — we'll compute these dynamically from the container.
let svg, xScale, yScale, xAxis, yAxis, chartWidth, chartHeight;

// Margins follow D3's margin convention:
// https://observablehq.com/@d3/margin-convention
const margin = { top: 32, right: 40, bottom: 56, left: 80 };

/**
 * bindChart — One-time setup: creates the SVG, axes, gridlines,
 * and axis labels inside #chart-container.
 *
 * This is called once after data loads. Subsequent slider changes
 * only call updateChart(), which transitions existing elements.
 */
function bindChart() {
  const container = document.getElementById("chart-container");
  const rect = container.getBoundingClientRect();

  // ── Compute the drawable area (total minus margins) ────────
  chartWidth  = rect.width  - margin.left - margin.right;
  chartHeight = rect.height - margin.top  - margin.bottom;

  // ── Create the root SVG and a <g> offset by the margins ────
  // D3's margin convention: the <g> acts as the "plot area" origin.
  svg = d3
    .select("#chart-container")
    .append("svg")
    .attr("width",  rect.width)
    .attr("height", rect.height)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // ── X Scale: Time (linear mapping of publication dates) ────
  // d3.scaleTime maps Date objects to pixel positions.
  const dateExtent = d3.extent(state.models, (d) => d.date);
  // Add a small padding (30 days) so edge points aren't clipped
  const datePad = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
  xScale = d3
    .scaleTime()
    .domain([
      new Date(dateExtent[0].getTime() - datePad),
      new Date(dateExtent[1].getTime() + datePad),
    ])
    .range([0, chartWidth]);

  // ── Y Scale: Logarithmic (base 10) for cost ───────────────
  // Costs span many orders of magnitude ($1K → $10B+), so a log
  // scale is essential. Without it, 99% of points would pile up
  // at the bottom and the chart would be unreadable.
  //
  // We calculate initial costs to set the domain, then update it
  // on every slider change in updateChart().
  yScale = d3.scaleLog().range([chartHeight, 0]);

  // ── X Axis ─────────────────────────────────────────────────
  xAxis = svg
    .append("g")
    .attr("class", "axis x-axis")
    .attr("transform", `translate(0,${chartHeight})`);

  // ── Y Axis ─────────────────────────────────────────────────
  yAxis = svg.append("g").attr("class", "axis y-axis");

  // ── Horizontal Gridlines ───────────────────────────────────
  // Subtle dashed lines that help the eye track from a point
  // to the Y axis. We use a separate <g> so we can style it
  // independently from the axis ticks.
  svg
    .append("g")
    .attr("class", "grid y-grid");

  // ── Axis Labels ────────────────────────────────────────────
  // X-axis label
  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("text-anchor", "middle")
    .attr("x", chartWidth / 2)
    .attr("y", chartHeight + margin.bottom - 10)
    .text("Publication Date");

  // Y-axis label (rotated)
  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("text-anchor", "middle")
    .attr("transform", `rotate(-90)`)
    .attr("x", -chartHeight / 2)
    .attr("y", -margin.left + 16)
    .text("Estimated Training Cost (USD)");

  // ── Initial render with current slider values ──────────────
  updateChart();
}

/**
 * updateChart — Recalculates costs with current slider values,
 * updates the Y-axis domain, and transitions all data points
 * to their new positions.
 *
 * This is the function wired to every slider's "input" event.
 * D3's General Update Pattern is used here:
 *   ENTER  → new data points get created (first render only)
 *   UPDATE → existing points transition to new Y positions
 *   EXIT   → removed points fade out (not expected here)
 */
function updateChart() {
  // ── Step A: Recalculate the cost for every model ───────────
  // We attach the computed cost directly to each data object so
  // D3 can read it during the bindings below.
  state.models.forEach((d) => {
    d.cost = calculateCost(d.flop, state.sliders);
  });

  // ── Step B: Update Y-scale domain to fit new cost range ────
  // d3.extent returns [min, max]. We clamp the lower bound to
  // at least $1 to avoid log(0) errors on the scale.
  const costExtent = d3.extent(state.models, (d) => d.cost);
  const yMin = Math.max(1, costExtent[0] * 0.3);  // 30% padding below
  const yMax = costExtent[1] * 3;                  // 3x padding above
  yScale.domain([yMin, yMax]);

  // ── Step C: Redraw the Y axis with clean currency formatting ─
  // formatCostTick converts raw numbers into "$1K", "$1M", "$1B"
  // labels so executives can read them at a glance.
  yAxis
    .transition()
    .duration(300)
    .call(
      d3
        .axisLeft(yScale)
        .ticks(8, "~s") // ~8 ticks, SI-prefix format as fallback
        .tickFormat(formatCostTick)
    );

  // ── Step D: Redraw the X axis (rarely changes, but just in case) ─
  xAxis.call(
    d3
      .axisBottom(xScale)
      .ticks(d3.timeYear.every(1))
      .tickFormat(d3.timeFormat("%Y"))
  );

  // ── Step E: Update horizontal gridlines ────────────────────
  const gridLines = svg
    .select(".y-grid")
    .transition()
    .duration(300)
    .call(
      d3
        .axisLeft(yScale)
        .ticks(8)
        .tickSize(-chartWidth)
        .tickFormat("")
    );

  // ── Step F: DATA JOIN — Bindmodel data to circle elements ──
  //
  // D3's data join is the heart of declarative data visualization.
  // .data() binds our array to DOM elements; the second argument
  // is a "key function" that tells D3 which datum corresponds to
  // which circle (using the model name as a unique ID).
  //
  // The join returns three selections:
  //   enter  → data with no existing circle (first render)
  //   update → data with a matching circle (slider changes)
  //   exit   → circles with no matching data (if data shrinks)
  const dots = svg.selectAll(".dot").data(state.models, (d) => d.model);

  // ── ENTER: Create new circles for first-time data points ───
  // Initial radius of 0 lets us animate them "popping in".
  const dotsEnter = dots
    .enter()
    .append("circle")
    .attr("class", "dot")
    .attr("cx", (d) => xScale(d.date))
    .attr("cy", (d) => yScale(d.cost))
    .attr("r", 0)
    // ── Tooltip event listeners ──────────────────────────────
    // mouseenter/mouseleave show/hide the tooltip <div>.
    .on("mouseenter", handleMouseEnter)
    .on("mousemove", handleMouseMove)
    .on("mouseleave", handleMouseLeave);

  // Animate entrance: grow from r=0 to final radius
  dotsEnter
    .transition()
    .duration(500)
    .attr("r", (d) => radiusScale(d.flop));

  // ── UPDATE: Transition existing circles to new Y positions ─
  // This is what makes the slider feel "live" — points glide
  // smoothly to new vertical positions as assumptions change.
  dots
    .transition()
    .duration(300)
    .ease(d3.easeCubicOut)
    .attr("cy", (d) => yScale(d.cost));

  // ── EXIT: Fade out any circles whose data was removed ──────
  // (Unlikely in this app, but included for correctness.)
  dots.exit().transition().duration(200).attr("r", 0).remove();

  // ── Step G: Update KPI summary bar ─────────────────────────
  updateKPIs();
}

/**
 * radiusScale — Maps a model's FLOP count to a circle radius.
 * Larger models get slightly larger dots, giving a visual cue
 * about relative compute scale without overwhelming the chart.
 *
 * We use a sqrt scale because circle area (πr²) should be
 * proportional to the data value, not the radius.
 */
function radiusScale(flop) {
  // Map FLOP range to radius range [3px, 12px]
  const minR = 3, maxR = 12;
  const flopExtent = d3.extent(state.models, (d) => d.flop);
  // Use log scale since FLOP values span many orders of magnitude
  const logMin = Math.log10(flopExtent[0]);
  const logMax = Math.log10(flopExtent[1]);
  const logVal = Math.log10(flop);
  // Normalize to [0, 1] then map to radius range
  const t = logMax > logMin ? (logVal - logMin) / (logMax - logMin) : 0.5;
  return minR + t * (maxR - minR);
}

// ────────────────────────────────────────────────────────────────
// 5b. TOOLTIP HANDLERS
// ────────────────────────────────────────────────────────────────

const tooltip = document.getElementById("tooltip");

function handleMouseEnter(event, d) {
  // Build tooltip HTML with model details + calculated cost
  tooltip.innerHTML = `
    <div class="tt-model">${d.model}</div>
    <div class="tt-org">${d.org}</div>
    <div class="tt-cost">${formatUSD(d.cost)}</div>
    <div class="tt-detail">
      FLOP: ${d.flop.toExponential(2)}<br/>
      GPU-hours: ${formatNumber(d.cost > 0
        ? d.flop / (H100.flopsPerSecond * H100.utilization * 3600)
        : 0
      )}
    </div>
  `;
  tooltip.classList.add("visible");
}

function handleMouseMove(event) {
  // Position tooltip near the cursor, offset slightly
  tooltip.style.left = event.clientX + 16 + "px";
  tooltip.style.top  = event.clientY - 10 + "px";
}

function handleMouseLeave() {
  tooltip.classList.remove("visible");
}

// ────────────────────────────────────────────────────────────────
// 6. FORMATTING HELPERS
// ────────────────────────────────────────────────────────────────

/**
 * formatCostTick — Converts raw USD numbers into executive-friendly
 * labels: "$100K", "$10M", "$1B", "$100B", etc.
 *
 * Used on the Y-axis ticks. The thresholds are chosen so labels
 * never exceed 5 characters, keeping the axis clean.
 */
function formatCostTick(value) {
  if (value >= 1e12) return "$" + (value / 1e12).toFixed(0) + "T";
  if (value >= 1e9)  return "$" + (value / 1e9).toFixed(0)  + "B";
  if (value >= 1e6)  return "$" + (value / 1e6).toFixed(0)  + "M";
  if (value >= 1e3)  return "$" + (value / 1e3).toFixed(0)  + "K";
  return "$" + value.toFixed(0);
}

/**
 * formatUSD — Full-precision currency formatting for tooltips.
 * Uses Intl.NumberFormat for proper comma grouping.
 */
function formatUSD(value) {
  if (value >= 1e9) {
    return "$" + (value / 1e9).toFixed(2) + " B";
  }
  if (value >= 1e6) {
    return "$" + (value / 1e6).toFixed(2) + " M";
  }
  if (value >= 1e3) {
    return "$" + (value / 1e3).toFixed(1) + " K";
  }
  return "$" + value.toFixed(0);
}

/**
 * formatNumber — Comma-separated number for GPU-hours display.
 */
function formatNumber(n) {
  return Math.round(n).toLocaleString("en-US");
}

// ────────────────────────────────────────────────────────────────
// 6b. KPI BAR UPDATES
// ────────────────────────────────────────────────────────────────

/**
 * updateKPIs — Refreshes the three summary metrics above the chart.
 * Called on every slider change alongside the chart update.
 */
function updateKPIs() {
  const costs = state.models.map((d) => d.cost).sort((a, b) => a - b);
  const count = costs.length;

  document.getElementById("kpi-count").textContent = count;

  if (count > 0) {
    // Median: middle value (or average of two middle values)
    const mid = Math.floor(count / 2);
    const median =
      count % 2 === 0 ? (costs[mid - 1] + costs[mid]) / 2 : costs[mid];

    document.getElementById("kpi-median").textContent = formatUSD(median);
    document.getElementById("kpi-max").textContent = formatUSD(
      costs[count - 1]
    );
  }
}

// ────────────────────────────────────────────────────────────────
// 7. SLIDER CONTROL WIRING
// ────────────────────────────────────────────────────────────────

/**
 * wireSliders — Attaches "input" event listeners to each <input>.
 *
 * On every slider drag:
 *   1. Read the new value and update state.sliders.
 *   2. Update the displayed value text next to the slider.
 *   3. Call updateChart() to re-render with new assumptions.
 *
 * We use the "input" event (not "change") so the chart updates
 * in real-time as the user drags, not just on release.
 */
function wireSliders() {
  // ── Cost Per GPU slider ────────────────────────────────────
  const gpuSlider = document.getElementById("costPerGPU");
  const gpuVal    = document.getElementById("costPerGPU-val");
  gpuSlider.addEventListener("input", () => {
    const v = parseFloat(gpuSlider.value);
    state.sliders.costPerGPU = v;
    // Format: "$30,000"
    gpuVal.textContent = "$" + v.toLocaleString("en-US");
    updateChart();
  });

  // ── Power Cost slider ──────────────────────────────────────
  const powerSlider = document.getElementById("powerCostPerKWh");
  const powerVal    = document.getElementById("powerCostPerKWh-val");
  powerSlider.addEventListener("input", () => {
    const v = parseFloat(powerSlider.value);
    state.sliders.powerCostPerKWh = v;
    // Format: "$0.070"
    powerVal.textContent = "$" + v.toFixed(3);
    updateChart();
  });

  // ── PUE Overhead slider ────────────────────────────────────
  const pueSlider = document.getElementById("pueOverhead");
  const pueVal    = document.getElementById("pueOverhead-val");
  pueSlider.addEventListener("input", () => {
    const v = parseFloat(pueSlider.value);
    state.sliders.pueOverhead = v;
    // Format: "1.40"
    pueVal.textContent = v.toFixed(2);
    updateChart();
  });
}

// ────────────────────────────────────────────────────────────────
// 8. RESPONSIVE RESIZE HANDLER
// ────────────────────────────────────────────────────────────────

/**
 * handleResize — Destroys and rebuilds the chart SVG when the
 * window is resized. Debounced to avoid excessive redraws.
 */
let resizeTimer;
function handleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    // Remove the old SVG
    d3.select("#chart-container svg").remove();
    // Re-create with new dimensions
    bindChart();
  }, 250);
}

// ────────────────────────────────────────────────────────────────
// 9. BOOTSTRAP — init()
// ────────────────────────────────────────────────────────────────
// This is the entry point. It:
//   1. Shows a loading state.
//   2. Loads both CSVs in parallel.
//   3. Cleans the model data.
//   4. Initializes the D3 chart.
//   5. Wires up slider event listeners.
//   6. Attaches the window resize handler.

async function init() {
  const container = document.getElementById("chart-container");
  container.innerHTML =
    '<div class="loading-message">Loading datasets…</div>';

  try {
    // ── Load both CSVs concurrently ──────────────────────────
    // We load the hardware CSV too for potential future use (Phase 2)
    // but the MVP only needs the model CSV + hardcoded H100 specs.
    const [modelsRaw, hardwareRaw] = await Promise.all([
      loadCSV("data/frontier_ai_models.csv"),
      loadCSV("data/ml_hardware.csv"),
    ]);

    console.log(
      `[AI CapEx Wall] Loaded ${modelsRaw.length} model rows, ${hardwareRaw.length} hardware rows.`
    );

    // ── Clean and store the model data ───────────────────────
    state.models = cleanModelData(modelsRaw);
    console.log(
      `[AI CapEx Wall] ${state.models.length} models passed validation.`
    );

    // ── Clear loading state and build the chart ──────────────
    container.innerHTML = "";
    bindChart();

    // ── Wire up interactive controls ─────────────────────────
    wireSliders();

    // ── Handle browser resize ────────────────────────────────
    window.addEventListener("resize", handleResize);
  } catch (err) {
    console.error("[AI CapEx Wall] Failed to load data:", err);
    container.innerHTML =
      '<div class="loading-message">Error loading data. Check console.</div>';
  }
}

// ── Kick everything off when the DOM is ready ────────────────
document.addEventListener("DOMContentLoaded", init);
