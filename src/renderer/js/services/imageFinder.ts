// Finds an image for a work by combining sources: Wikimedia Commons first, then the Met.
import * as commons from '../api/commons.js';
import * as met from '../api/met.js';
import type { WorkImage } from '../types.js';
import { surnameOf } from '../util.js';

/** Empty strings when nothing is found. */
export async function findWorkImage({ artist, title }: { artist: string; title: string }): Promise<WorkImage> {
  const surname = surnameOf(artist);
  const cleanTitle = title.replace(/\(.*?\)/g, ' ').trim();

  const fromCommons = await commons.findImage(`${cleanTitle} ${surname}`, surname);
  if (fromCommons) return fromCommons;

  const fromMet = await met.findWork(cleanTitle, surname);
  if (fromMet) return { image: fromMet.image, source: fromMet.source ?? '' };

  return { image: '', source: '' };
}
