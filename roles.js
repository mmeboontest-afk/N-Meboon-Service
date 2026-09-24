// Central place for every role ID in the server so features (like OTP
// verification, loyalty ranks, etc.) can all reference the same source.
// Fill in / adjust freely — nothing breaks if a value here isn't used yet.

module.exports = {
  MANAGEMENT: {
    OWNER: '1261866506166337618',
    ADMIN: '1261866284401037403',
    BOT_AI: '1261889435012698223',
  },
  CREATORS: {
    SUBS_1K_PLUS: '1491447911836553296',
    MAIN_YOUTUBER: '1491449361106735114',
  },
  MEMBERS: {
    FANCLUB: '1264435927002906717',
    VERIFIED: '1358283709912059945',
    FULLY_VERIFIED: '1511707194087968958',
    EARLY_SUPPORTER: '1532366386788306965',
  },
  LOYALTY: {
    NEWBIE: '1532369438211444927',        // 0–3 Months
    REGULAR: '1532369634450341918',       // 3–6 Months
    VETERAN: '1532369703882850334',       // 6–12 Months
    ELITE: '1532369773441061007',         // 1–1.5 Years
    LEGEND: '1532369842219258019',        // 1.5+ Years
  },
};
