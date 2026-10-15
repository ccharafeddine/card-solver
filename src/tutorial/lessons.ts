/**
 * Tutorial content: the lessons (each a short idea in plain words, a few
 * cards or numbers to look at, and one question), the app-tour steps with
 * their live examples, and saved progress. Every lesson answer is checked
 * against the app's own engines in lessons.test.ts.
 */

export const GAME_TABS = ['poker', 'blackjack', 'kuhn', 'vpoker', 'gin', 'cribbage'] as const;
export type GameTab = (typeof GAME_TABS)[number];

export interface Lesson {
  id: string;
  tab: GameTab;
  title: string;
  /** One or two short paragraphs. */
  body: string[];
  /** Cards to show, as text like "Ah Kh | Qh Jh 2c" (a bar splits groups). Blackjack ranks use "A 6 | 10". */
  show?: string;
  ask: string;
  choices: string[];
  answer: number;
  /** Said after a right answer. */
  explain: string;
  /** Said after a wrong answer. */
  hint: string;
}

export const LESSONS: Lesson[] = [
  { id: 'hands', tab: 'poker', title: 'Which hand wins?',
    body: ['In Texas Hold\'em you get two cards of your own and share five on the table (the board). Your hand is the best five of those seven.',
      'From weakest to strongest: high card, pair, two pair, three of a kind, straight, flush, full house, four of a kind, straight flush.'],
    show: 'Ah Kd | 9h 8h 7c 6s 2h | Qh 3h',
    ask: 'You hold A♥ K♦, a friend holds Q♥ 3♥. The board is 9♥ 8♥ 7♣ 6♠ 2♥. Who wins?',
    choices: ['You, with a straight', 'Your friend, with a flush', 'It\'s a tie'], answer: 1,
    explain: 'Your friend has five hearts (Q♥ 9♥ 8♥ 3♥ 2♥): a flush. You only have ace-high, since a straight needs 5-6-7-8-9 or 6-7-8-9-10 and you hold neither.',
    hint: 'Count the hearts your friend can use.' },
  { id: 'equity', tab: 'poker', title: 'Equity: your share of the pot',
    body: ['Equity is how often you would win if all the cards were dealt out now (a tie counts as half a win). It is your fair share of the pot.',
      'The app works it out exactly, by checking every possible way the cards can come, or, when there are too many, by dealing hundreds of thousands of random finishes (Monte Carlo).'],
    show: 'Ah As | Kh Ks',
    ask: 'Two aces against two kings before the flop. Roughly how often do the aces win?',
    choices: ['About 50%', 'About 65%', 'About 82%', 'About 99%'], answer: 2,
    explain: 'About 82%. The kings still win about 1 time in 5, mostly by making three kings or a straight or flush.',
    hint: 'Aces are a big favourite, but not a sure thing.' },
  { id: 'outs', tab: 'poker', title: 'Outs and the rule of 4 and 2',
    body: ['An out is a card still in the deck that improves you to a hand that probably wins. Four hearts with one card to make a flush? There are 13 hearts, you can see 4, so 9 outs are left.',
      'Quick maths: with two cards to come (on the flop), outs × 4 ≈ your chance in percent. With one card to come (on the turn), outs × 2.'],
    show: 'Ah Kh | Qh 7h 2c',
    ask: 'You have a flush draw on the flop: 9 outs, two cards to come. About what is your chance to make the flush?',
    choices: ['About 9%', 'About 18%', 'About 36%', 'About 50%'], answer: 2,
    explain: '9 × 4 = 36%. The exact answer is 35%: the app shows both.',
    hint: 'On the flop, multiply your outs by 4.' },
  { id: 'potodds', tab: 'poker', title: 'Pot odds: the price of a call',
    body: ['Pot odds compare what you must pay with what you can win. To call, you need at least this much equity: call ÷ (pot + call), where the pot already includes the bet you face.',
      'If your equity is higher, calling makes money over time, even though you will lose plenty of single hands.'],
    ask: 'The pot is 100 after your opponent bets, and it costs you 50 to call. What equity do you need?',
    choices: ['25%', '33%', '50%', '67%'], answer: 1,
    explain: '50 ÷ (100 + 50) = 33%. You pay 50 of the final 150 pot, so you need to win at least a third of the time.',
    hint: 'Call ÷ (pot + call).' },
  { id: 'ev', tab: 'poker', title: 'Expected value (EV)',
    body: ['EV is what a choice wins or loses on average, if you could make it a thousand times. Folding is worth 0 from here on. A call is worth: equity × pot − (1 − equity) × call.',
      'Good players pick the choice with the highest EV and don\'t worry about single results. That is the heart of game theory in poker.'],
    ask: 'The pot is 150 (their bet included), the call costs 50 and your equity is 40%. What is the EV of calling?',
    choices: ['−10', '0', '+30', '+60'], answer: 2,
    explain: '0.40 × 150 − 0.60 × 50 = 60 − 30 = +30 chips on average. Calling beats folding (0).',
    hint: 'Equity × pot, minus (1 − equity) × call.' },
  { id: 'implied', tab: 'poker', title: 'Implied odds',
    body: ['Sometimes the price looks too high now, but when you hit your card you will win more later, because the opponent keeps betting. Those future chips are implied odds.',
      'The app lets you add them: it then needs only call ÷ (pot + call + future winnings).'],
    ask: 'You need 33% to call but have 20%. Which of these makes a call fine?',
    choices: ['Nothing: always fold below the pot odds', 'Expecting to win a lot more when you hit', 'Having more opponents'], answer: 1,
    explain: 'Extra winnings when you hit lower the equity you need. Be honest about them though: opponents don\'t always pay you off.',
    hint: 'Think about the chips still to come.' },
  { id: 'ranges', tab: 'poker', title: 'Ranges, not hands',
    body: ['You never know an opponent\'s exact cards, so think about every hand they could have: their range. The 13×13 grid shows all 169 kinds of starting hands: pairs on the diagonal, suited hands above it, offsuit below.',
      'A pair can be dealt 6 ways, a suited hand 4 ways and an offsuit hand 12 ways: 1,326 hands in all.'],
    ask: 'How many ways can you be dealt ace-king offsuit (AKo)?',
    choices: ['4', '6', '12', '16'], answer: 2,
    explain: '4 aces × 4 kings = 16 pairings, minus the 4 that share a suit (those are AKs): 12.',
    hint: 'Offsuit means the two suits differ.' },
  { id: 'mdf', tab: 'poker', title: 'Bluffing and defending: MDF',
    body: ['If you fold too often, an opponent can bluff with any two cards and profit. The minimum defense frequency (MDF) is how often you must keep going: pot ÷ (pot + bet).',
      'The other side: on the river, a balanced bettor bluffs in bet ÷ (pot + 2 × bet) of their bets, so the caller can\'t profit by always calling or always folding. This is game theory: each side makes the other indifferent.'],
    ask: 'Your opponent bets the size of the pot. At least how often should you call or raise?',
    choices: ['33%', '50%', '67%', '100%'], answer: 1,
    explain: 'Pot ÷ (pot + pot) = 50%. And their balanced bluffing share for a pot-sized bet is 1 in 3 of their bets.',
    hint: 'Pot ÷ (pot + bet), with bet = pot.' },
  { id: 'position', tab: 'poker', title: 'Position',
    body: ['Acting last is a big advantage: you see what others do before you decide. That is why the button (the dealer seat) plays many more hands than the first seat.',
      'The reference charts in the app open about 15% of hands from the first seat and about 45% from the button.'],
    ask: 'Which seat can play the most hands?',
    choices: ['Under the gun (first to act)', 'The button (acts last after the flop)', 'They should all play the same hands'], answer: 1,
    explain: 'The button acts last on every street after the flop, so it can play the widest range.',
    hint: 'Who gets to see everyone else act first?' },
  { id: 'basic', tab: 'blackjack', title: 'Blackjack: pick the best EV',
    body: ['In blackjack every choice (hit, stand, double, split, surrender) has an exact expected value. Basic strategy is simply: always take the choice with the highest EV.',
      'Some hands are bad whatever you do. Then the best choice is the one that loses least.'],
    show: '10 6 | 10',
    ask: 'You have 16 against a dealer 10, with late surrender allowed (6 decks). What has the best EV?',
    choices: ['Stand', 'Hit', 'Surrender'], answer: 2,
    explain: 'Standing loses about 54% of your bet on average and hitting about 53%. Surrender loses exactly 50%, so it is best (barely).',
    hint: 'Surrender always costs exactly half your bet.' },
  { id: 'edge', tab: 'blackjack', title: 'House edge and the rules',
    body: ['The house edge is how much of each bet the casino keeps on average when you play perfectly. With good rules it is under half a percent.',
      'Rules change it: a dealer who hits soft 17, fewer splitting or doubling options, or a blackjack that pays 6:5 instead of 3:2 all cost you.'],
    ask: 'Which rule change hurts the player the most?',
    choices: ['Dealer hits soft 17', 'No doubling after a split', 'Blackjack pays 6:5 instead of 3:2'], answer: 2,
    explain: '6:5 costs about 1.4% of every bet, more than the other two together. Look for 3:2 tables.',
    hint: 'Blackjacks come about once every 21 hands.' },
  { id: 'count', tab: 'blackjack', title: 'Counting cards (Hi-Lo)',
    body: ['Tens and aces help the player; small cards help the dealer. Hi-Lo keeps a running count: +1 for 2 to 6, 0 for 7 to 9, −1 for tens and aces.',
      'The true count is the running count divided by the decks left. Each +1 of true count shifts about 0.5% of edge toward you.'],
    ask: 'The running count is +6 and about 2 decks are left. What is the true count?',
    choices: ['+2', '+3', '+6', '+12'], answer: 1,
    explain: '+6 ÷ 2 decks = +3. With good rules, that is roughly a small edge for the player.',
    hint: 'Divide by the decks left.' },
  { id: 'deviate', tab: 'blackjack', title: 'Changing strategy with the count',
    body: ['When the count is high, more tens are left. That changes a few decisions: the "Illustrious 18" are the most valuable ones.',
      'Example: with 16 against a 10, basic strategy hits (or surrenders). At a true count of 0 or more, stand instead: the next card is more likely to bust you.'],
    ask: 'At a true count of +4, what should you do with 15 against a dealer 10 (no surrender)?',
    choices: ['Hit', 'Stand', 'Double'], answer: 1,
    explain: '15 vs 10 switches to stand at a true count of +4 or more.',
    hint: 'A high count means lots of tens are left.' },
  { id: 'kuhn', tab: 'kuhn', title: 'Kuhn poker: why perfect players bluff',
    body: ['Kuhn poker has only a Jack, a Queen and a King, so it can be solved perfectly. The perfect player sometimes bets with the Jack, the card that can never win a showdown.',
      'That bluff isn\'t a trick for fun: if you never bluffed, a bet would always mean "I have the King", and nobody would ever call it.'],
    show: 'Jh Qs Kd',
    ask: 'Why does the perfect player sometimes bet with the Jack?',
    choices: ['It\'s a mistake: never bet the worst card', 'So the other player has to call sometimes, and their King bets get paid', 'Because the Jack is secretly the best card'], answer: 1,
    explain: 'Bluffing keeps the other player guessing. A player who never bluffs gives a smart opponent about 17 extra chips per 100 hands.',
    hint: 'Think about what a bet would tell the other player if you only bet the King.' },
  { id: 'vpoker', tab: 'vpoker', title: 'Video poker: hold the best average',
    body: ['In Jacks or Better you hold some of your 5 cards and the rest are replaced. Each way to hold has an exact average payout, worked out by counting every possible draw.',
      'The best hold is the one with the highest average, even if it doesn\'t feel exciting.'],
    show: '6c 6d | Ts 9s 8s',
    ask: 'You\'re dealt 6♣ 6♦ 10♠ 9♠ 8♠. What should you hold?',
    choices: ['The pair of 6s', 'The three spades in a row (a straight flush draw)', 'Nothing: draw five new cards'], answer: 0,
    explain: 'The small pair is worth more on average: it often turns into two pair, three of a kind or better.',
    hint: 'A pair already has lots of ways to improve.' },
  { id: 'gin', tab: 'gin', title: 'Gin rummy: count your deadwood',
    body: ['Melds are sets (3 or 4 of a rank) or runs (3 or more in a row, one suit). Cards left over are deadwood: aces count 1, number cards their number, pictures 10.',
      'Less deadwood is better. With 10 or less you can knock to end the hand.'],
    show: '3c 3d 3h | Ks 5d',
    ask: 'Your cards are 3♣ 3♦ 3♥ K♠ 5♦. How much deadwood do you have?',
    choices: ['5', '10', '15', '24'], answer: 2,
    explain: 'The three 3s are a set. The king (10) and the 5 are left over: 15 points.',
    hint: 'Leave out the meld and add up the rest.' },
  { id: 'cribbage', tab: 'cribbage', title: 'Cribbage: the perfect 29',
    body: ['In cribbage your 4 cards plus the cut card score for fifteens (2 each), pairs (2 each), runs, flushes and nobs (the jack of the cut card\'s suit, 1 point).',
      'The best possible hand is three 5s and the right jack, with the fourth 5 cut.'],
    show: '5c 5d 5h Js | 5s',
    ask: 'You hold 5♣ 5♦ 5♥ J♠ and the 5♠ is cut. What does it score?',
    choices: ['15', '24', '28', '29'], answer: 3,
    explain: 'Eight fifteens (16), six pairs from the four 5s (12) and nobs for the jack of spades (1): 29.',
    hint: 'It\'s the highest score in the game.' },
];

