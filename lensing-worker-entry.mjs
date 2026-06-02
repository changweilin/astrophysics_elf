/*
 * Web Worker entry for the gravitational-lensing renderer (Phase 6, P6.2).
 *
 * Loaded as a module worker by lensing.js (window.KNLensing). It only wires the
 * add-only renderer's message boundary to this worker's global scope; all logic
 * lives in full-physics/lensing-worker.mjs.
 */

import { attachLensingWorkerGlobal } from "./full-physics/lensing-worker.mjs";

attachLensingWorkerGlobal();
