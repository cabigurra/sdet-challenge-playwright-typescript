import { waitForApi } from "./src/helpers";

export default async function globalSetup(): Promise<void> {
  await waitForApi();
}
