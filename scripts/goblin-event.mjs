import { GOBLIN_STATES } from "../src/companion/goblin-state-machine.js";

const DEFAULT_PORT = 48735;
const port = Number(process.env.GOBLIN_EVENT_PORT) || DEFAULT_PORT;
const endpoint = process.env.GOBLIN_EVENT_URL || `http://127.0.0.1:${port}/event`;
const state = process.argv[2];
const comment = process.argv.slice(3).join(" ").trim();
const validStates = new Set(Object.values(GOBLIN_STATES));

function printUsage() {
  console.error("Usage:");
  console.error("  npm run event -- <state> [custom English comment]");
  console.error("");
  console.error("States:");
  console.error(`  ${[...validStates].join(", ")}`);
  console.error("");
  console.error("Example:");
  console.error("  npm run event -- sick \"The test suite just coughed up a stack trace.\"");
}

async function sendEvent() {
  if (!validStates.has(state)) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const response = await fetch(endpoint, {
    body: JSON.stringify({
      comment: comment || undefined,
      state
    }),
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Goblin Companion event bridge returned HTTP ${response.status}.`);
  }

  console.log(`Goblin Companion event sent: ${state}`);
}

sendEvent().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("Start the desktop fallback first with: npm run desktop");
  process.exitCode = 1;
});
