import { randomBytes, scryptSync } from "node:crypto";
import { argv, exit } from "node:process";

const password = argv[2];
if (!password || password.length < 12) {
  console.error("Usage: pnpm admin:hash-password <password-at-least-12-characters>");
  exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 32);
console.log(`scrypt$${salt.toString("base64")}$${hash.toString("base64")}`);
