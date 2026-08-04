/**
 * Per-source circuit breaker implementing config/flags.ts
 * CircuitBreakerConfig semantics exactly:
 *
 *   closed     — normal operation. failureThreshold consecutive failures
 *                trip the breaker open (success resets the count).
 *   open       — no requests are allowed for cooldownSeconds.
 *   half_open  — derived state once cooldownSeconds have elapsed: one probe
 *                is allowed. Probe success closes the breaker; probe failure
 *                re-opens it with a fresh cooldown.
 *
 * The clock is injected (epoch ms) so tests never use real timers.
 */
import type { CircuitBreakerConfig } from "../../config/flags";
import type { CircuitState } from "../contracts/source";
import type { Clock } from "./types";

export class CircuitBreaker {
  private consecutiveFailures = 0;
  private openedAtMs: number | null = null;

  constructor(
    private readonly config: CircuitBreakerConfig,
    private readonly clock: Clock,
  ) {}

  state(): CircuitState {
    if (this.openedAtMs === null) return "closed";
    const elapsedMs = this.clock() - this.openedAtMs;
    return elapsedMs >= this.config.cooldownSeconds * 1000 ? "half_open" : "open";
  }

  /** closed and half_open (the probe) may attempt a request; open may not. */
  allowRequest(): boolean {
    return this.state() !== "open";
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openedAtMs = null;
  }

  recordFailure(): void {
    const wasProbe = this.state() === "half_open";
    this.consecutiveFailures += 1;
    if (wasProbe || this.consecutiveFailures >= this.config.failureThreshold) {
      // Trip (or re-trip after a failed probe) with a fresh cooldown window.
      this.openedAtMs = this.clock();
    }
  }

  failureCount(): number {
    return this.consecutiveFailures;
  }

  openedAt(): number | null {
    return this.openedAtMs;
  }
}
