import type { Route } from "./+types/api.refresh";
import { refreshIfStale } from "../lib/refresh.server";

// POST /api/refresh — pull latest events from the IGN feed if the database
// hasn't been refreshed in the last hour. The home page fires this in the
// background after rendering whatever is already stored.
export async function action(_: Route.ActionArgs) {
  return await refreshIfStale();
}
