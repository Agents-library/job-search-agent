#!/usr/bin/env node
import { Command } from "commander";
import { registerConfig } from "./commands/config";
import { registerInit } from "./commands/init";
import { registerProfile } from "./commands/profile";
import { registerTailor } from "./commands/tailor";

const program = new Command();

program
  .name("job-agent")
  .description(
    "Score scraped job listings against a resume and generate tailored resumes",
  )
  .version("0.1.0");

registerInit(program);
registerConfig(program);
registerProfile(program);
registerTailor(program);

void program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exitCode = 1;
});
