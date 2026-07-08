export class AppError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export class ConfigError extends AppError {
  constructor(message: string) {
    super("config_error", message, 500);
    this.name = "ConfigError";
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return Response.json(
      { error: error.code, message: error.message },
      { status: error.status },
    );
  }

  const message = error instanceof Error ? error.message : "不明なエラーです。";
  return Response.json({ error: "internal_error", message }, { status: 500 });
}
