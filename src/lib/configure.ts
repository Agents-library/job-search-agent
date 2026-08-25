import type { JobAgentConfig, ProviderName } from "../types";
import { readConfigFile, writeConfig } from "./config";
import { chooseIndex, confirm, createPrompter, type Prompter } from "./prompt";
import { getProvider } from "./providers";

const PROVIDER_CHOICES: { name: ProviderName; label: string }[] = [
  { name: "claude", label: "Claude" },
  { name: "openai", label: "OpenAI" },
  { name: "grok", label: "Grok" },
  { name: "gemini", label: "Gemini" },
  { name: "openrouter", label: "OpenRouter" },
];

export type InitOptions = {
  model?: string;
};

export async function runInit(options: InitOptions = {}): Promise<JobAgentConfig> {
  const existing = await readConfigFile();
  const prompter = createPrompter();
  try {
    if (existing) {
      const overwrite = await confirm(
        prompter,
        "A config file already exists. Overwrite it?",
        false,
      );
      if (!overwrite) {
        console.log("Aborted. Existing config was left unchanged.");
        process.exitCode = 0;
        return existing;
      }

      const keepKey = await confirm(
        prompter,
        "Keep the existing API key and only re-pick the model?",
        true,
      );
      if (keepKey) {
        const model =
          options.model ??
          (await selectModel(prompter, existing.provider, existing.apiKey));
        const config: JobAgentConfig = {
          provider: existing.provider,
          apiKey: existing.apiKey,
          model,
        };
        await writeConfig(config);
        printSaved(config);
        return config;
      }
    }

    const provider = await selectProvider(prompter);
    const apiKey = await readApiKey(prompter);
    const model =
      options.model ?? (await selectModel(prompter, provider, apiKey));
    const config: JobAgentConfig = { provider, apiKey, model };
    await writeConfig(config);
    printSaved(config);
    return config;
  } finally {
    prompter.close();
  }
}

async function selectProvider(prompter: Prompter): Promise<ProviderName> {
  console.log("Select a provider:");
  PROVIDER_CHOICES.forEach((choice, i) => {
    console.log(`  ${i + 1}. ${choice.label}`);
  });
  const index = await chooseIndex(
    prompter,
    `Provider [1-${PROVIDER_CHOICES.length}]:`,
    PROVIDER_CHOICES.length,
  );
  return PROVIDER_CHOICES[index].name;
}

async function readApiKey(prompter: Prompter): Promise<string> {
  for (;;) {
    const apiKey = await prompter.questionHidden("API key: ");
    if (apiKey.length > 0) {
      return apiKey;
    }
    console.log("API key cannot be empty.");
  }
}

async function selectModel(
  prompter: Prompter,
  provider: ProviderName,
  apiKey: string,
): Promise<string> {
  const adapter = getProvider(provider, apiKey);
  if (adapter.listModels) {
    try {
      const models = await adapter.listModels();
      if (models.length > 0) {
        return await pickFromList(prompter, models, adapter.defaultModel);
      }
    } catch {
      // Fall through to free-text. Do not print the key or a stack trace.
    }
  }
  return freeTextModel(prompter, adapter.defaultModel);
}

const LARGE_MODEL_LIST = 25;
const MAX_SHOWN_MODELS = 40;

async function pickFromList(
  prompter: Prompter,
  models: string[],
  defaultModel: string,
): Promise<string> {
  if (models.length > LARGE_MODEL_LIST) {
    return pickFromFilteredList(prompter, models, defaultModel);
  }
  return chooseFromShown(prompter, models, defaultModel);
}

async function pickFromFilteredList(
  prompter: Prompter,
  models: string[],
  defaultModel: string,
): Promise<string> {
  console.log(
    `${models.length} models available. Type part of a model name to filter (e.g. claude or gpt-4o).`,
  );
  for (;;) {
    const filter = (await prompter.question("Filter: ")).toLowerCase();
    if (filter.length === 0) {
      console.log("Enter a filter to narrow the list.");
      continue;
    }
    const matched = models.filter((id) => id.toLowerCase().includes(filter));
    if (matched.length === 0) {
      console.log("No models matched that filter.");
      continue;
    }
    if (matched.length > MAX_SHOWN_MODELS) {
      console.log(
        `${matched.length} matches — type a more specific filter.`,
      );
      continue;
    }
    return chooseFromShown(prompter, matched, defaultModel);
  }
}

async function chooseFromShown(
  prompter: Prompter,
  models: string[],
  defaultModel: string,
): Promise<string> {
  console.log("Select a model:");
  models.forEach((id, i) => {
    const mark = id === defaultModel ? " (recommended)" : "";
    console.log(`  ${i + 1}. ${id}${mark}`);
  });
  const index = await chooseIndex(
    prompter,
    `Model [1-${models.length}]:`,
    models.length,
  );
  return models[index];
}

async function freeTextModel(
  prompter: Prompter,
  defaultModel: string,
): Promise<string> {
  const answer = await prompter.question(`Model [${defaultModel}]: `);
  return answer === "" ? defaultModel : answer;
}

function printSaved(config: JobAgentConfig): void {
  console.log(`Saved. Provider: ${config.provider}  Model: ${config.model}`);
}
