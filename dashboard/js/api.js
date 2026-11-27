/**
 * Gridence HTTP client with a strict one-at-a-time FIFO queue and 15 s timeout.
 * W2-owned module. All server endpoints use POST per docs/DASHBOARD_API.md.
 */

import { REQUEST_TIMEOUT_MS, getApiBaseUrl, setApiBaseUrl } from "./config.js";
import { checkClimatologyResponse, checkHealthResponse, checkMetaResponse, checkSimulateResponse } from "./validate.js";

export const MODEL_HEADER = "X-MonsoonTwin-Model";
export const FALLBACK_HEADER = "X-MonsoonTwin-Fallback";

export class ApiError extends Error {
  constructor({ message, status = 0, kind = "network", endpoint = "", detail = null }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
    this.endpoint = endpoint;
    this.detail = detail;
  }
}

export function classifyHttpStatus(status) {
  if (status === 400) return "bad_json";
  if (status === 422) return "validation";
  if (status === 503) return "unavailable";
  if (status === 405) return "method";
  return "http";
}

export class RequestQueue {
  constructor() {
    this._queue = [];
    this._active = false;
    this._listeners = new Set();
    this._currentTaskName = null;
  }

  get inFlight() {
    return this._active;
  }

  get pendingCount() {
    return this._queue.length;
  }

  get currentTaskName() {
    return this._currentTaskName;
  }

  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _notify() {
    const snapshot = {
      inFlight: this._active,
      pendingCount: this._queue.length,
      currentTaskName: this._currentTaskName,
    };
    for (const listener of this._listeners) {
      try {
        listener(snapshot);
      } catch {
        // Keep queue notifications resilient.
      }
    }
  }

  enqueue(taskName, fn) {
    return new Promise((resolve, reject) => {
      this._queue.push({ taskName, fn, resolve, reject });
      this._notify();
      this._drain();
    });
  }

  async _drain() {
    if (this._active || this._queue.length === 0) return;
    this._active = true;
    while (this._queue.length > 0) {
      const item = this._queue.shift();
      this._currentTaskName = item.taskName;
      this._notify();
      try {
        const result = await item.fn();
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      }
    }
    this._currentTaskName = null;
    this._active = false;
    this._notify();
  }
}

export class MonsoonApiClient {
  constructor({ baseUrl = getApiBaseUrl(), timeoutMs = REQUEST_TIMEOUT_MS, fetchImpl = null } = {}) {
    this._baseUrl = baseUrl;
    this._timeoutMs = timeoutMs;
    this._fetch = fetchImpl || ((...args) => window.fetch(...args));
    this.queue = new RequestQueue();
  }

  getBaseUrl() {
    return this._baseUrl;
  }

  setBaseUrl(url) {
    this._baseUrl = setApiBaseUrl(url);
    return this._baseUrl;
  }

  async _sendPost(endpoint, body, timeoutMs = this._timeoutMs) {
    const url = `${this._baseUrl}${endpoint}`;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const init = {
      method: "POST",
      signal: controller.signal,
      headers: {},
    };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    let response;
    let rawText;
    try {
      response = await this._fetch(url, init);
      rawText = await response.text();
    } catch (err) {
      if (timedOut || err?.name === "AbortError") {
        throw new ApiError({
          message: `Request to ${endpoint} timed out after ${Math.round(timeoutMs / 1000)} s.`,
          status: 0,
          kind: "timeout",
          endpoint,
        });
      }
      throw new ApiError({
        message: `Network error reaching ${url}. Verify the server is running and CORS is reachable.`,
        status: 0,
        kind: "network",
        endpoint,
        detail: err?.message || String(err),
      });
    } finally {
      clearTimeout(timer);
    }

    let parsed = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      const kind = classifyHttpStatus(response.status);
      const serverMsg = parsed && typeof parsed.error === "string" ? parsed.error : response.statusText || "Request failed";
      throw new ApiError({
        message: `HTTP ${response.status} on ${endpoint}: ${serverMsg}`,
        status: response.status,
        kind,
        endpoint,
        detail: parsed,
      });
    }

    if (parsed === null) {
      throw new ApiError({
        message: `Invalid JSON response from ${endpoint}.`,
        status: response.status,
        kind: "bad_json",
        endpoint,
      });
    }
    if (endpoint === "/simulate") {
      // Which model answered THIS request (null if the server does not say).
      parsed.servedBy = {
        model: response.headers?.get?.(MODEL_HEADER) ?? null,
        fallback: response.headers?.get?.(FALLBACK_HEADER) ?? null,
      };
    }
    return parsed;
  }

  async _checked(promise, endpoint, check) {
    const value = await promise;
    const problem = check(value);
    if (problem) {
      throw new ApiError({
        message: `Unusable response from ${endpoint}: ${problem}`,
        status: 200,
        kind: "bad_response",
        endpoint,
      });
    }
    return value;
  }

  post(endpoint, body, { timeoutMs = this._timeoutMs } = {}) {
    return this.queue.enqueue(`POST ${endpoint}`, () => this._sendPost(endpoint, body, timeoutMs));
  }

  health() {
    return this._checked(this.post("/health"), "/health", checkHealthResponse);
  }

  meta() {
    return this._checked(this.post("/meta"), "/meta", checkMetaResponse);
  }

  simulate(payload) {
    return this._checked(this.post("/simulate", payload), "/simulate", (r) => checkSimulateResponse(r, payload.steps));
  }

  climatology({ doy_sincos, steps }) {
    return this._checked(this.post("/climatology", { doy_sincos, steps }), "/climatology",
      (r) => checkClimatologyResponse(r, steps));
  }
}

export const api = new MonsoonApiClient();
