// Spam guards (v0.8.3): the log in cooldown and the confirmation email gap (src/net/spamGuard.js).
import { describe, it, expect } from 'vitest';
import { createAuthGuard, AUTH_GUARD } from '../src/net/spamGuard.js';

describe('log in / sign up spam guard', () => {
  const setup = () => { let t = 1e6; const clock = () => t; return { g: createAuthGuard(clock), tick: (ms) => { t += ms; } }; };

  it('the first few failed tries are free, then each wait doubles (5, 10, 20 s...) up to 60 s', () => {
    const { g, tick } = setup();
    for (let i = 0; i < AUTH_GUARD.FREE_TRIES - 1; i++) { g.failed(); expect(g.cooldownLeft()).toBe(0); }
    const waits = [];
    for (let i = 0; i < 6; i++) { g.failed(); waits.push(g.cooldownLeft()); tick(g.cooldownLeft() * 1000); expect(g.cooldownLeft()).toBe(0); }
    expect(waits).toEqual([5, 10, 20, 40, 60, 60]);
  });

  it('counts down, and a success clears it', () => {
    const { g, tick } = setup();
    for (let i = 0; i < AUTH_GUARD.FREE_TRIES; i++) g.failed();
    expect(g.cooldownLeft()).toBe(5);
    tick(2500);
    expect(g.cooldownLeft()).toBe(3);
    g.succeeded();
    expect(g.cooldownLeft()).toBe(0);
    g.failed();
    expect(g.cooldownLeft()).toBe(0); // free tries again
  });

  it('a confirmation email can be asked for again only after 30 s', () => {
    const { g, tick } = setup();
    expect(g.resendLeft()).toBe(0);
    g.resent();
    expect(g.resendLeft()).toBe(30);
    tick(29000);
    expect(g.resendLeft()).toBe(1);
    tick(1000);
    expect(g.resendLeft()).toBe(0);
  });
});