export interface TourStep {
  id: string;
  /** CSS selector of the element(s) to spotlight; a list lights up all of them. */
  target: string;
  title: string;
  body: string;
  touchBody?: string;
  /** Which tab must be showing. */
  tab?: GameTab;
  /** A live example the app sets up while this step is open, then undoes. */
  demo?: TourDemo;
}
export type TourDemo = 'deal' | 'range' | 'equity' | 'decide' | 'theory' | 'chart' | 'rules' | 'hand' | 'bjchart' | 'trainer' | 'count'
  | 'ku-play' | 'ku-strategy' | 'ku-why' | 'vp-hand' | 'vp-best' | 'gn-hand' | 'gn-advice' | 'cb-throw' | 'cb-score';

export const TOUR: TourStep[] = [
  { id: 'tabs', target: '#tabs', title: 'Six games', body: 'Card Solver has six parts: Poker (Texas Hold\'em), Blackjack, Kuhn poker, Video Poker, Gin Rummy and Cribbage. Switch between them here. Each keeps its own cards and settings.' },
  { id: 'table', target: '#table-card', tab: 'poker', demo: 'deal', title: 'Your cards and the board',
    body: 'Click a spot, then click a card to fill it: your two cards, the flop, turn and river, and any cards you know are gone (dead). Here we dealt A♥ K♥ with a flop of Q♥ J♦ 4♥.',
    touchBody: 'Tap a spot, then tap a card to fill it: your two cards, the flop, turn and river, and any cards you know are gone (dead). Here we dealt A♥ K♥ with a flop of Q♥ J♦ 4♥.' },
  { id: 'range', target: '#range-card', tab: 'poker', demo: 'range', title: 'Opponents and their range',
    body: 'Pick how many opponents you face and what they might hold. "Any hand" means random cards. A range is a set of starting hands: click or drag on the grid, or pick a preset. Here: a tight player, top 15%.' },
  { id: 'equity', target: '#equity-card', tab: 'poker', demo: 'equity', title: 'Equity',
    body: 'Your equity is how often you win if all cards came out now. The app counts every possible deal when it can (Exact), or deals lots of random ones (Monte Carlo) and says how sure it is.' },
  { id: 'outs', target: '#outs-card', tab: 'poker', title: 'Outs',
    body: 'Outs are cards that improve your hand. You see them grouped by what they make, with the quick "rule of 4 and 2" next to the exact chance.' },
  { id: 'decide', target: '#decide-card', tab: 'poker', demo: 'decide', title: 'Fold, call or raise?',
    body: 'Type the pot and the bet. The app compares pot odds with your equity and shows the expected value (EV) of folding, calling and raising, then picks the best. It is a simple model, not a full solver, and says so.' },
  { id: 'theory', target: '#theory-card', tab: 'poker', demo: 'theory', title: 'Game theory, explained',
    body: 'The ideas behind the numbers: EV, pot odds, ranges, bluffing and how often to defend (MDF), each in plain words and worked out for the bet on screen.' },
  { id: 'charts', target: '#charts-card', tab: 'poker', demo: 'chart', title: 'Preflop charts',
    body: 'Which hands to start with from each seat at a 6-player table. Here: the button, which can play the most. They are simple reference charts, not solver output.' },
  { id: 'rules', target: '#rules-card', tab: 'blackjack', demo: 'rules', title: 'Table rules',
    body: 'Set the rules of your table: decks, what the dealer does on soft 17, doubling after splits, surrender, the blackjack payout and the peek. The house edge updates as you change them.' },
  { id: 'hand', target: '#hand-card', tab: 'blackjack', demo: 'hand', title: 'Best play for any hand',
    body: 'Pick your two cards and the dealer\'s card. The app works out the exact EV of every choice and marks the best. Here: 16 against a 10, a hand where every choice loses, so you pick the one that loses least.' },
  { id: 'bjchart', target: '#chart-card', tab: 'blackjack', demo: 'bjchart', title: 'Strategy chart',
    body: 'The whole basic strategy for your rules, worked out from those exact EVs. Click any square to see its numbers.' },
  { id: 'trainer', target: '#trainer-card', tab: 'blackjack', demo: 'trainer', title: 'Trainer',
    body: 'Practise: the app deals, you choose, and it tells you if that was the best play and what each choice was worth. Your accuracy is tracked.' },
  { id: 'count', target: '#count-card', tab: 'blackjack', demo: 'count', title: 'Card counting',
    body: 'Turn on Hi-Lo counting to see the running and true count while you train, the 18 most useful strategy changes, and how the count moves the house edge.' },
  { id: 'ku-rules', target: '#ku-rules', tab: 'kuhn', title: 'Kuhn poker',
    body: 'Poker with only three cards: Jack, Queen and King. It\'s small enough to solve perfectly, so it shows the real reason good players bluff.' },
  { id: 'ku-play', target: '#ku-play', tab: 'kuhn', demo: 'ku-play', title: 'Play the perfect player',
    body: 'Play hands against the perfect strategy. After each choice the app shows what every choice was worth. Here you hold the Jack as player 1: betting (a bluff) and checking are worth exactly the same.' },
  { id: 'ku-strategy', target: '#ku-strategy', tab: 'kuhn', demo: 'ku-strategy', title: 'The perfect strategy',
    body: 'How often to check, bet, call or fold with each card. Slide the bluffing rate: anything from 0% to 33% is perfect, as long as the other numbers move with it.' },
  { id: 'ku-why', target: '#ku-why', tab: 'kuhn', demo: 'ku-why', title: 'Why bluffing works',
    body: 'Pick a common mistake, like never bluffing, and see exactly how many chips a smart opponent wins from it.' },
  { id: 'vp-hand', target: '#vp-hand', tab: 'vpoker', demo: 'vp-hand', title: 'Video poker',
    body: 'Pick or deal five cards, then click cards to hold them. Here: four cards to a royal flush plus a 2.' },
  { id: 'vp-best', target: '#vp-best', tab: 'vpoker', demo: 'vp-best', title: 'The best hold',
    body: 'The app counts every possible draw for all 32 ways to hold and ranks them. Here you held the three spades, but the pair of 6s is worth more.' },
  { id: 'vp-pays', target: '#vp-paycard', tab: 'vpoker', title: 'Pay tables',
    body: 'Machines that look the same can pay differently. The return shows how much of each bet comes back with perfect play: look for 9/6.' },
  { id: 'gn-hand', target: '#gn-hand', tab: 'gin', demo: 'gn-hand', title: 'Gin rummy',
    body: 'Pick your 10 cards and the face-up card. The app lays out your best melds and counts your deadwood, and says whether to take the face-up card.' },
  { id: 'gn-advice', target: '#gn-advice-card', tab: 'gin', demo: 'gn-advice', title: 'What to throw, and when to knock',
    body: 'Add the card you drew as an 11th card to see which card to throw away and whether to knock. This advice uses rules of thumb good players use, and is labelled that way.' },
  { id: 'cb-throw', target: '#cb-throw-card', tab: 'cribbage', demo: 'cb-throw', title: 'Cribbage: the best throw',
    body: 'Pick the six cards you were dealt and who deals. The app tries all 15 ways to throw two into the crib and averages every possible cut card and crib.' },
  { id: 'cb-score', target: '#cb-score-card', tab: 'cribbage', demo: 'cb-score', title: 'Score any hand',
    body: 'Pick four cards and the cut card to see every point explained. Here: the perfect 29.' },
  { id: 'settings', target: '#settings', title: 'Settings',
    body: 'The gear opens Settings: four looks, light or dark (or follow your computer), and About. The 🎓 button has these lessons and this tour.' },
];

