export type FeedbackVariant = "success" | "warning" | "error";
export type Feedback = { message: string; variant: FeedbackVariant };

export function createFeedbackNotifier(
  show: (feedback: Feedback | null) => void,
  schedule: (callback: () => void, delay: number) => number = (
    callback,
    delay,
  ) => window.setTimeout(callback, delay),
  cancel: (timer: number | undefined) => void = (timer) =>
    window.clearTimeout(timer),
) {
  let timer: number | undefined;
  return {
    notify(value: string | Feedback) {
      cancel(timer);
      const feedback: Feedback =
        typeof value === "string"
          ? {
              message: value,
              variant:
                /fail|error|cannot|could not|unable|insufficient|less than|no more stock|select.*first|enter a|must be|only .*unit|empty cart|not recorded/i.test(
                  value,
                )
                  ? "error"
                  : "success",
            }
          : value;
      show({ ...feedback, message: safeError(feedback.message) });
      if (feedback.variant === "success")
        timer = schedule(() => show(null), 4000);
    },
    dispose() {
      cancel(timer);
    },
  };
}

export function safeError(
  value: unknown,
  fallback = "The request could not be completed. Please try again.",
): string {
  const error = value as {
    status?: number;
    message?: string;
    data?: { error?: string };
  } | null;
  if (error?.status === 401)
    return "Your session has expired. Sign in again, then refresh.";
  if (error?.status === 403)
    return "You do not have permission for this action.";
  if (error?.status && error.status >= 500) return fallback;
  const message =
    typeof value === "string" ? value : error?.data?.error || error?.message;
  if (
    !message ||
    message.length > 400 ||
    /[<>]|failed query|\b(select|insert|delete|update)\b.*\b(from|into|set)\b|stack|\bat\s+\S+\s*\(|constraint|drizzle|postgres|https?:|\/api\/|syntaxerror|failed to fetch|networkerror|load failed/i.test(
      message,
    )
  )
    return fallback;
  return message;
}

export async function readResponse(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(safeError({ status: response.status, data }, fallback));
  if (!data || typeof data !== "object") throw new Error(fallback);
  return data;
}

export function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
