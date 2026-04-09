function hashSeed(seedInput) {
  const seedText = String(seedInput);
  let hash = 1779033703 ^ seedText.length;

  for (let index = 0; index < seedText.length; index += 1) {
    hash = Math.imul(hash ^ seedText.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash ^= hash >>> 16) >>> 0;
}

export function createSeededRandom(seedInput) {
  let state = hashSeed(seedInput) || 1;

  function next() {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    range(min, max) {
      return min + (max - min) * next();
    },
    int(min, max) {
      return Math.floor(this.range(min, max + 1));
    },
    chance(probability) {
      return next() < probability;
    },
    pick(values) {
      return values[this.int(0, values.length - 1)];
    },
  };
}
