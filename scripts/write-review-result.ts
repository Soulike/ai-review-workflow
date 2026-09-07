import { readFile, writeFile } from "node:fs/promises";
import { resultFromSafeOutputs } from "./lib/review-result.ts";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Input and output paths are required.");
const result = resultFromSafeOutputs(JSON.parse(await readFile(input, "utf8")));
await writeFile(output, JSON.stringify(result) + "\n");
