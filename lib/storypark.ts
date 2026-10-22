// Reading a Storypark "Export portfolio", unzipped: stories_index.html holds
// every story (notes_index.html the notes), with the photos in Files/. Each
// story is a <div class="story">: the title and date in its <h1>, the text,
// the photos (PDF pages come as photos too), the comments, then who added it
// and its learning tags. Avatars are images too, so they're left out, and so
// are photos in comments: there, other families post their own children.
// Pure, so it's testable; the import button does the files.

export type Story = { title: string; date: string | null; body: string; images: string[]; videos: number };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** HTML as plain text: one line per paragraph, entities decoded. */
export function textOf(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENTITIES[e.toLowerCase()] ?? all),
    )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

const dayOf = (html: string) => html.match(/datetime="(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
const shortDay = (day: string) => `${+day.slice(8)} ${SHORT_MONTHS[+day.slice(5, 7) - 1]} ${day.slice(0, 4)}`;

/** One story. */
function readOne(html: string): Story {
  // The learning tags' popovers carry a page of escaped HTML each; none of it is the story.
  const story = html.replace(/\sdata-content='[^']*'/g, "");
  const [top, meta = ""] = story.split('<div class="meta">');
  const heading = top.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? "";
  const firstComment = top.search(/<li class="comment"/);
  const content = (firstComment < 0 ? top : top.slice(0, firstComment)).replace(/<h1>[\s\S]*?<\/h1>/, "");

  const comments = [...top.matchAll(/<li class="comment"[\s\S]*?<\/li>/g)].flatMap(([c]) => {
    const who = textOf(c.match(/class="comment-author[^"]*">([\s\S]*?)<em/)?.[1] ?? "");
    const said = textOf(c.match(/class="comment-text"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "").replace(/\n/g, " ");
    const on = dayOf(c);
    return said ? [`${who || "Someone"}${on ? `, ${shortDay(on)}` : ""}: ${said}`] : [];
  });
  const by = textOf(meta.match(/Story added by:[\s\S]*?<small>([\s\S]*?)<\/small>/)?.[1] ?? "");
  const tags = [...meta.matchAll(/class="label[^"]*tag-popover"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => textOf(m[1])).filter(Boolean);

  return {
    title: textOf(heading.split("<small>")[0]).replace(/\n/g, " ").slice(0, 300) || "School update",
    date: dayOf(heading),
    body: [
      textOf(content).replace(/\n/g, "\n\n"),
      by && `Added by ${by}`,
      tags.length > 0 && `Learning tags: ${tags.join(" · ")}`,
      comments.length > 0 && `Comments\n${comments.join("\n")}`,
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 20000),
    // The story's photos and each video's still frame (the videos themselves aren't kept).
    images: [...(top.replace(/<li class="comment"[\s\S]*?<\/li>/g, "")).matchAll(/<img\b([^>]*)>|\bposter="([^"]+)"/g)].flatMap(([, img, poster]) =>
      poster ? [poster] : img.includes("sp-c-avatar__img") ? [] : (img.match(/\bsrc="([^"]+)"/)?.slice(1) ?? []),
    ),
    videos: (story.match(/js-video-block/g) ?? []).length,
  };
}

/**
 * Every story in an export page. ponytail: notes_index.html is read the same
 * way, but no export with notes has been seen yet; check one when it comes.
 */
export function readExport(html: string): Story[] {
  return html.split(/<div class="(?:story|note)">/).slice(1).map(readOne);
}
