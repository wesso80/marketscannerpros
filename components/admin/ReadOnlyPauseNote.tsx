/** Shown in place of write controls while ADMIN_DISCOVERY_ONLY is on. */
export default function ReadOnlyPauseNote() {
  return (
    <p style={{ color: "#94A3B8", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
      Read-only while admin is paused
    </p>
  );
}
