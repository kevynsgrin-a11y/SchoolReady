/**
 * Circuit-breaker unit tests — config/flags.ts CircuitBreakerConfig
 * semantics with an injected clock (no real timers anywhere):
 * closed -> open after failureThreshold consecutive failures -> half_open
 * probe after cooldownSeconds -> closed on probe success / re-open on
 * probe failure.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_FLAGS } from "../config/flags";
import { CircuitBreaker } from "../src/ingestion/circuit-breaker";

const CONFIG = DEFAULT_FLAGS.circuitBreaker; // threshold 3, cooldown 300s

function makeClock(startMs = 1_700_000_000_000) {
  let now = startMs;
  return {
    now: () => now,
    advanceSeconds: (s: number) => {
      now += s * 1000;
    },
  };
}

describe("circuit breaker — closed state", () => {
  it("starts closed and allows requests", () => {
    const clock = makeClock();
    const cb = new CircuitBreaker(CONFIG, clock.now);
    expect(cb.state()).toBe("closed");
    expect(cb.allowRequest()).toBe(true);
  });

  it("stays closed below failureThreshold consecutive failures", () => {
    const clock = makeClock();
    const cb = new CircuitBreaker(CONFIG, clock.now);
    for (let i = 0; i < CONFIG.failureThreshold - 1; i++) cb.recordFailure();
    expect(cb.state()).toBe("closed");
    expect(cb.allowRequest()).toBe(true);
  });

  it("resets the consecutive count on success (failures must be consecutive)", () => {
    const clock = makeClock();
    const cb = new CircuitBreaker(CONFIG, clock.now);
    for (let i = 0; i < CONFIG.failureThreshold - 1; i++) cb.recordFailure();
    cb.recordSuccess();
    expect(cb.failureCount()).toBe(0);
    for (let i = 0; i < CONFIG.failureThreshold - 1; i++) cb.recordFailure();
    expect(cb.state()).toBe("closed");
  });
});

describe("circuit breaker — opening and cooldown", () => {
  it("opens at exactly failureThreshold consecutive failures", () => {
    const clock = makeClock();
    const cb = new CircuitBreaker(CONFIG, clock.now);
    for (let i = 0; i < CONFIG.failureThreshold; i++) cb.recordFailure();
    expect(cb.state()).toBe("open");
    expect(cb.allowRequest()).toBe(false);
  });

  it("stays open (blocking) for the full cooldown window", () => {
    const clock = makeClock();
    const cb = new CircuitBreaker(CONFIG, clock.now);
    for (let i = 0; i < CONFIG.failureThreshold; i++) cb.recordFailure();
    clock.advanceSeconds(CONFIG.cooldownSeconds - 1);
    expect(cb.state()).toBe("open");
    expect(cb.allowRequest()).toBe(false);
  });

  it("transitions to half_open (probe allowed) once cooldownSeconds elapse", () => {
    const clock = makeClock();
    const cb = new CircuitBreaker(CONFIG, clock.now);
    for (let i = 0; i < CONFIG.failureThreshold; i++) cb.recordFailure();
    clock.advanceSeconds(CONFIG.cooldownSeconds);
    expect(cb.state()).toBe("half_open");
    expect(cb.allowRequest()).toBe(true);
  });
});

describe("circuit breaker — half-open probe", () => {
  function openAndCooldown() {
    const clock = makeClock();
    const cb = new CircuitBreaker(CONFIG, clock.now);
    for (let i = 0; i < CONFIG.failureThreshold; i++) cb.recordFailure();
    clock.advanceSeconds(CONFIG.cooldownSeconds);
    return { clock, cb };
  }

  it("probe success closes the breaker and clears the failure count", () => {
    const { cb } = openAndCooldown();
    cb.recordSuccess();
    expect(cb.state()).toBe("closed");
    expect(cb.failureCount()).toBe(0);
    expect(cb.allowRequest()).toBe(true);
  });

  it("probe failure re-opens the breaker with a fresh cooldown", () => {
    const { clock, cb } = openAndCooldown();
    cb.recordFailure();
    expect(cb.state()).toBe("open");
    clock.advanceSeconds(CONFIG.cooldownSeconds - 1);
    expect(cb.state()).toBe("open");
    clock.advanceSeconds(1);
    expect(cb.state()).toBe("half_open");
  });

  it("cycles open -> half_open -> open across repeated failed probes", () => {
    const { clock, cb } = openAndCooldown();
    for (let cycle = 0; cycle < 3; cycle++) {
      cb.recordFailure(); // failed probe
      expect(cb.state()).toBe("open");
      clock.advanceSeconds(CONFIG.cooldownSeconds);
      expect(cb.state()).toBe("half_open");
    }
    cb.recordSuccess();
    expect(cb.state()).toBe("closed");
  });
});
