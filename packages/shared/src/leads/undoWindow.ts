// How long a lead can be undone after it was created (`leads.undoCreate`). The server enforces it
// (apps/api/src/services/leads.ts `UNDO_WINDOW_MS`, the same 15 minutes; a test in apps/web reads
// both and fails if they drift); the web keeps its inline "Created n leads · Undo" row until the
// same window ends, counted from the create time on the client clock.
export const UNDO_WINDOW_MS = 15 * 60 * 1000;
