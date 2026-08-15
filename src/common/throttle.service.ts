import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(ThrottleService.name);
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
    this.logger.warn(`Desafio anti-bot detectado — cooldown de ${this.cooldownMs}ms ativado`);
  }

  throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const now = Date.now();
      const waitForCooldown = Math.max(0, this.cooldownUntil - now);
      const jitter = Math.floor(Math.random() * this.maxJitterMs);
      const waitMs = Math.max(this.minDelayMs, waitForCooldown) + jitter;
      if (waitForCooldown > 0) {
        this.logger.warn(`Em cooldown: aguardando ${waitMs}ms antes da próxima navegação`);
      } else {
        this.logger.debug(`Aguardando ${waitMs}ms antes da próxima navegação`);
      }
      await delay(waitMs);
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
