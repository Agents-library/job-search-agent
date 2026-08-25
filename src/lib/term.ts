const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";

export function status(message: string): void {
  console.log(message);
}

export function success(message: string): void {
  console.log(`${GREEN}${message}${RESET}`);
}

export function warn(message: string): void {
  console.log(`${YELLOW}${message}${RESET}`);
}

export function error(message: string): void {
  console.error(`${RED}${message}${RESET}`);
}
