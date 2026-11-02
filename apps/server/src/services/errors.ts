export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, "not_found", `${what} not found`);
export const unauthorized = (msg = "invalid or missing token") => new HttpError(401, "unauthorized", msg);
export const badRequest = (code: string, msg: string) => new HttpError(400, code, msg);
export const conflict = (code: string, msg: string) => new HttpError(409, code, msg);
