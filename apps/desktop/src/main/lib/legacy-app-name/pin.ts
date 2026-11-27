import { getWorkspaceName } from "shared/env.shared";
import { pinLegacyAppName } from "./legacy-app-name";

if (getWorkspaceName() !== "fork") pinLegacyAppName();
