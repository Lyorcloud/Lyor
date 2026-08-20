export interface EngineLogEvent {
  readonly operation: string;
  readonly modId: string;
  readonly version: string;
  readonly gameId: string;
  readonly phase: string;
  readonly durationMs: number;
  readonly errorCode: string | null;
}

const SECRET_PATTERN = /(https?:\/\/\S+|[A-Za-z]:\\[^\s]+|\/(?:Users|home)\/[^\s]+|bearer\s+\S+|token[=:]\S+)/giu;

export const redactLogText = (value: string): string => value.replace(SECRET_PATTERN, '[redacted]');

export const sanitizeEngineLog = (event: EngineLogEvent): EngineLogEvent => ({
  operation: redactLogText(event.operation).slice(0, 80),
  modId: redactLogText(event.modId).slice(0, 120),
  version: redactLogText(event.version).slice(0, 80),
  gameId: redactLogText(event.gameId).slice(0, 120),
  phase: redactLogText(event.phase).slice(0, 40),
  durationMs: Math.max(0, Math.round(event.durationMs)),
  errorCode: event.errorCode === null ? null : redactLogText(event.errorCode).slice(0, 80),
});
