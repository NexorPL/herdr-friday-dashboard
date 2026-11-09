# Press and release on the installed herdr-app

Step 3.1 of the one-screen workboard spec, checked on 2026-11-05 on herdr-app 0.1.13 on Windows, with a scratch mod that logged every event and has been removed. A second window was not used, because it would share the owner's herdr-core and its tabs, so the mod ran in a pane of the owner's window. It read and wrote no files.

| Question | Result | Evidence |
|---|---|---|
| Does `on_mouse_up` fire on an element other than the press? | Yes | Log: `down A1`, then `UP on B1 [held A1]`, and `UP on column colB [held A1]` on a column's free space. |
| Does hover work with the button held? | `on_hover` does; the `.hover` style was not judged | Log: `hover out A1`, `hover in colB`, `hover in B1`, all with `[held A1]`. The board uses `on_hover`, plus `on_mouse_move` is delivered while held. |
| What happens on a release outside the pane? | No release reaches the mod, as the kit's types suggest | Not in the part of the log that was kept. On the finished board the owner ran this step on 2026-11-05 and reported that it works. |
| Does `on_mouse_down_out` clear the mark? | Yes | Log: `down_out (press outside pane)` on a press in another pane. |

The order of events when crossing from one column's card to another column's card is: out of the card, out of the column, into the column, into the card. Leaving a card for the gap below it only reports the card, so the board keeps the last card as the target until the pointer reaches another card, the header or the free space.

The event carries no pressed button, so a held card whose release happened outside the pane cannot be told apart from one still held. So the board ends a drag when the pointer leaves it, and nothing is written.
