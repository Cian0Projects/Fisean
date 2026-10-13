import { connection } from "next/server";
import { StartForm } from "./StartForm";

/**
 * A server page around a client form, only so it can read whether the host
 * has set `SIGNUP_CODE` — the form asks for one only when it is needed.
 */
export default async function StartPage() {
  // Read at request time, not baked in at build: the code is set on the
  // server, and changing it should not need a rebuild.
  await connection();
  return <StartForm needsCode={Boolean(process.env.SIGNUP_CODE)} />;
}
