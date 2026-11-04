type DraftState = { dirty: boolean; pending: boolean };

/** A pending write cannot be discarded. Recheck an already-open dialog too. */
export function requestDraftLeave(readState: () => DraftState, confirm: (proceed: () => void) => void, proceed: () => void) {
  const state = readState();
  if (state.pending) return;
  if (!state.dirty) { proceed(); return; }
  confirm(() => { if (!readState().pending) proceed(); });
}
