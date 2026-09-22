# AI Observatory

A static research dashboard for training compute, estimated final-run training cost, accelerator specifications, reported hardware quantities, and publication activity in the supplied Epoch AI snapshots. It is a visualization and analysis layer, not an original source or a measure of national compute capacity.

The five tabs retain the existing SVG dashboard design. The active application is `index.html` plus `app.js`; styles remain inline in `index.html`. There is no build step, server-side application, or H100 cost simulator.

Charts fit their cards and render without drawing/fade animations or chart scrollbars. Use `+` to inspect dense data at 2× or 4× magnification, then drag to pan (touch dragging is supported while zoomed). `−` zooms out; Reset or Escape restores the full view. Focus a zoomed chart and use arrow keys to pan with the keyboard. Changing filters, tabs, or viewport size resets the view. These controls change only the view, not the underlying data or calculations.

## Run and validate

Serve the repository over HTTP, for example `python -m http.server 8000`, then open `http://localhost:8000`. Opening the HTML as a local file will not reliably load the CSVs. PapaParse 5.4.1 and fonts load from CDNs; network access is required for the CSV parser.

Validation requires Node.js and Python 3. Browser checks additionally use the pinned Playwright development dependency:

```sh
npm ci
npx playwright install chromium
npm run check
npm test
npm test -- --browser
```

The browser test starts and stops its own local HTTP server and headless Chromium. It checks all tabs, source loading, filters, empty and single-year windows, chart geometry, tooltips, modal, mobile width, theme, and browser errors. Screenshots go to ignored `artifacts/`. `npm run test:browser` runs just that check. `python scripts/profile_data.py` reports complete column profiles, source hashes, coverage, and key observations without changing data.

## Sources and coverage

