import { Command } from "commander";
import { runInit } from "../lib/configure";

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Configure (or reconfigure) the LLM provider, API key, and model")
    .option(
      "--model <id>",
      "Skip interactive model selection and use this model ID",
    )
    .action(async (options: { model?: string }) => {
      await runInit({ model: options.model });
    });
}
