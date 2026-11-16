// Pure helpers. No DOM, no network.

/** A random element. The array must not be empty. */
export const pick = <Item>(items: readonly Item[]): Item => items[Math.floor(Math.random() * items.length)] as Item;

export function shuffle<Item>(items: readonly Item[]): Item[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex] as Item, shuffled[index] as Item];
  }
  return shuffled;
}

export const unique = <Item>(items: readonly Item[]): Item[] => [...new Set(items)];

/** Last word of a name, letters only, lowercased: "J.A.D. Ingres" -> "ingres". */
export const surnameOf = (name: string): string =>
  (name.split(/\s+/).pop() ?? '').replace(/[^\p{L}]/gu, '').toLowerCase();
