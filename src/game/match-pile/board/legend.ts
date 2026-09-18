// what_out: `LEGEND_COPY` — the one permanent rule reminder, shown wherever the game needs a
//           default instruction: the gameplay screen's instruction card (outside FTUE) and the
//           start screen's instruction line.
// why_here: previously also rendered as its own row below the board (`paintLegendOnce`) — that
//           row was removed (screen-hierarchy pass: nothing may sit between the playable area
//           and the Slots Row except what the required structure names), leaving just the shared
//           copy behind so it isn't duplicated as a literal in two files.
export const LEGEND_COPY = 'TAP MATCHING ITEMS · CLEAR SETS OF 3';
