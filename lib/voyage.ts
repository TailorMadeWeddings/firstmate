// Voyage: the pages of each person's life journal. The templates live here,
// not in the database (a page stores its answers in `fields`), so a new
// prompt is an edit, not a migration. Pure, so it's testable.

export const PHOTO_BUCKET = "voyage-photos";

export type FieldType = "text" | "textarea" | "date" | "time" | "number";
export type Field = { name: string; label: string; type: FieldType; unit?: string; placeholder?: string };

/**
 * once: one page per person (period 0). month / year / school: one per month
 * of the first year, per birthday, per school year. calendar: one per
 * calendar year (family pages). many: a collection, as many as you like.
 */
export type Repeat = "once" | "month" | "year" | "school" | "calendar" | "many";
export type Group = "beginnings" | "first-year" | "years" | "school" | "activities" | "collections" | "about" | "family";

export type Template = {
  title: string;
  repeat: Repeat;
  group: Group;
  /** A family page: written once, with a section for each person. */
  family?: true;
  fields: readonly Field[] | ((period: number) => readonly Field[]);
  /** Collections and family pages: what an entry is called ("Where", "What I said"). */
  titleLabel?: string;
  titlePlaceholder?: string;
  dateLabel?: string;
  bodyLabel?: string;
  /** Family pages: the prompt for each person's section; {name} is their name. */
  each?: string;
  blurb?: string;
};

const text = (name: string, label: string, placeholder?: string): Field => ({ name, label, type: "text", placeholder });
const area = (name: string, label: string, placeholder?: string): Field => ({ name, label, type: "textarea", placeholder });
const date = (name: string, label: string): Field => ({ name, label, type: "date" });
const kg: Field = { name: "weight", label: "Weight", type: "number", unit: "kg" };
const cm = (label = "Height"): Field => ({ name: "height", label, type: "number", unit: "cm" });

/** What each year's page asks, by stage of life. */
export function yearFields(age: number): readonly Field[] {
  if (age <= 4)
    return [
      cm(), kg,
      area("foods", "Foods I love"), area("toys", "Toys I love"), area("books", "Books I love"),
      area("activities", "Activities I love"), area("other", "Other things I love"),
      area("occasions", "Special family occasions"), area("highlights", "Highlights of the year"),
    ];
  if (age <= 12)
    return [
      cm(), kg,
      area("friends", "Best friends"), area("foods", "Favourite foods"), area("books", "Favourite books"),
      area("shows", "Shows & movies"), area("games", "Games & toys"), area("music", "Music I love"),
      area("activities", "Sports, music & other activities"), text("grow", "What I want to be when I grow up"),
      area("occasions", "Special family occasions"), area("highlights", "Highlights of the year"),
    ];
  if (age <= 17)
    return [
      cm(), kg,
      area("friends", "Friends"), area("subjects", "Subjects I like"), area("music", "Music I love"),
      area("shows", "Shows, movies & games"), area("activities", "Sports, music & other activities"),
      area("work", "Jobs & money"), area("milestones", "Milestones", "Learner's licence, P plates, formal, first job…"),
      area("next", "What I want to do next"), area("highlights", "Highlights of the year"),
    ];
  return [
    area("home", "Where I'm living"), area("work", "Work & study"), area("people", "The people in my life"),
    area("travel", "Travel"), area("proud", "What I'm proud of"), area("learned", "What I learned"),
    area("highlights", "Highlights of the year"), area("goals", "Goals for next year"),
  ];
}

/** The birthday interview: the same questions every year, so the answers line up. */
export const INTERVIEW: readonly Field[] = [
  text("colour", "Favourite colour"), text("food", "Favourite food"), text("animal", "Favourite animal"),
  text("song", "Favourite song"), text("book", "Favourite book"), text("show", "Favourite show or movie"),
  text("play", "Favourite thing to do"), text("friend", "Best friend"), area("laugh", "What makes me laugh"),
  area("scared", "What scares me"), text("grow", "What I want to be when I grow up"),
  area("family", "The best thing about my family"), area("proud", "Something I'm proud of"), area("wish", "If I had one wish"),
];

