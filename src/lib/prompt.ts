import * as readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";

export type Prompter = {
  question: (prompt: string) => Promise<string>;
  questionHidden: (prompt: string) => Promise<string>;
  close: () => void;
};

export function createPrompter(): Prompter {
  const isInteractive = input.isTTY === true;
  const rl = readline.createInterface({
    input,
    output,
    terminal: isInteractive,
    crlfDelay: Infinity,
  });

  const buffer: string[] = [];
  type PendingLine = {
    resolve: (line: string) => void;
    reject: (err: unknown) => void;
  };
  let pending: PendingLine | null = null;
  let hiddenReject: ((err: unknown) => void) | null = null;
  let closed = false;

  function inputClosedError(): Error {
    return new Error("Input closed");
  }

  function terminateOutstanding(err: Error): void {
    closed = true;
    const waiting = pending;
    pending = null;
    const hidden = hiddenReject;
    hiddenReject = null;
    if (waiting) waiting.reject(err);
    if (hidden) hidden(err);
  }

  rl.on("line", (line) => {
    const text = line.trim();
    if (pending) {
      const waiting = pending;
      pending = null;
      waiting.resolve(text);
    } else {
      buffer.push(text);
    }
  });

  rl.on("close", () => {
    terminateOutstanding(inputClosedError());
  });
  input.on("end", () => {
    terminateOutstanding(inputClosedError());
  });

  function nextLine(): Promise<string> {
    const queued = buffer.shift();
    if (queued !== undefined) {
      return Promise.resolve(queued);
    }
    if (closed) {
      return Promise.reject(inputClosedError());
    }
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
    });
  }

  return {
    async question(prompt: string): Promise<string> {
      output.write(prompt);
      return nextLine();
    },
    async questionHidden(prompt: string): Promise<string> {
      if (closed) {
        return Promise.reject(inputClosedError());
      }
      if (!isInteractive || typeof input.setRawMode !== "function") {
        output.write(prompt);
        return nextLine();
      }

      rl.pause();
      output.write(prompt);
      input.setRawMode(true);
      if (input.isPaused()) {
        input.resume();
      }

      return new Promise<string>((resolve, reject) => {
        let value = "";
        const onData = (chunk: string | Buffer) => {
          const text = chunk.toString();
          for (const char of text) {
            if (char === "\n" || char === "\r") {
              cleanup();
              output.write("\n");
              resolve(value);
              return;
            }
            if (char === "\u0003") {
              cleanup();
              reject(new Error("Cancelled"));
              return;
            }
            if (char === "\u007f" || char === "\b") {
              if (value.length > 0) {
                value = value.slice(0, -1);
              }
              continue;
            }
            if (char >= " ") {
              value += char;
            }
          }
        };
        const cleanup = () => {
          hiddenReject = null;
          input.off("data", onData);
          input.setRawMode(false);
          rl.resume();
        };
        hiddenReject = (err) => {
          cleanup();
          reject(err);
        };
        input.on("data", onData);
      });
    },
    close() {
      rl.close();
    },
  };
}

export async function confirm(
  prompter: Prompter,
  message: string,
  defaultYes: boolean,
): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  for (;;) {
    const answer = (await prompter.question(`${message} (${hint}) `)).toLowerCase();
    if (answer === "") {
      return defaultYes;
    }
    if (answer === "y" || answer === "yes") {
      return true;
    }
    if (answer === "n" || answer === "no") {
      return false;
    }
    console.log("Please answer y or n.");
  }
}

export async function chooseIndex(
  prompter: Prompter,
  message: string,
  count: number,
): Promise<number> {
  for (;;) {
    const answer = await prompter.question(`${message} `);
    const n = Number.parseInt(answer, 10);
    if (Number.isInteger(n) && n >= 1 && n <= count) {
      return n - 1;
    }
    console.log(`Please enter a number between 1 and ${count}.`);
  }
}
