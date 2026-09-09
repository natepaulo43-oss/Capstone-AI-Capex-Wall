# AI Observatory — The AI Capex Wall

An interactive tracker of frontier AI training compute, cost, and hardware from 2012 to 2025, built on the Epoch AI Notable Models and ML Hardware datasets.

**Live: https://capstone-ai-capex-wall.vercel.app/**

## Why I built it

"AI is expensive" is a headline; it's not a number a stakeholder can act on. This tool turns published training-compute figures (FLOP) into an actual dollar estimate — GPU cost, power cost, datacenter overhead, hardware utilization — with every assumption exposed as a slider, so an executive can see exactly which lever moves the number, instead of taking a compute-cost claim on faith.

## Tech Stack

Vanilla JS, D3.js for visualization, PapaParse for CSV loading — no framework, no build step, deployed as a static site on Vercel.

## Key technical decisions

- **"Stakeholder-proof math"**: the cost model converts training compute (FLOP) into dollars using a documented, source-cited chain — H100 reference hardware specs, 30% model FLOP utilization (a defensible real-world midpoint, not peak theoretical), and a 5-year amortization schedule — every constant in the model is commented with its source.
- **Reactive sliders, not fixed assumptions**: cost-per-GPU, power cost per kWh, and PUE (datacenter overhead) are all live sliders, because the honest answer to "what does this cost" depends on assumptions a reader should be able to interrogate, not a single baked-in number.
- **Real published datasets, not synthetic data**: built on Epoch AI's Notable Models and ML Hardware datasets — the same figures researchers cite — rather than invented numbers.

## Live

**https://capstone-ai-capex-wall.vercel.app/**
