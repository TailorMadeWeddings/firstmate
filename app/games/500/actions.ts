"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { type Action } from "@/lib/games/500/rules";
import {
  type Room,
  type RoomView,
  botMove,
  play,
  start,
  takeSeat,
  viewFor,
} from "@/lib/games/500/room";
import { currentUserId } from "@/lib/players";
import { createAdminClient } from "@/lib/supabase/admin";

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O

async function load(code: string): Promise<Room | null> {
  const { data, error } = await createAdminClient()
    .from("games_500")
    .select("code, created_by, status, seats, state, version, winner_team")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function namesFor(seats: Room["seats"]): Promise<Record<string, string>> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, display_name")
    .in("id", seats.filter((id) => id !== null));
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.display_name]));
}

async function view(room: Room, user: string): Promise<RoomView> {
  return viewFor(room, user, await namesFor(room.seats));
}

/**
 * Saves a change only if nobody else has moved since we loaded the room, then
 * tells every open table to refresh. A clash throws; the browser reloads the
 * table and the player tries again.
 */
async function change(
  code: string,
  fn: (room: Room, user: string) => Room | null,
): Promise<RoomView> {
  // Independent lookups run side by side: each one is a trip to the database.
  const [user, room] = await Promise.all([currentUserId(), load(code)]);
  if (!room) throw new Error("No such game");
  const next = fn(room, user);
  if (!next) return view(room, user);

  const db = createAdminClient();
  const version = room.version + 1;
  const save = db
    .from("games_500")
    .update({
      status: next.status,
      seats: next.seats,
      state: next.state,
      version,
      winner_team: next.winner_team,
      finished_at: next.status === "finished" ? new Date().toISOString() : null,
    })
    .eq("code", room.code)
    .eq("version", room.version)
    .select("code");
  const [{ data, error }, names] = await Promise.all([save, namesFor(next.seats)]);
  if (error) throw error;
  if (!data.length) throw new Error("Someone else moved first");
  after(() => db.channel(`game-500:${room.code}`).httpSend("update", { version }));
  return viewFor({ ...next, version }, user, names);
}

export async function getRoom(code: string): Promise<RoomView | null> {
  const [user, room] = await Promise.all([currentUserId(), load(code)]);
  return room && view(room, user);
}

export async function sitAt(code: string, seat: number) {
  return change(code, (room, user) => takeSeat(room, user, seat));
}

export async function startGame(code: string) {
  return change(code, (room, user) => start(room, user));
}

export async function act(code: string, action: Action) {
  return change(code, (room, user) => play(room, user, action));
}

/** Plays the computer's move. Every open table asks; the first one wins. */
export async function advance(code: string, version: number) {
  return change(code, (room) => (room.version === version ? botMove(room) : null));
}

export async function createGame() {
  const user = await currentUserId();
  for (let tries = 0; tries < 5; tries++) {
    const code = Array.from(
      crypto.getRandomValues(new Uint32Array(4)),
      (n) => CODE_LETTERS[n % CODE_LETTERS.length],
    ).join("");
    const { error } = await createAdminClient()
      .from("games_500")
      .insert({ code, created_by: user, seats: [user, null, null, null] });
    if (!error) redirect(`/500/${code}`);
    if (error.code !== "23505") throw error; // 23505: code taken, try another
  }
  throw new Error("Couldn't find a free game code");
}

export async function joinGame(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  redirect(/^[A-Z]{4}$/.test(code) ? `/500/${code}` : "/500");
}
