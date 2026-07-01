// Effective-model resolver.
//
// The config names the *preferred* (strongest) model per language. This module
// reconciles that against what is actually pulled into Ollama, so the page works
// the moment you start it -- even before the big preferred models are downloaded
// -- and silently upgrades to the preferred model once it appears. No config
// edit is ever required to switch between "running now" and "running best".

import { config, resolveModel } from '../config.mjs';
import { ping } from './ollama.mjs';

let installed = [];   // exact tags reported by Ollama, e.g. 'qwen2.5:7b'
let available = false; // is the Ollama server reachable?

function baseName(n) {
  return String(n).split(':')[0].toLowerCase();
}

// An installed tag satisfies a candidate if it matches exactly or shares the
// base name (so 'qwen2.5' matches an installed 'qwen2.5:7b').
function findInstalled(candidate) {
  const c = String(candidate).toLowerCase();
  const cb = baseName(candidate);
  return installed.find((name) => {
    const n = name.toLowerCase();
    return n === c || baseName(n) === cb;
  }) || null;
}

export async function refreshInstalled() {
  const res = await ping();
  available = !!res.ok;
  installed = available && Array.isArray(res.models) ? res.models : [];
  return { available, installed };
}

export function installedModels() {
  return { available, installed: installed.slice() };
}

// Pick the model tag to actually use for a language.
//   status: 'preferred' | 'fallback' | 'missing' | 'unknown'
export function pickModel(lang) {
  const key = lang === 'en' ? 'en' : 'zh';
  const preferred = config.ollama.models[key].name;

  // Ollama unreachable -> trust the configured name (health will flag it).
  if (!available) return { name: preferred, status: 'unknown', preferred };

  const candidates = [preferred, ...(config.ollama.modelFallbacks[key] || [])];
  for (const cand of candidates) {
    const hit = findInstalled(cand);
    if (hit) {
      const isPreferred = baseName(hit) === baseName(preferred);
      return { name: hit, status: isPreferred ? 'preferred' : 'fallback', preferred };
    }
  }
  // Nothing installed matched -> keep preferred so the chat error is explicit.
  return { name: preferred, status: 'missing', preferred };
}

// Reconcile an arbitrary configured model name against what is actually pulled,
// returning the installed tag (e.g. 'name:q4_k_m') when the base name matches.
// Falls back to the name unchanged when Ollama is unreachable or nothing matches
// so any resulting error still names the configured model explicitly.
export function effectiveName(name) {
  if (!name || !available) return name;
  return findInstalled(name) || name;
}

// Build the effective per-language model object the handlers actually run with:
// resolveModel()'s configured settings, but with BOTH the chat model and the
// summary model reconciled to installed tags. Without this the summary model
// (which defaults to the preferred name) can request an untagged ':latest' that
// was never pulled, so chat works while summarization 404s.
export function effectiveModel(lang) {
  const cfg = resolveModel(lang);
  const picked = pickModel(cfg.lang);
  const m = config.ollama.models[cfg.lang] || config.ollama.models[config.ollama.defaultLang];
  // Explicit summary model -> reconcile it; otherwise reuse the effective chat model.
  const summaryModel = m.summaryModel ? effectiveName(m.summaryModel) : picked.name;
  return { ...cfg, name: picked.name, summaryModel };
}

// The model-picker pin, shared by every device talking to this backend (not
// per-browser). This backend fronts a single local Ollama instance -- reached
// from the same person's phone (Tailscale) and desktop alike -- and Ollama can
// only keep one model loaded at a time. Without a shared pin, two devices with
// different local preferences (or simply different `lang`) would each nudge
// Ollama toward a different model on every turn, forcing a slow reload back
// and forth. Set by any request that explicitly names a model; read by every
// request (including ones that don't) so they all converge on the same choice.
let globalOverride = '';

export function getGlobalOverride() {
  return globalOverride;
}

// Like effectiveModel(), but resolves the shared pin instead of the per-
// language auto-pick when one is active. `requested`:
//   - a string (the model-picker dropdown): sets the shared pin to that tag
//     (or clears it back to auto with '' / an uninstalled tag) for every
//     device, then resolves with it.
//   - undefined (no opinion from this caller): leaves the shared pin alone
//     and just resolves with whatever it currently is.
// A stale/unpulled pin never breaks the chat -- it silently reverts to auto.
export function resolveRequestedModel(lang, requested) {
  const base = effectiveModel(lang);
  const { available, installed } = installedModels();
  if (requested !== undefined) {
    globalOverride = requested && available && installed.includes(requested) ? requested : '';
  }
  if (globalOverride && available && installed.includes(globalOverride)) {
    return { ...base, name: globalOverride };
  }
  return base;
}
