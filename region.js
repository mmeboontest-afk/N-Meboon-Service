// Discord gives bots ZERO real location/IP data about users — there is no
// API that tells a bot "this person is in Thailand." That's a hard privacy
// limit on Discord's platform, not something any bot can work around.
//
// So this module does two honest things instead:
//   1. A self-select menu (the reliable, accurate way — same pattern every
//      big Discord server uses for region/language roles).
//   2. A best-effort GUESS based on the user's Discord app language
//      (`locale`), which Discord only exposes when a user actually
//      interacts with the bot (runs a command, clicks a button, etc.) —
//      never just from joining the server. It's a guess about their app
//      language setting, not their real location, and is clearly labeled
//      as such to the user.

const CONTINENTS = {
  ASIA: '1552995069525757962',
  EUROPE: '1552995386631913523',
  AMERICA: '1552995599152971786',
};

const COUNTRIES = {
  THAILAND: '1552995821073600593',
  JAPAN: '1552999414677770281',
  USA: '1552999556944371783',
  OTHER: '1552996040507134052',
};

const ALL_CONTINENT_IDS = Object.values(CONTINENTS);
const ALL_COUNTRY_IDS = Object.values(COUNTRIES);

// Discord locale code -> { continent, country } best guess.
const LOCALE_MAP = {
  th: { continent: CONTINENTS.ASIA, country: COUNTRIES.THAILAND },
  ja: { continent: CONTINENTS.ASIA, country: COUNTRIES.JAPAN },
  'en-US': { continent: CONTINENTS.AMERICA, country: COUNTRIES.USA },

  // Rest of Asia -> Asia continent, "Other" country
  'zh-CN': { continent: CONTINENTS.ASIA, country: COUNTRIES.OTHER },
  'zh-TW': { continent: CONTINENTS.ASIA, country: COUNTRIES.OTHER },
  ko: { continent: CONTINENTS.ASIA, country: COUNTRIES.OTHER },
  vi: { continent: CONTINENTS.ASIA, country: COUNTRIES.OTHER },
  hi: { continent: CONTINENTS.ASIA, country: COUNTRIES.OTHER },
  id: { continent: CONTINENTS.ASIA, country: COUNTRIES.OTHER },

  // Europe
  da: { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  de: { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  'en-GB': { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  'es-ES': { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  fr: { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  hr: { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  it: { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  lt: { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  hu: { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  nl: { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  no: { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  pl: { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  ro: { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  fi: { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  'sv-SE': { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  tr: { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  cs: { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  el: { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  bg: { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  ru: { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },
  uk: { continent: CONTINENTS.EUROPE, country: COUNTRIES.OTHER },

  // Americas
  'es-419': { continent: CONTINENTS.AMERICA, country: COUNTRIES.OTHER },
  'pt-BR': { continent: CONTINENTS.AMERICA, country: COUNTRIES.OTHER },
};

function guessFromLocale(locale) {
  return LOCALE_MAP[locale] || null; // null = unknown locale, don't guess
}

/**
 * Removes every continent/country role this member currently has (from
 * our fixed set only — untouched otherwise) and adds the given ones.
 */
async function setRegionRoles(member, { continentId, countryId }) {
  const toRemove = [];
  const toAdd = [];

  if (continentId) {
    toRemove.push(...ALL_CONTINENT_IDS.filter((id) => id !== continentId && member.roles.cache.has(id)));
    if (!member.roles.cache.has(continentId)) toAdd.push(continentId);
  }
  if (countryId) {
    toRemove.push(...ALL_COUNTRY_IDS.filter((id) => id !== countryId && member.roles.cache.has(id)));
    if (!member.roles.cache.has(countryId)) toAdd.push(countryId);
  }

  if (toRemove.length) await member.roles.remove(toRemove).catch(() => {});
  if (toAdd.length) await member.roles.add(toAdd).catch(() => {});
}

function hasAnyRegionRole(member) {
  return [...ALL_CONTINENT_IDS, ...ALL_COUNTRY_IDS].some((id) => member.roles.cache.has(id));
}

module.exports = {
  CONTINENTS,
  COUNTRIES,
  ALL_CONTINENT_IDS,
  ALL_COUNTRY_IDS,
  guessFromLocale,
  setRegionRoles,
  hasAnyRegionRole,
};
