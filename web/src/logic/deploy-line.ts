import type { DeployStatus } from "../../../server/deploy-status.ts";

/** Text, or a commit to show short. */
export type Part = string | { commit: string };

/** Settings' one line about the last deploy; `time` formats `deploy.at`. */
export function deployLine(deploy: DeployStatus, time: (iso: string) => string): Part[] {
  const running = deploy.running ? [{ commit: deploy.running }] : ["nothing"];
  switch (deploy.result) {
    case "deployed":
      return ["Running ", ...running, `, live since ${time(deploy.at)}`];
    case "failed":
      return [
        "Last deploy of ",
        { commit: deploy.sha },
        ` failed at ${deploy.step ?? "build"}; still running `,
        ...running,
      ];
    case "rolled-back":
      return ["Rolled back from ", { commit: deploy.sha }, "; running ", ...running];
  }
}
