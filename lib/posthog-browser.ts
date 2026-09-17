"use client";

type PostHogMethod = (...args: unknown[]) => unknown;

type PostHogQueue = unknown[] & {
  __SV?: number;
  __loaded?: boolean;
  _i?: unknown[][];
  people?: PostHogQueue;
  capture?: PostHogMethod;
  identify?: PostHogMethod;
  reset?: PostHogMethod;
  opt_in_capturing?: PostHogMethod;
  opt_out_capturing?: PostHogMethod;
  startSessionRecording?: PostHogMethod;
  stopSessionRecording?: PostHogMethod;
  [key: string]: unknown;
};

declare global {
  interface Window {
    posthog?: PostHogQueue;
  }
}

const POSTHOG_METHODS = [
  "capture",
  "register",
  "register_once",
  "register_for_session",
  "unregister",
  "unregister_for_session",
  "identify",
  "setPersonProperties",
  "group",
  "resetGroups",
  "reset",
  "get_distinct_id",
  "getGroups",
  "get_session_id",
  "get_session_replay_url",
  "alias",
  "set_config",
  "startSessionRecording",
  "stopSessionRecording",
  "sessionRecordingStarted",
  "opt_in_capturing",
  "opt_out_capturing",
  "has_opted_in_capturing",
  "has_opted_out_capturing",
  "clear_opt_in_out_capturing",
  "debug",
] as const;

let initQueued = false;

function queueMethod(target: PostHogQueue, method: string) {
  target[method] = (...args: unknown[]) => {
    target.push([method, ...args]);
  };
}

function ensurePostHogStub(): PostHogQueue {
  const existing = window.posthog;
  if (existing?.__loaded || existing?.__SV) return existing;

  const posthog = (existing ?? []) as PostHogQueue;
  posthog._i = posthog._i ?? [];
  posthog.people = posthog.people ?? ([] as unknown as PostHogQueue);

  for (const method of POSTHOG_METHODS) {
    if (typeof posthog[method] !== "function") queueMethod(posthog, method);
  }

  posthog.__SV = 1;
  window.posthog = posthog;
  return posthog;
}

export function initializePostHog() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token) return;

  const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  if (window.posthog?.__loaded) {
    window.posthog.opt_in_capturing?.();
    return;
  }

  if (initQueued) return;
  initQueued = true;

  const posthog = ensurePostHogStub();
  posthog._i?.push([
    token,
    {
      api_host: apiHost,
      defaults: "2026-05-30",
      capture_pageview: false,
      autocapture: true,
    },
    "posthog",
  ]);

  if (document.querySelector('script[data-msa="posthog"]')) return;

  const script = document.createElement("script");
  script.type = "text/javascript";
  script.crossOrigin = "anonymous";
  script.async = true;
  script.setAttribute("data-msa", "posthog");
  script.src = `${apiHost.replace(".i.posthog.com", "-assets.i.posthog.com")}/static/array.js`;
  script.onerror = () => {
    initQueued = false;
    console.log("PostHog analytics blocked or unavailable");
  };

  const firstScript = document.getElementsByTagName("script")[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    document.head.appendChild(script);
  }
}

export function capturePostHogEvent(name: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.posthog?.capture?.(name, properties);
}

export function capturePostHogPageView(
  path: string,
  title?: string,
  properties?: Record<string, unknown>,
) {
  if (typeof window === "undefined") return;
  window.posthog?.capture?.("$pageview", {
    $current_url: window.location.href,
    $pathname: window.location.pathname,
    $title: title,
    tracked_path: path,
    ...properties,
  });
}