export const TEMPLATES = {
  // ---------- beginnings ----------
  pregnancy: {
    title: "Pregnancy",
    repeat: "once",
    group: "beginnings",
    fields: [date("due", "Due date"), date("found_out", "Date we found out"), area("conception", "Journey to conception")],
    bodyLabel: "About the pregnancy",
    blurb: "Add ultrasound pictures as photos.",
  },
  bump: {
    title: "Celebrating the baby bump",
    repeat: "once",
    group: "beginnings",
    dateLabel: "Date",
    fields: [text("hosted_by", "Hosted by"), area("attended", "Who came")],
    bodyLabel: "About the celebration",
  },
  birth: {
    title: "My birth details",
    repeat: "once",
    group: "beginnings",
    dateLabel: "Date of birth",
    fields: [
      { name: "time", label: "Time", type: "time" }, text("place", "Place of birth", "John Hunter Hospital"),
      text("city", "City & country", "Newcastle, NSW"), kg, cm("Length"),
      { name: "head", label: "Head circumference", type: "number", unit: "cm" }, text("cord", "Who cut the cord"),
      area("features", "Features"),
    ],
  },
  story: { title: "My birth story", repeat: "once", group: "beginnings", fields: [], bodyLabel: "The story" },
  name: {
    title: "My name",
    repeat: "once",
    group: "beginnings",
    fields: [
      text("full", "My name is"), text("meaning", "What my name means"), text("named", "When I was named"),
      area("why", "Why this name"), area("others", "Other names on the list"),
    ],
  },
  prints: {
    title: "Hand & footprints",
    repeat: "once",
    group: "beginnings",
    fields: [],
    bodyLabel: "Notes",
    blurb: "Photograph the prints. A new handprint each birthday makes a lovely set.",
  },

  // ---------- the first year ----------
  month: {
    title: "Month",
    repeat: "month",
    group: "first-year",
    fields: [
      kg, cm("Length"), text("feeding", "How I'm feeding"), text("sleeping", "How I'm sleeping"),
      area("progress", "How I'm progressing"), area("funny", "Funny things I do"), area("outings", "Outings"),
      area("firsts", "Firsts this month", "First bath, first outing…"), text("highlight", "Highlight of the month"),
    ],
    bodyLabel: "Journal",
  },

  // ---------- every year after ----------
  year: { title: "Age", repeat: "year", group: "years", fields: yearFields, bodyLabel: "Journal" },
  birthday: {
    title: "Birthday",
    repeat: "year",
    group: "years",
    dateLabel: "Date",
    fields: [text("where", "Where"), area("who", "Who celebrated with us"), area("gifts", "Gifts"), text("cake", "The cake"), text("wore", "What I wore")],
    bodyLabel: "Most memorable moments",
  },
  interview: {
    title: "Birthday interview",
    repeat: "year",
    group: "years",
    fields: INTERVIEW,
    blurb: "The same questions every birthday, so the answers can be read side by side.",
  },
  school: {
    title: "School year",
    repeat: "school",
    group: "school",
    fields: [
      text("school", "School"), text("teacher", "Teacher"), text("class", "Class"), area("friends", "Friends"),
      area("subjects", "Favourite subjects"), area("events", "Carnivals, concerts & excursions"), area("awards", "Awards"),
    ],
    bodyLabel: "About the year",
    blurb: "Add the school photo and report card as photos.",
  },
  activity: {
    title: "Activity",
    repeat: "many",
    group: "activities",
    titleLabel: "Activity",
    titlePlaceholder: "Soccer, piano, swimming, dance…",
    dateLabel: "Started",
    fields: [
      text("kind", "Kind", "Sport, music, dance, art…"), text("season", "Season or year", "Winter 2029"),
      text("club", "Club, school or teacher"), text("level", "Team, level or grade"), text("coach", "Coach"),
      area("achievements", "Achievements", "Awards, exams, grades, best and fairest…"),
    ],
    bodyLabel: "Highlights",
  },

  // ---------- collections ----------
  first: { title: "Firsts", repeat: "many", group: "collections", titleLabel: "What", titlePlaceholder: "First steps, first word, rode a bike…", dateLabel: "When", fields: [], bodyLabel: "The story" },
  teeth: {
    title: "My teeth",
    repeat: "once",
    group: "collections",
    fields: [date("first_in", "First tooth came through"), area("coming", "Teeth coming in"), date("first_out", "First tooth lost"), area("fairy", "Teeth lost, and the tooth fairy")],
  },
  saying: { title: "Funny things I said", repeat: "many", group: "collections", titleLabel: "What I said", dateLabel: "When", fields: [], bodyLabel: "What was happening" },
  day: { title: "Days to remember", repeat: "many", group: "collections", titleLabel: "What happened", dateLabel: "When", fields: [], bodyLabel: "The story" },
  trip: {
    title: "Trips & holidays",
    repeat: "many",
    group: "collections",
    titleLabel: "Where",
    dateLabel: "From",
    fields: [date("until", "Until"), area("who", "Who came")],
    bodyLabel: "About the trip",
  },
  letter: {
    title: "Letters",
    repeat: "many",
    group: "collections",
    titleLabel: "From",
    dateLabel: "Written",
    fields: [date("open_on", "Open on (optional)")],
    bodyLabel: "The letter",
    blurb: "Wishes and letters for the future. One with an “open on” date stays folded until then.",
  },
  keepsake: { title: "Keepsakes", repeat: "many", group: "collections", titleLabel: "What it is", titlePlaceholder: "Artwork, a certificate, the hospital wristband…", dateLabel: "When", fields: [], bodyLabel: "Notes" },

  // ---------- grown-ups ----------
  about: {
    title: "About me",
    repeat: "once",
    group: "about",
    fields: [
      text("birthplace", "Place of birth"), area("siblings", "Siblings"), area("education", "Education"),
      text("career", "Career / occupation"), cm(), area("features", "Features"), area("interests", "Interests"),
    ],
    bodyLabel: "More about me",
  },

  // ---------- the family's pages ----------
  home: {
    title: "Homes",
    repeat: "many",
    group: "family",
    family: true,
    titleLabel: "Address",
    dateLabel: "Moved in",
    fields: [date("moved_out", "Moved out"), text("country", "Country"), text("built", "Year the house was built")],
    bodyLabel: "History of the home",
    each: "{name} and this home",
  },
  pet: {
    title: "Pets",
    repeat: "many",
    group: "family",
    family: true,
    titleLabel: "Name",
    dateLabel: "Arrived",
    fields: [text("kind", "What kind", "Cat, dog, chooks…"), date("until", "Until")],
    bodyLabel: "About them",
    each: "{name} and this pet",
  },
  relative: {
    title: "Relatives",
    repeat: "many",
    group: "family",
    family: true,
    titleLabel: "Name",
    fields: [
      text("relation", "Relation", "Mum's mother"), date("birthday", "Birthday"), text("birthplace", "Place of birth"),
      text("occupation", "Occupation"), area("interests", "Interests"),
    ],
    bodyLabel: "About them",
    each: "What {name} calls them, and their wish for {name}",
  },
  moment: {
    title: "Shared moments",
    repeat: "many",
    group: "family",
    family: true,
    titleLabel: "What happened",
    titlePlaceholder: "Nicole's wedding, the aquarium, Christmas at Gran's…",
    dateLabel: "When",
    fields: [text("where", "Where"), area("who", "Who was there")],
    bodyLabel: "The story",
    each: "{name}'s part",
  },
  snapshot: {
    title: "The year in the world",
    repeat: "calendar",
    group: "family",
    family: true,
    fields: [
      text("leader", "Leader of the country"), text("population", "Population of the country"),
      text("bread", "Cost of bread"), text("milk", "Cost of milk"), text("chocolate", "Cost of a chocolate bar"),
      text("movie_ticket", "Cost of a movie ticket"), text("petrol", "Cost of petrol (a litre)"), text("car", "Cost of a new car"),
      text("electricity", "Household monthly electricity"), text("food", "Household monthly food budget"),
      text("song", "Number one song"), text("band", "Number one band"), text("movie", "Number one movie"),
      text("tv", "Number one TV series"), text("sport", "Sports teams on top"),
      area("technology", "What the technology is like"), area("news", "Most unforgettable world news"),
    ],
    blurb: "Written once a year for the whole family. Each person's book shows the year they were born.",
  },
} as const satisfies Record<string, Template>;

