import { Command } from "commander";
import {
  getConfigFilePathDisplay,
  maskApiKey,
  readConfigFile,
} from "../lib/config";

export function registerConfig(program: Command): void {
  program
    .command("config")
    .description(
      "Print the current setup (provider, model, config path). Never prints the API key in full",
    )
    .action(async () => {
      const saved = await readConfigFile();
      if (!saved) {
        console.log("Not configured yet — run `job-agent init`.");
        return;
      }
      console.log(`Provider: ${saved.provider}`);
      console.log(`Model:    ${saved.model}`);
      console.log(`API key:  set (${maskApiKey(saved.apiKey)})`);
      console.log(`Config:   ${getConfigFilePathDisplay()}`);
    });
}
