// Reading a recipe from a website. Server-only: the page is fetched here,
// not in the browser, so other sites' rules on sharing data don't get in the way.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { type Imported, recipeFromPage } from "@/lib/galley";

// Loopback, private, link-local and unique-local addresses: never fetch those.
const INTERNAL = /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|::$|::ffff:|f[cd]|fe[89ab])/i;

async function publicAddress(url: URL): Promise<boolean> {
  if (!/^https?:$/.test(url.protocol)) return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  return addresses.length > 0 && addresses.every((a) => !INTERNAL.test(a));
}

/** The recipe at a link, or a reason it couldn't be read. */
export async function importRecipe(link: string): Promise<Imported | string> {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return "That doesn't look like a web link.";
  }
  try {
    // Follow redirects by hand, so each hop is checked too.
    for (let hop = 0; hop < 5; hop++) {
      if (!(await publicAddress(url))) return "That link can't be read.";
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; FirstMate recipe import)", accept: "text/html" },
      });
      const next = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && next) {
        url = new URL(next, url);
        continue;
      }
      if (!response.ok) return `The website said no (${response.status}). Some sites block this; try copying the recipe in by hand.`;
      const recipe = recipeFromPage(await response.text(), url.toString());
      return recipe ?? "Couldn't find a recipe on that page. Try the page with the recipe itself, or copy it in by hand.";
    }
    return "That link kept redirecting.";
  } catch {
    return "Couldn't reach that website. Check the link and try again.";
  }
}