export type TemplateKey = keyof typeof TEMPLATES;
export const isTemplate = (s: string | undefined): s is TemplateKey => !!s && Object.hasOwn(TEMPLATES, s);
export const template = (key: TemplateKey): Template => TEMPLATES[key];

export const fieldsFor = (key: TemplateKey, period: number | null): readonly Field[] => {
  const f = template(key).fields;
  return typeof f === "function" ? f(period ?? 0) : f;
};

/** The templates in a group, in order. */
export const inGroup = (group: Group) => (Object.keys(TEMPLATES) as TemplateKey[]).filter((k) => TEMPLATES[k].group === group);

// ---------- names for pages ----------

const ORDINAL_WORDS = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth"];

/** 1st, 2nd, 3rd, 11th, 22nd. */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

export const schoolYear = (n: number) => (n === 0 ? "Kindergarten" : `Year ${n}`);

/** What a page is called: "Third month", "Age 7", "7th birthday", "Kindergarten", "2022", or its own title. */
export function pageName(key: TemplateKey, period: number | null, title?: string | null): string {
  const t = template(key);
  switch (t.repeat) {
    case "month":
      return `${ORDINAL_WORDS[period ?? 0] ?? `Month ${period}`} month`;
    case "year":
      return key === "year" ? `Age ${period}` : key === "birthday" ? `${ordinal(period ?? 0)} birthday` : `${t.title}, age ${period}`;
    case "school":
      return schoolYear(period ?? 0);
    case "calendar":
      return `${period} in the world`;
    case "many":
      return title || t.title;
    default:
      return t.title;
  }
}

