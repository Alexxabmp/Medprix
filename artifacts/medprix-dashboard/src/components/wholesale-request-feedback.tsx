export function WholesaleRequestFeedback({
  error,
  pending,
  busy,
  retry,
}: {
  error: string;
  pending: unknown;
  busy: boolean;
  retry: () => void;
}) {
  return (
    <>
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      {!!pending && !busy && (
        <div className="surface-card wholesale-notice" role="status">
          <p>
            A saved request needs confirmation. Retry it before recording
            another change.
          </p>
          <button
            className="button primary-action"
            disabled={busy}
            onClick={retry}
          >
            Retry saved request
          </button>
        </div>
      )}
    </>
  );
}
