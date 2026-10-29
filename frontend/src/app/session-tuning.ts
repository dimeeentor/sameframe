export const TICK_MS = 400
export const DRIFT_LIMIT = 1.2
export const USER_SEEK_JUMP = 1.5
// how long a transition we caused stays marked as ours. A play runs
// PAUSED → BUFFERING → PLAYING, well over a second on a cold iframe, so its
// window has to outlast buffering; a seek or pause lands much sooner.
export const INDUCED_PLAY_MS = 2500
export const INDUCED_MS = 1200
export const LOAD_SUPPRESS_MS = 1500
// how long a load waits for its muted autoplay to report playing before it
// stops expecting one
export const PAUSE_PENDING_MS = 4000
export const RESYNC_DRIFT = 2
export const RESYNC_COOLDOWN_MS = 5000
// after a remote play/pause, a player that hasn't followed yet (slow buffering,
// blocked autoplay) is retried locally instead of echoed back as a user action
export const FOLLOW_GRACE_MS = 4000
// safety-net resync; each sync_request wakes the hibernating DO, so not more often
export const SYNC_EVERY_MS = 20000
export const SYNC_QUIET_MS = 3000
