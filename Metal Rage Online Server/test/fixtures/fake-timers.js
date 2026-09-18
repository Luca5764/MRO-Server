// Deterministic stand-in for setTimeout/clearTimeout, used while a golden
// sample is replayed.
//
// Some handlers (e.g. gate.game.dispatch.js's ROOM_STATE_RETRY_SCHEDULE
// resend after room create) genuinely rely on real setTimeout with real
// delays -- waiting those out would make the test suite slow and would
// still only be "deterministic" up to OS scheduling jitter. Instead this
// installs a fake global.setTimeout that records {fn, delay, seq} without
// waiting, and a drain() the harness calls between recv packets to run
// every pending timer in (delay, seq) order -- each callback's own
// microtasks are allowed to settle, and if it schedules another timer that
// one is picked up too, before drain() returns. Delay values are honoured
// for ordering (two timers with different delays fire in that order) but
// not for real wall-clock timing.
//
// clearTimeout only ever needs to accept back whatever setTimeout handed
// out; dispatch handlers never inspect the value themselves (confirmed by
// reading gate.game.dispatch.js's roomStateRetryTimers_ usage before writing
// this), so a plain incrementing id is enough.

function installFakeTimers()
{
    const realSetTimeout = global.setTimeout;
    const realClearTimeout = global.clearTimeout;

    let seq = 0;
    let virtualNow = 0;
    const pending = new Map();

    global.setTimeout = (fn, delay = 0, ...args) => {
        const id = ++seq;
        pending.set(id, { fn, args, time: virtualNow + delay, seq: id });
        return id;
    };
    global.clearTimeout = (id) => { pending.delete(id); };

    function hasPending()
    {
        return pending.size > 0;
    }

    function fireNext()
    {
        let next = null;
        for (const entry of pending.values())
        {
            if (!next || entry.time < next.time || (entry.time === next.time && entry.seq < next.seq))
                next = entry;
        }
        if (!next) return false;

        pending.delete(next.seq);
        virtualNow = next.time;
        next.fn(...next.args);
        return true;
    }

    function restore()
    {
        global.setTimeout = realSetTimeout;
        global.clearTimeout = realClearTimeout;
    }

    return { hasPending, fireNext, restore };
}

module.exports = { installFakeTimers };