/** The period a page needs (null for a collection), and whether the one given makes sense. */
export function periodProblem(key: TemplateKey, period: number | null): string | null {
  const { repeat } = template(key);
  if (repeat === "many") return period === null ? null : "That kind of page doesn't have a number.";
  if (repeat === "once") return period === 0 ? null : "That page only happens once.";
  if (period === null || !Number.isInteger(period)) return "Which one is this page for?";
  const [lo, hi] = { month: [1, 12], year: [1, 120], school: [0, 12], calendar: [1900, 2200] }[repeat];
  return period >= lo && period <= hi ? null : "That number is out of range for this page.";
}

// ---------- dates ----------

const parts = (day: string) => day.split("-").map(Number) as [number, number, number];
const iso = (y: number, m: number, d: number) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** A calendar day plus some months, the day clamped to the month's end (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = parts(day);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return iso(ny, nm, Math.min(d, last));
}

/** Whole years between two calendar days. */
export function ageOn(born: string, today: string): number {
  const [by, bm, bd] = parts(born);
  const [ty, tm, td] = parts(today);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/**
 * NSW: children start Kindergarten in the year they turn 5 by 31 July,
 * otherwise the year after. Returns the calendar year of each school year.
 */
export function kindergartenYear(born: string): number {
  const [y, m] = parts(born);
  return y + (m <= 7 ? 5 : 6);
}

/** The repeating pages a book has so far: months of the first year begun, birthdays reached, school years started. */
export function bookSlots(born: string | null, today: string) {
  if (!born || born > today) return { months: [] as number[], years: [] as number[], school: [] as number[] };
  const months = Array.from({ length: 12 }, (_, i) => i + 1).filter((n) => addMonths(born, n - 1) <= today);
  const age = ageOn(born, today);
  const years = Array.from({ length: Math.max(0, age) }, (_, i) => i + 1);
  const firstSchool = kindergartenYear(born);
  const thisYear = parts(today)[0];
  const school = Array.from({ length: 13 }, (_, i) => i).filter((n) => firstSchool + n <= thisYear);
  return { months, years, school };
}

// ---------- growth ----------

export type GrowthEntry = { template: string; period: number | null; occurred_on: string | null; fields: Record<string, unknown> };
export type GrowthPoint = { date: string; value: number };

const measure = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Weight and height from the birth details, the monthly pages and the yearly ones, oldest first. */
export function growth(entries: GrowthEntry[], born: string | null) {
  const weight: GrowthPoint[] = [];
  const height: GrowthPoint[] = [];
  for (const e of entries) {
    const when =
      e.template === "birth" ? (e.occurred_on ?? born)
      : !born || e.period === null ? null
      : e.template === "month" ? addMonths(born, e.period)
      : e.template === "year" ? addMonths(born, e.period * 12)
      : null;
    if (!when) continue;
    const w = measure(e.fields.weight);
    const h = measure(e.fields.height);
    if (w) weight.push({ date: when, value: w });
    if (h) height.push({ date: when, value: h });
  }
  const byDate = (a: GrowthPoint, b: GrowthPoint) => a.date.localeCompare(b.date);
  return { weight: weight.sort(byDate), height: height.sort(byDate) };
}

/** A letter with an "open on" date still to come stays folded. */
export const sealed = (fields: Record<string, unknown>, today: string) =>
  typeof fields.open_on === "string" && fields.open_on > today;
