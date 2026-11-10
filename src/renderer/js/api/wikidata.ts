// Wikidata lookups: an artist's nationality (as an adjective, e.g. "French") and art movements.
//
// "Not on Wikidata" and "couldn't reach Wikidata" are different: unknown parts come back as '', but a network
// failure, timeout or HTTP error throws, so callers can tell the two apart and retry later.
import { surnameOf } from '../util.js';
import { getJson } from './http.js';

const API = 'https://www.wikidata.org/w/api.php';
const ARTIST_DESCRIPTION = /painter|artist|sculptor|photographer|printmaker|draughtsman|illustrator|engraver|lithographer|architect/i;
const SPACING_MS = 120;
const RETRY_DELAY_MS = 800;

interface Claim {
  rank?: string;
  mainsnak?: { datavalue?: { value?: unknown } };
}

interface Entity {
  claims?: Record<string, Claim[] | undefined>;
  labels?: Record<string, { value: string } | undefined>;
}

/** HTTP 4xx other than 429 (too many requests): Wikidata saying "no such thing". */
const isClientError = (error: unknown): boolean => error instanceof Error && /^HTTP 4(?!29)\d\d/.test(error.message);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

// Wikidata drops requests under bursts, so calls run one at a time, spaced out, with one retry.
let queue: Promise<unknown> = Promise.resolve();

/** Resolves to undefined when Wikidata answers "no such thing" (4xx); throws when it can't be reached. */
function call<T>(params: Record<string, string>): Promise<T | undefined> {
  const request = { format: 'json', origin: '*', ...params };
  const run = queue.then(async () => {
    try {
      return await getJson<T>(API, request);
    } catch (error) {
      if (isClientError(error)) return undefined; // an answer, and asking again can't change it
      await sleep(RETRY_DELAY_MS);
      return getJson<T>(API, request);
    }
  });
  queue = run.catch(() => undefined).then(() => sleep(SPACING_MS));
  return run;
}

const valuesOf = (entity: Entity, property: string): unknown[] =>
  (entity.claims?.[property] ?? []).map((c) => c.mainsnak?.datavalue?.value);

const isRef = (v: unknown): v is { id: string } =>
  typeof v === 'object' && v !== null && typeof (v as { id?: unknown }).id === 'string';

const isText = (v: unknown): v is { text: string; language: string } =>
  typeof v === 'object' && v !== null && typeof (v as { text?: unknown }).text === 'string';

async function getEntity(id: string, props: string): Promise<Entity | undefined> {
  const r = await call<{ entities: Record<string, Entity | undefined> }>({
    action: 'wbgetentities', ids: id, props, languages: 'en',
  });
  return r?.entities[id];
}

async function findArtistId(name: string): Promise<string | null> {
  const r = await call<{ search?: { id: string; description?: string }[] }>({
    action: 'wbsearchentities', search: name, language: 'en', type: 'item', limit: '8',
  });
  return (r?.search ?? []).find((x) => ARTIST_DESCRIPTION.test(x.description ?? ''))?.id ?? null;
}

const demonyms = new Map<string, string>(); // country id -> "French"

async function demonymOf(countryId: string): Promise<string> {
  const cached = demonyms.get(countryId);
  if (cached !== undefined) return cached;
  const country = await getEntity(countryId, 'claims|labels');
  const english = country ? valuesOf(country, 'P1549').find((v) => isText(v) && v.language === 'en') : undefined;
  const demonym = isText(english) ? english.text : (country?.labels?.en?.value ?? '');
  demonyms.set(countryId, demonym);
  return demonym;
}

export interface ArtistInfo {
  /** Adjective, e.g. "French"; '' if unknown. */
  nationality: string;
  /** Art movement, e.g. "Impressionism"; '' if unknown. */
  movement: string;
}

/** "post-impressionism" -> "Post-Impressionism" (Wikidata labels are lower-case). */
const toMovementCase = (label: string): string => label.replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toUpperCase());

/** "French Realism" -> "Realism": courses name the movement, not the country. */
const DEMONYM_PREFIX = /^(French|German|American|British|English|Dutch|Spanish|Italian|Flemish|Russian|Danish|Swiss|Belgian|Austrian|Norwegian|Swedish|Mexican|Japanese|Chinese|Polish|Czech)\s+/i;
const withoutNationality = (label: string): string => label.replace(DEMONYM_PREFIX, '');

const movementLabels = new Map<string, string>(); // movement id -> "Impressionism"

async function movementLabel(id: string): Promise<string> {
  const cached = movementLabels.get(id);
  if (cached !== undefined) return cached;
  const entity = await getEntity(id, 'labels');
  const label = toMovementCase(withoutNationality(entity?.labels?.en?.value ?? ''));
  movementLabels.set(id, label);
  return label;
}

/** The artist's movement (P135), preferring a claim marked "preferred" and ignoring deprecated ones. */
function movementOf(person: Entity): { id: string } | undefined {
  const claims = (person.claims?.P135 ?? []).filter((c) => c.rank !== 'deprecated');
  const ordered = [...claims.filter((c) => c.rank === 'preferred'), ...claims.filter((c) => c.rank !== 'preferred')];
  return ordered.map((c) => c.mainsnak?.datavalue?.value).find(isRef);
}

/** Nationality and art movement for `name`, from Wikidata. Unknown parts are ''. Throws if Wikidata can't be reached. */
export async function artistInfoOf(name: string): Promise<ArtistInfo> {
  const info: ArtistInfo = { nationality: '', movement: '' };
  const personId = await findArtistId(name);
  if (!personId) return info;
  const person = await getEntity(personId, 'claims');
  if (!person) return info;

  const country = valuesOf(person, 'P27').find(isRef); // country of citizenship
  if (country) info.nationality = await demonymOf(country.id);

  const movement = movementOf(person);
  if (movement) info.movement = await movementLabel(movement.id);
  return info;
}

const WORK_DESCRIPTION = /painting|sculpture|drawing|print|etching|lithograph|photograph|artwork|installation|mural/i;

/**
 * The movement of one artwork, from the artwork's own Wikidata item (more precise than the artist's:
 * Manet's *Olympia* is Realism even though Manet is usually filed under Impressionism).
 * '' if not found; throws if Wikidata can't be reached.
 */
export async function workMovementOf(title: string, artist: string): Promise<string> {
  const surname = surnameOf(artist);
  const cleanTitle = title.replace(/\(.*?\)/g, ' ').trim();
  if (!surname || !cleanTitle) return '';
  const r = await call<{ search?: { id: string; description?: string }[] }>({
    action: 'wbsearchentities', search: cleanTitle, language: 'en', type: 'item', limit: '10',
  });
  const hit = (r?.search ?? []).find((x) => {
    const description = (x.description ?? '').toLowerCase();
    return WORK_DESCRIPTION.test(description) && description.includes(surname);
  });
  if (!hit) return '';
  const work = await getEntity(hit.id, 'claims');
  const movement = work ? movementOf(work) : undefined;
  return movement ? await movementLabel(movement.id) : '';
}
