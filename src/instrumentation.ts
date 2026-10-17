/**
 * Runs once as the server starts. Footage being brought across from another
 * app carries on after a restart or a deploy: the parts already stored are
 * kept, and only the rest is fetched (src/lib/media/importer.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { resumeImports } = await import("./lib/media/importer");
  // Not awaited: the server should not wait on four gigabytes to start.
  void resumeImports().catch((err) => console.error("Could not resume footage imports:", err));
}
