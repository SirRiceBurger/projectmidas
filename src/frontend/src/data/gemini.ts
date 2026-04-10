// ─── GEMINI API KEY ───────────────────────────────────────────────────────────
// Priority: 1) VITE_GEMINI_API_KEY in src/frontend/.env
//           2) localStorage key 'midas_gemini_key' (set via the chat panel)
// To hardcode for testing: replace the body of getApiKey() with return 'YOUR_KEY'
// Get a free key at: https://aistudio.google.com/app/apikey
// ─────────────────────────────────────────────────────────────────────────────

export const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export function getApiKey(): string | null {
  if (import.meta.env.VITE_GEMINI_API_KEY) return import.meta.env.VITE_GEMINI_API_KEY as string;
  return localStorage.getItem('midas_gemini_key');
}

export function saveApiKey(key: string) {
  localStorage.setItem('midas_gemini_key', key);
}

export function clearApiKey() {
  localStorage.removeItem('midas_gemini_key');
}

export interface GeminiMessage {
  role: 'user' | 'model';
  text: string;
}

export async function callGemini(
  apiKey: string,
  systemPrompt: string,
  messages: GeminiMessage[],
): Promise<string> {
  const res = await fetch(`${GEMINI_BASE}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }],
      })),
      systemInstruction: { parts: [{ text: systemPrompt }] },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

const INTERVENTION_ESTIMATOR_SYSTEM = `You are an intervention estimator for MIDAS, a sustainability planning platform for Australian properties.
Given a plain-English description of a sustainability intervention (revegetation, solar, water management, etc.),
estimate these fields for a 20-year planning horizon on an Australian property:
- expected_emissions: POSITIVE number — total tCO2e sequestered or avoided over 20 years. Higher = better. Beneficial interventions always produce a positive value (e.g. 120 for revegetation, 180 for solar). NEVER negative.
- expected_cost: total upfront capital cost in AUD (number)
- cvar_loss: 95th-percentile tail financial loss in AUD — typically 20–60% of expected_cost, reflecting cost overruns or failure scenarios. Must be less than expected_cost in almost all cases.
- maintenance_cost_annual: annual maintenance in AUD (number)
- resilience_score: 0–1 ecological/climate resilience contribution (number)
- success_probability: 0–1 likelihood of achieving planned outcomes (number)
- feasibility_rules: array of {field, operator, threshold, effect, reason} — field is one of: canopy, bare_soil, slope, aspect, drainage, shade, uv, bushfire, flood, drought, proximity. operator is one of: >, <, >=, <=, ==. effect is always "infeasible". reason is a short string. Only include rules where the intervention is genuinely physically blocked (e.g. solar on a north-facing roof, revegetation on 40-degree slopes). Do not add rules that merely reduce effectiveness.
Respond ONLY with a valid JSON object with exactly these keys. No markdown fences, no explanation.`;

export interface InterventionEstimate {
  expected_emissions: number;
  expected_cost: number;
  cvar_loss: number;
  maintenance_cost_annual: number;
  resilience_score: number;
  success_probability: number;
  feasibility_rules: { field: string; operator: string; threshold: number; effect: string; reason: string }[];
}

export async function estimateIntervention(
  apiKey: string,
  nameAndDescription: string,
): Promise<InterventionEstimate> {
  const raw = await callGemini(apiKey, INTERVENTION_ESTIMATOR_SYSTEM, [
    { role: 'user', text: nameAndDescription },
  ]);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned) as InterventionEstimate;
}
