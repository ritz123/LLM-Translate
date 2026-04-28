import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

/** Parent of dist-electron/ when bundled = project root. */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(projectRoot, ".env") });
