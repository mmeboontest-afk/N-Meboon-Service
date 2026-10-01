// Pvp mode — not implemented yet (next phase, per scope agreed in chat).
// Kept as a real module so the web UI can already list it as a selectable
// mode without erroring; starting it just reports "not ready" instead of
// silently doing nothing.
function startMode(bot, { log }) {
  log('This mode is not implemented yet — only Custom 1 is ready right now. Ask to build it next when you want it.');
  return () => {}; // no-op stop function
}
module.exports = { startMode };
