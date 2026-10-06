export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  channel: string;
  message: string;
  data?: Record<string, unknown>;
  at: Date;
}

/**
 * Per-turn log sink (§42). Entries are collected in memory and surfaced through the debug
 * API, which is enough for the MVP and keeps the engine free of a logging dependency.
 */
export class TurnLogger {
  private readonly entries: LogEntry[] = [];

  constructor(private readonly echo = process.env.SCENARIA_LOG === "1") {}

  log(level: LogLevel, channel: string, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = { level, channel, message, data, at: new Date() };
    this.entries.push(entry);
    if (this.echo) {
      console[level === "debug" ? "log" : level](`[${channel}] ${message}`, data ?? "");
    }
  }

  debug = (channel: string, message: string, data?: Record<string, unknown>) =>
    this.log("debug", channel, message, data);
  info = (channel: string, message: string, data?: Record<string, unknown>) =>
    this.log("info", channel, message, data);
  warn = (channel: string, message: string, data?: Record<string, unknown>) =>
    this.log("warn", channel, message, data);
  error = (channel: string, message: string, data?: Record<string, unknown>) =>
    this.log("error", channel, message, data);

  drain(): LogEntry[] {
    return [...this.entries];
  }
}
