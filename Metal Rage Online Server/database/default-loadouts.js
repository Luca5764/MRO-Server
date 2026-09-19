// P1B-IMPL (docs/backlog.md P1b): the single source of truth for "what does
// this mech wear by default" -- Cache.Bin Table 4 (DefaultSetList), extracted
// verbatim from the object that used to live only in
// dispatch/room/room-game-user.sender.js as CANONICAL_LOADOUTS. That file now
// requires this module instead of declaring its own copy, so Game_User_SN's
// fallback and any other consumer (tools/p1b-remove-default-items.js) read
// the exact same table -- no second hand-copied list to drift out of sync.
//
// Format: body, main, left, right, booster, skin. 0 = Table 4 genuinely has
// no default for that part on that mech (verified against
// docs/journal/2026-09-16-33-weapon-model-true-root-cause-verified.md).
const CANONICAL_LOADOUTS = {
    1: { body: 11100101, main: 22100101, left: 32100101, right: 31100101, booster: 41100101, skin: 61101001 }, // Vanguard (Small)
    2: { body: 12100101, main: 26300101, left: 32100101, right: 31100101, booster: 41100101, skin: 61100101 }, // Dual
    3: { body: 13100101, main: 21200101, left: 32100101, right: 31100101, booster: 41100101, skin: 61101601 }, // HA01m
    4: { body: 14200101, main: 24100201, left: 32100101, right: 31100101, booster: 0,        skin: 61101201 }, // NB01m
    5: { body: 15200101, main: 22200201, left: 32100101, right: 31100101, booster: 0,        skin: 61101301 }, // TB01m
    6: { body: 16200101, main: 25300101, left: 38500101, right: 0,        booster: 43100101, skin: 61101501 }, // BB01m
    7: { body: 17100101, main: 28100101, left: 31100101, right: 0,        booster: 42100101, skin: 61101401 }, // EA01m
    8: { body: 18100101, main: 28300101, left: 39100101, right: 31100101, booster: 41100101, skin: 61101101 }, // OA01m
};

// Field name -> items.part_slot, same mapping room-game-user.sender.js and
// database/db.js (saveEquippedLoadout's `serials` array order) already use:
// 0=Body, 1=Primary, 2=Sub-left, 3=Sub-right, 4=Booster/Equipment, 5=Skin.
const PART_SLOT_FIELDS = [
    ['body', 0],
    ['main', 1],
    ['left', 2],
    ['right', 3],
    ['booster', 4],
    ['skin', 5],
];

module.exports = {
    CANONICAL_LOADOUTS,
    PART_SLOT_FIELDS,
};
