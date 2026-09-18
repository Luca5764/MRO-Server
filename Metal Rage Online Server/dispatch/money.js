// M1 verified [DLL][LOG][DB][OBS]: accounts.point/cash/coupon are the
// persisted balances; Buy_PointItem_SA 0x00240202 body+0x06, RecordInfo_SN
// 0x00210103 body+0x14/+0x48, and Package_Point/Coupon_SN 0x00240132/0x133
// all read/write these as 64-bit values. See
// docs/journal/2026-09-18-16-money-persistence.md.
const MONEY_MAX = 2147483647;

function clampMoney(value, fallback = 0)
{
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(MONEY_MAX, Math.max(0, Math.trunc(numeric)));
}

function moneyBigInt(value, fallback = 0)
{
    return BigInt(clampMoney(value, fallback));
}

module.exports = {
    MONEY_MAX,
    clampMoney,
    moneyBigInt,
};
