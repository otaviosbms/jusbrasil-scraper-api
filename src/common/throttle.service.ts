import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Serializa navegações ao site alvo, esperando um intervalo mínimo (+ jitter)
 * entre cada uma. Se um desafio anti-bot foi visto recentemente, a espera
 * é esticada até o fim do cooldown antes de tentar de novo.
 */
@Injectable()
export class ThrottleService {
  private queue: Promise<void> = Promise.resolve();
  private cooldownUntil = 0;

  private readonly minDelayMs: number;
  private readonly maxJitterMs: number;
  private readonly cooldownMs: number;

  constructor(private readonly config: ConfigService) {
    this.minDelayMs = Number(this.config.get('SCRAPE_MIN_DELAY_MS')) || 12000;
    this.maxJitterMs = Number(this.config.get('SCRAPE_JITTER_MS')) || 8000;
    this.cooldownMs = Number(this.config.get('SCRAPE_COOLDOWN_MS')) || 5 * 60 * 1000;
  }

  reportChallengeSeen() {
    this.cooldownUntil = Date.now() + this.cooldownMs;
  }

  throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const now = Date.now();
      const waitForCooldown = Math.max(0, this.cooldownUntil - now);
      const jitter = Math.floor(Math.random() * this.maxJitterMs);
      await delay(Math.max(this.minDelayMs, waitForCooldown) + jitter);
      return fn();
    });
    // evita que uma rejeição quebre a fila para as próximas requisições
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
