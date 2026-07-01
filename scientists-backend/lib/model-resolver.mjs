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

// Like effectiveModel(), but lets the client pin a specific installed tag (the
// model-picker dropdown) instead of the per-language auto-pick. Falls back to
// the normal effective model when nothing is requested, Ollama is unreachable,
// or the requested tag isn't actually installed -- so a stale/unpulled choice
// never breaks the chat, it just silently reverts to auto.
export function resolveRequestedModel(lang, requested) {
  const base = effectiveModel(lang);
  if (!requested) return base;
  const { available, installed } = installedModels();
  if (available && installed.includes(requested)) {
    return { ...base, name: requested };
  }
  return base;
}
