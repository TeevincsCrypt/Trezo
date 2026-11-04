export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const fail = (code: string, message: string, status = 400, extra?: Record<string, unknown>): never => {
  throw new GameError(code, message, status, extra);
};
