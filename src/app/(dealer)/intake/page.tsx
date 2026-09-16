import { redirect } from "next/navigation";

/** Legacy `/intake` entry — Capture lives at `/intake/handoff`. */
export default function IntakeIndexPage() {
  redirect("/intake/handoff");
}
