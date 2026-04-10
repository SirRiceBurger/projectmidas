# MIDAS

MIDAS is a decision-support platform for sustainability planning at the property scale. It was developed as a submission to the [Earth Prize](https://www.earthprize.org/) competition.

The core idea: environmental planning is a capital allocation problem. Most tools give landowners a list of possible interventions, such as to plant trees, install solar, or restore wetlands with little guidance on which combination is actually worth doing given cost, risk, and climate uncertainty. MIDAS changes that.

---

## What it does

MIDAS analyses a property using drone imagery, weather data, hazard maps, and site economics. It then recommends a portfolio of sustainability interventions that maximises carbon outcomes and ecological resilience while staying within a budget and managing financial risk.

The back-end engine, **Mercury**, runs a stochastic simulation across 10,000 climate and economic scenarios, scores each intervention on a risk-adjusted basis, and selects the optimal portfolio using CVaR-constrained optimisation, which are the same class of techniques used in financial portfolio management.

The front-end gives users a map-centric interface to explore their site, inspect zone-level data, run scenarios, and understand why specific interventions were recommended or excluded.

---

## Where Midas V1.1 is 

Midas is currently in development stage (Development paused as of April 2026). However, V1.1 is an up-and-running prototype of the main goals of MIDAS, showcasing some of the main features such as the stochastic optimisation process. In further development. It will be absolutely necessary to incorporate more robust data ingestion (at the moment, the engine is fed static JSON files which only align with one specific schema), amongst other things.

---

## Getting started

### Prerequisites

- Python 3.10+
- Node.js 18+

### Back-end

```bash
# From repo root
pip install -r requirements.txt
uvicorn src.api.main:app --reload
# API available at http://localhost:8000
```

### Front-end

```bash
cd src/frontend
npm ci
npm run dev
# UI available at http://localhost:5173
```

Both servers must be running for the full UI to work. The frontend calls the API at `http://localhost:8000` by default (override with `VITE_API_URL`).

You will be prompted to enter your Gemini API key when starting the app. This is intentional such that a non-technical user can still use the product with ease.

## Running tests

```bash
# From repo root
python -m pytest tests/ -v
```

Tests use a canonical synthetic dataset as ground truth. The integration test is `tests/test_pipeline.py`.