export interface Progress { v: 1; offered: boolean; lessonsDone: string[]; lesson: number; tour: number; tourDone: boolean }
export const PROGRESS_KEY = 'card-solver-tutorial';
export const freshProgress = (): Progress => ({ v: 1, offered: false, lessonsDone: [], lesson: 0, tour: 0, tourDone: false });

type KV = Pick<Storage, 'getItem' | 'setItem'>;

/** Read saved progress, tolerating missing, corrupt or out-of-range data. */
export function loadProgress(store: KV): Progress {
  const p = freshProgress();
  let raw: Partial<Progress> = {};
  try { raw = JSON.parse(store.getItem(PROGRESS_KEY) ?? '{}') ?? {}; } catch { /* corrupt: start over */ }
  if (typeof raw !== 'object') return p;
  const ids = new Set(LESSONS.map((l) => l.id));
  const clamp = (x: unknown, max: number) => (Number.isInteger(x) ? Math.max(0, Math.min(max, x as number)) : 0);
  return {
    v: 1,
    offered: raw.offered === true,
    lessonsDone: Array.isArray(raw.lessonsDone) ? raw.lessonsDone.filter((x) => ids.has(x)) : p.lessonsDone,
    lesson: clamp(raw.lesson, LESSONS.length - 1),
    tour: clamp(raw.tour, TOUR.length - 1),
    tourDone: raw.tourDone === true,
  };
}
export const saveProgress = (store: KV, p: Progress) => store.setItem(PROGRESS_KEY, JSON.stringify(p));

export function progressSummary(p: Progress): string {
  const tour = p.tourDone ? 'tour done' : p.tour > 0 ? `tour at step ${p.tour + 1}/${TOUR.length}` : 'tour not started';
  return `${p.lessonsDone.length}/${LESSONS.length} lessons · ${tour}`;
}

export const WELCOME = {
  title: 'Welcome to Card Solver',
  body: 'Card games worked out with real maths: poker, blackjack, Kuhn poker, video poker, gin rummy and cribbage. The short lessons explain the ideas (odds, expected value, ranges, bluffing, basic strategy, counting and more) with a quick question each. The tour shows what every part of the app does, with live examples. Both live in the 🎓 Tutorial menu too.',
  learn: 'Learn the ideas',
  tour: 'Tour the app',
  skip: 'Not now',
};
