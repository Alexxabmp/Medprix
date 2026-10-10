// Global API fetch interceptor to attach Bearer token and include credentials
if (typeof window !== "undefined" && !(window as any).__medprix_fetch_intercepted__) {
  (window as any).__medprix_fetch_intercepted__ = true;
  const originalFetch = window.fetch;

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.startsWith("/api") || url.includes("/api/")) {
      const nextInit: RequestInit = { ...(init || {}) };
      nextInit.credentials = nextInit.credentials || "include";

      const headers = new Headers(nextInit.headers);
      const token = localStorage.getItem("medprix-token");
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      nextInit.headers = headers;

      return originalFetch.call(this, input, nextInit);
    }

    return originalFetch.call(this, input, init);
  };
}

export {};
