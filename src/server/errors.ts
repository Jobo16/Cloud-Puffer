export class AppError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function publicError(error: unknown) {
  if (error instanceof AppError)
    return { code: error.code, message: error.message, status: error.status };
  return {
    code: "INTERNAL",
    message: "暂时无法完成，请稍后重试。",
    status: 500,
  };
}
