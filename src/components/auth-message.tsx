export function AuthMessage({ error, success, notice }: { error?: string; success?: string; notice?: string }) {
  if (!error && !success && !notice) return null;
  const message = error || success || notice;
  const className = error
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : "border-teal-200 bg-teal-50 text-teal-800";
  return <p role={error ? "alert" : "status"} className={`mt-5 rounded-md border p-3 text-sm leading-5 ${className}`}>{message}</p>;
}