| Local file | Origin | Rows | Earliest date | Latest date |
| --- | --- | ---: | --- | --- |
| `data/frontier_ai_models.csv` | [Epoch AI Notable AI Models](https://epoch.ai/data/notable-ai-models), selected model snapshot | 137 | 1950-07-02 | 2025-07-09 |
| `data/ml_hardware.csv` | [Epoch AI ML Hardware](https://epoch.ai/data/machine-learning-hardware) | 175 | 2008-06-16 | 2026-03-11 |

These are publication and hardware release dates, not retrieval dates or last-update timestamps. All model records have dates; 14 hardware records lack release dates and cannot enter time-filtered charts. The initial display window is 2012 through the latest dataset year (currently 2026); the slider can reach the full historical coverage and select a single year. Model data do not extend into 2026. Coverage labels are calculated independently from the full snapshots and do not change with filters.

All 137 supplied model rows currently have `Frontier model = True`. The application does not globally apply that filter, and this file must not be mistaken for the complete Epoch Notable Models database. A future snapshot with non-frontier rows will affect general model charts but not the three explicitly frontier-only charts.

## Chart populations and calculations

All charts honor the global date window. The domain selection controls only the compute scatter; chip-type controls only the hardware tab; clicking a treemap tile filters only the organization maximum-compute chart.

| Chart | Records and transformation |
| --- | --- |
| Overview / recent table | All dated supplied records in the window; latest five model publications; frontier KPI counts explicit TRUE values |
| Compute scatter | All supplied models with positive training FLOP; selected primary domains; optional least-squares fit of log10(FLOP) against elapsed years |
| Annual output | All supplied model records, counted by publication year and primary domain; ChatGPT milestone is November 2022 |
| Domain distribution | All supplied models with positive FLOP; Gaussian density of log10(FLOP), quartiles and median; at least four records per domain; each violin normalized to equal maximum width |
| Annual maximum cost | All supplied models with positive Epoch cost; maximum per publication year, optionally Confident only; no future projection |
| Hardware throughput | Positive tensor FP16/BF16 specifications, running records within the window, grouped as NVIDIA, Google, and all other suppliers combined |
| Hardware launch price | Highest positive listed release price per manufacturer/year; top six manufacturers ranked by peak listed price within the window; lines connect available years |
| Organization treemap | All supplied model records; tile area is count, not compute. Exact country aliases, deduplicated country names, and a Multiple countries group |
| Top 15 organizations | Maximum positive training FLOP per recorded organization string, not summed capacity; winning model and confidence in tooltip |
| Weight availability | All supplied model records; Open, Partially Open, Closed, Unknown; counts and percentages; unknown status never becomes Closed |
| Frontier publication participation | Explicit `Frontier model = TRUE`; unique non-missing organization strings per year; joint organization strings remain a single group; no smoothing or affordability inference |
| Observed Frontier Training Cluster Scale by Year | Wide annual bar chart using the largest explicit frontier `Hardware quantity` per publication year, with positive integer quantity, valid date, and identifiable accelerator units in `Training hardware` or explicit GPU wording in `Training data center`; CPU and unspecified-unit quantities excluded |
| Model Demand vs Best Available Chip, Indexed Growth | Wide two-line chart showing annual maximum frontier training FLOP and annual maximum chip tensor FP16/BF16 FLOP/s, each normalized to its own common-base-year maximum; the visual comparison is dimensionless |

For indexed growth, `model_index(y) = model_annual_max(y) / model_annual_max(base)` and `chip_index(y) = chip_annual_max(y) / chip_annual_max(base)`. Both share one logarithmic, dimensionless axis. The base is 2016 when both series have observations, otherwise the earliest common year. Here it is **2017** because the hardware tensor field has no 2016 entries. The base is fixed from the full snapshots, even when the displayed window changes. Annual maxima are not cumulative records: they may decline. Missing years are not filled, and lines break across missing years. The 2026 chip point does not imply a 2026 model observation or declining industry-wide hardware capability.

Accelerator quantity is reported or estimated deployed hardware, not H100-equivalent compute and not a minimum required cluster. It is not performance-normalized across generations. There are 42 eligible records in the full snapshot and 40 in the default window. Grok 3 has 80,000 H100s (Likely) in the cited approximately three-month training estimate. Grok 4 has 200,000 GPUs (Speculative); its data-center note describes a reinforcement learning cluster and leaves the chip model unspecified. These stages and quantities are not interchangeable.

## Confidence, costs, and external context

Epoch labels are retained: Confident, Likely, Speculative, and Unknown. They are source assessments, not independently validated error bounds. The full snapshot has 74 Confident, 32 Likely, 29 Speculative, and 2 Unknown records. GPT-4.5 is Likely; Grok 4 is Speculative. Compute, cost, cluster, and organization-maximum tooltips retain the labels. Aggregate counts include all confidence levels; distributions explicitly note mixed confidence.

The cost chart uses **`Training compute cost (2023 USD)` directly**, with 66 positive observations. It does not calculate a new cost model, convert all runs into H100 equivalents, or mix `Training compute cost (cloud)` and `Training compute cost (upfront)` with the amortized-cost field. Final-run compute estimates exclude full R&D costs, researcher compensation, failed experiments, data acquisition, and other non-final-run costs. Source assumptions still differ across records.

External context is explicitly separated from chart calculations:

- [Cottier et al. 2024, revised 2025, arXiv v2](https://arxiv.org/abs/2405.21015v2): historical annual cost growth of 2.4× since 2016, **90% CI: 2.0× to 2.9×**, and a conditional published extrapolation above $1B around 2027. The dashboard draws no forward projection and does not re-anchor the paper’s claim on Grok 4.
- [Stanford AI Index 2024](https://hai.stanford.edu/ai-index/2024-ai-index-report/research-and-development): roughly $190M estimated Gemini Ultra training cost, separate from the local Epoch value of about $30.7M for `Gemini 1.0 Ultra`. The external estimate is not plotted or presented as a disclosed final bill. These estimates are not interchangeable methodologies.
- [OpenAI’s launch announcement](https://openai.com/index/chatgpt/): ChatGPT launched November 30, 2022. This is a contextual milestone, not a model-output calculation.

The prior imprecise SemiAnalysis market-share attribution and unsupported inference-price, efficiency, and geopolitical statistics were removed. SemiAnalysis may still appear in original CSV source notes; no new market-share statistic is calculated here.

## Data types and limitations

CSV fields arrive as strings. Numeric parsing accepts complete finite decimal/scientific notation; blank, malformed, or nonfinite values become null, never zero. Dates accept valid year, year-month, or ISO date strings; incomplete dates use the start of their stated period. Current nonblank date fields contain full dates. Log charts exclude nonpositive values. `Open model weights?` is the actual column name: Yes = Open, Partially/Partial = Partially Open, No = Closed, everything else = Unknown. The full snapshot has 63 Unknown (46.0%), 57 Closed, and 17 Open; the default window has 19 Unknown out of 90 (21.1%).

Active model fields: `Model`, `Publication date`, `Organization`, `Training compute (FLOP)`, `Domain`, `Parameters`, `Model accessibility`, `Training compute cost (2023 USD)`, `Country (of organization)`, `Open model weights?`, `Frontier model`, `Confidence`, `Training compute estimation method`, `Estimated over 1e25 FLOP`, `Hardware quantity`, `Training hardware`, `Training compute notes`, `Training data center`, `Link`. Numerical fields are FLOP, parameters, cost, and quantity; dates are parsed dates; frontier is true/false/null; the remainder are categorical or free text (the over-1e25 flag is retained as nullable source text).

Active hardware fields: `Hardware name`, `Manufacturer`, `Type`, `Release date`, `Release price (USD)`, `Tensor-FP16/BF16 performance (FLOP/s)`, `Memory (bytes)`, `Memory bandwidth (byte/s)`, `TDP (W)`, `Energy efficiency`, `Process size (nm)`. Name/manufacturer/type are text, release date is a parsed date, and the rest are nullable numbers. Only tensor FP16/BF16 is used for throughput; ordinary FP16 is not a fallback. The profiling script lists every source column, including unused fields.

Coverage is selective and uneven; the latest years are partial, publication dates differ from training dates, and model variants can share a training run. Hardware quantity units and training stages vary, source notes can be ambiguous, and numeric presence does not establish independent reliability. Peak throughput is not achieved performance. Price observations are sparse, nominal, and configuration-dependent. Organization counts, weight access, and compute are not direct evidence of affordability, capability, market share, national capacity, or effects of export controls. Use original source notes and independent corroboration for strong research claims. See [DASHBOARD_AUDIT_FIXES.md](DASHBOARD_AUDIT_FIXES.md) for the complete repair record and formulas.
