// In-memory conversation store. Sessions hold the running message history plus
// the carried-over summary memory produced when context is compressed. Nothing
// is persisted to disk -- restarting the backend clears all sessions, which is
// the intended privacy posture for a personal local deployment.

import { randomUUID } from 'node:crypto';
import { config } from '../config.mjs';

const sessions = new Map(); // id -> session

function makeSession(scientistId, lang) {
  const now = Date.now();
  return {
    id: randomUUID(),
    scientistId,
    lang,
    summary: '',        // carried-over memory from past summarizations
    messages: [],       // [{ role: 'user' | 'assistant', content }]
    lastPromptTokens: 0,
    summaryCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function createSession(scientistId, lang) {
  evictIfNeeded();
  const s = makeSession(scientistId, lang);
  sessions.set(s.id, s);
  return s;
}

export function getSession(id) {
  return id ? sessions.get(id) || null : null;
}

// Get an existing session or create a fresh one. If the caller switches
// scientist or language on an existing id, reset the history but keep the id so
// the frontend's reference stays valid.
export function getOrCreateSession(id, scientistId, lang) {
  let s = getSession(id);
  if (!s) {
    s = makeSession(scientistId, lang);
    s.id = id || s.id;
    sessions.set(s.id, s);
    evictIfNeeded();
    return s;
  }
  if (s.scientistId !== scientistId) {
    // Different persona -> start a clean dialogue under the same id.
    s.scientistId = scientistId;
    s.messages = [];
    s.summary = '';
    s.lastPromptTokens = 0;
    s.summaryCount = 0;
  }
  s.lang = lang;
  return s;
}

export function appendMessage(session, role, content) {
  session.messages.push({ role, content });
  session.updatedAt = Date.now();
}

// Replace the running history with the summary memory (the "restart" step).
export function restartWithSummary(session, summary) {
  session.summary = summary;
  session.messages = [];
  session.lastPromptTokens = 0;
  session.summaryCount += 1;
  session.updatedAt = Date.now();
}

export function deleteSession(id) {
  return sessions.delete(id);
}

export function sessionCount() {
  return sessions.size;
}

// Evict the least-recently-updated sessions when over the soft cap.
function evictIfNeeded() {
  if (sessions.size < config.maxSessions) return;
  const ordered = [...sessions.values()].sort((a, b) => a.updatedAt - b.updatedAt);
  const toRemove = sessions.size - config.maxSessions + 1;
  for (let i = 0; i < toRemove && i < ordered.length; i++) {
    sessions.delete(ordered[i].id);
  }
}
