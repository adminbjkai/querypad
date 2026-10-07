import { test as base, type BrowserContext } from "@playwright/test";

export { expect } from "@playwright/test";
export type { Page, Route } from "@playwright/test";

const APP_URL = `http://localhost:${process.env.E2E_PORT ?? 3217}`;

/**
 * Spaces are saved on the server, shared by every browser. Give each test its own storage
 * namespace (a cookie the store API honours) so parallel tests never see each other's data.
 * Contexts that pass the same `ns` share a workspace, like two devices of one user.
 */
let targetUrl = APP_URL;

export async function isolate(context: BrowserContext, ns = `e2e${crypto.randomUUID().slice(0, 12)}`, url = targetUrl) {
  await context.addCookies([{ name: "querypad_ns", value: ns, url }]);
  return ns;
}

export const test = base.extend({
  // The cookie must be scoped to whatever host the tests target (a dev server or a deployed
  // build), otherwise every test silently runs in that server's real `default` namespace.
  context: async ({ context, baseURL }, provide) => {
    targetUrl = baseURL ?? APP_URL;
    await isolate(context);
    await provide(context);
  },
});
