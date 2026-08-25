import { Command } from "commander";
import { runProfile } from "../lib/runProfile";

export function registerProfile(program: Command): void {
  program
    .command("profile")
    .description(
      "Configure default resume, dream list, jobs folder, and output paths for tailor",
    )
    .action(async () => {
      try {
        await runProfile();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(message);
        process.exitCode = 1;
      }
    });
}
