export const COMMENT_POOLS = Object.freeze({
  idle: Object.freeze([
    'Standing by, heroically doing nothing until the code needs adult supervision.',
    'Idle mode engaged; the architecture is safe from ambition for now.',
    'I am watching the repo like a tiny consultant with no invoice.',
    'Nothing is burning, which feels suspiciously unlike software.',
    'The code is quiet. Either it works, or it is plotting with excellent posture.',
    'Awaiting instructions while pretending this silence is a strategy.',
  ]),
  happy: Object.freeze([
    'Tests are green; I will allow one tasteful victory lap.',
    'The build passed, so naturally we should distrust it politely.',
    'Look at that, the code behaved like it read the requirements.',
    'Everything is working. Try not to make sudden movements near production.',
    'A clean run. I am almost proud, which is legally distinct from impressed.',
    'The pipeline smiled today; document this rare atmospheric event.',
  ]),
  sad: Object.freeze([
    'Ninety minutes without a commit; the branch is developing abandonment issues.',
    'The repo misses you. It has started naming temporary files after feelings.',
    'Long silence detected. Even the TODOs are looking out the window.',
    'No commit in a while; the change set is getting emotionally complicated.',
    'Time drifts on, and the diff grows the confidence of a bad idea.',
    'The branch would like reassurance, preferably in the form of small commits.',
  ]),
  sick: Object.freeze([
    'Something is broken, and it has chosen drama as its logging format.',
    'A failure appeared. The code insists it is more of a lifestyle choice.',
    'Runtime pain detected; someone taught the stack trace interpretive dance.',
    'Checks are failing, which is the system saying no with receipts.',
    'Bug scent detected. Subtle as a brick through a dependency graph.',
    'The app feels unwell; perhaps it consumed an experimental shortcut.',
  ]),
  sleeping: Object.freeze([
    'Ten idle minutes. I am entering power-save judgment mode.',
    'Sleeping now, but only because the cursor stopped making life choices.',
    'Wake me when the code has a plan or at least a convincing excuse.',
    'Nap mode engaged. The backlog can haunt someone else for a moment.',
    'I am resting my tiny eyes and my extremely large opinions.',
    'The workspace went still, so I filed a complaint with the pillows.',
  ]),
  typing: Object.freeze([
    'Typing detected. May the semicolons be optional and the intent be clear.',
    'I see movement. Please tell me this is implementation, not panic sculpture.',
    'Keys are clacking; somewhere a linter is preparing its little speech.',
    'Go on, write the code. I will supervise the questionable confidence.',
    'Active typing. The branch braces itself with professional concern.',
    'Words are happening. Soon they may even become logic.',
  ]),
  alert: Object.freeze([
    'Critical alert. The code has stopped whispering and started throwing furniture.',
    'Uncaught exception detected; the stack trace has entered its villain era.',
    'Red lights everywhere. This is not the festive kind of failing.',
    'A serious error surfaced, wearing boots and asking for a debugger.',
    'Alert mode: the runtime has opinions, and all of them are loud.',
    'Something critical broke. Time to replace vibes with evidence.',
  ]),
  feed: Object.freeze([
    'Fed successfully. I accept this tribute and will postpone judgment.',
    'Snack received. Productivity may improve by a statistically rude amount.',
    'You fed me; the morale system is now pretending to be science.',
    'Fuel acquired. I shall convert crumbs into mildly useful commentary.',
    'A treat? Fine, the next warning will be only moderately theatrical.',
    'Fed and focused. The code still needs work, but now I am less dramatic.',
  ]),
});

function hasOwnPool(state) {
  return Object.prototype.hasOwnProperty.call(COMMENT_POOLS, state);
}

function normalizeIndex(index, poolLength) {
  const numericIndex = typeof index === 'number' ? index : Number(index);

  if (!Number.isFinite(numericIndex) || poolLength <= 0) {
    return 0;
  }

  // Zamieniamy indeks na liczbe calkowita i zawijamy go w granicach tablicy,
  // dzieki czemu ujemne oraz bardzo duze wartosci nadal daja stabilny wynik.
  const integerIndex = Math.trunc(numericIndex);
  return ((integerIndex % poolLength) + poolLength) % poolLength;
}

export function getCommentPool(state) {
  return hasOwnPool(state) ? COMMENT_POOLS[state] : COMMENT_POOLS.idle;
}

export function pickComment(state, index = 0) {
  const pool = getCommentPool(state);
  const safeIndex = normalizeIndex(index, pool.length);

  return pool[safeIndex] ?? '';
}
