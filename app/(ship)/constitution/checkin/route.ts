// The weekly check-in: recent weeks go to Claude, the reply streams back as
// it's written, and the finished check-in is saved. The API key stays on the
// server; the browser only ever sees the reply.
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_PROMPT, byDate, checkinMessage } from "@/lib/constitution";
import { dayKey } from "@/lib/logbook";
import { currentHealthOwner } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { loadHealth } from "../data";

const MODEL = "claude-opus-5-5";

export async function POST() {
  const member = await currentHealthOwner();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response("Check-ins aren't switched on yet: the app needs its Anthropic API key.", { status: 503 });

  const supabase = await createClient();
  const [{ profile, entries, habits }, { data: me }] = await Promise.all([
    loadHealth(),
    supabase.from("profiles").select("display_name").eq("id", member.id).maybeSingle(),
  ]);
  if (!profile || entries.length === 0) return new Response("Add this week's numbers first.", { status: 400 });

  const stream = new Anthropic({ apiKey }).messages.stream({
    model: MODEL,
    max_tokens: 2000,
    system: profile.checkin_prompt?.trim() || DEFAULT_PROMPT,
    messages: [
      {
        role: "user",
        content: checkinMessage({ name: me?.display_name ?? "them", today: dayKey(new Date()), profile, habits, entries }),
      },
    ],
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      stream.on("text", (text) => controller.enqueue(encoder.encode(text)));
      try {
        const reply = await stream.finalMessage();
        const content = reply.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
        if (content) {
          const { error } = await supabase
            .from("health_checkins")
            .insert({ profile_id: member.id, entry_id: byDate(entries).at(-1)!.id, model: reply.model, content });
          if (error) console.error(error);
        }
      } catch (error) {
        console.error(error);
        controller.enqueue(encoder.encode("\n\n(The check-in stopped part way through. Try again in a minute.)"));
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
