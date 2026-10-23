import type { CardColor } from './types';

export interface CardCopy {
  readonly title: string;
  readonly body: string;
  readonly checklist?: readonly string[];
}

export interface ClusterSpec {
  readonly tag: string;
  readonly originX: number;
  readonly originY: number;
  readonly count: number;
  readonly palette: readonly CardColor[];
  readonly base: readonly CardCopy[];
  readonly topics: readonly string[];
  readonly moves: readonly string[];
}

export const WELCOME_COPY: CardCopy = {
  title: 'The wall is real',
  body: 'Every card is live HTML, not a picture. Drag the paper to pan, scroll to move, and hold Ctrl or Cmd while scrolling to zoom. Then press Ctrl/Cmd+F and search for needle.',
  checklist: ['Pan by dragging the paper', 'Zoom with Ctrl/Cmd + wheel', 'Find the word needle'],
};

/**
 * Eight neighbourhoods of project material. Each cluster mixes a dozen
 * hand-written cards with generated follow-ups so the wall stays specific
 * without turning into a wall of Lorem Ipsum.
 */
export const CLUSTERS: readonly ClusterSpec[] = [
  {
    tag: 'LAUNCH',
    originX: 0,
    originY: 0,
    count: 31,
    palette: ['butter', 'peach', 'cream', 'rose'],
    base: [
      {
        title: 'Launch narrative',
        body: 'One sentence: the board is real HTML you can find, edit, and trust. Everything else in the plan supports that sentence.',
        checklist: ['One sentence agreed', 'Demo proves it', 'Docs repeat it'],
      },
      {
        title: 'Beta invitation copy',
        body: 'Fifty makers, no waitlist theatre. Invite them to break the board and tell us which part felt like a real product.',
      },
      {
        title: 'Pricing page',
        body: 'Free while the canvas API is experimental. Say that plainly, and do not invent a paid tier before anyone asks.',
      },
      {
        title: 'Waitlist email',
        body: 'Short note, one screenshot, one honest limitation. The ask is a reply, not a click.',
      },
      {
        title: 'Ninety-second demo',
        body: 'Open on the wall, pan once, edit a title, then use native find. End on the highlighted card. No feature tour.',
        checklist: ['Script timed', 'Screen recording clean', 'Captions checked'],
      },
      {
        title: 'Press kit',
        body: 'Logo, two screenshots, the one-liner, and a link to the experimental API note. Keep the folder under five files.',
      },
      {
        title: 'Launch-day runbook',
        body: 'Who watches what, when the switch flips. One channel, one decision maker, one rollback sentence.',
        checklist: ['Deploy owner', 'Comms owner', 'Rollback owner'],
      },
      {
        title: 'Support rota',
        body: 'Two people cover the first six hours. Everyone else stays out of the inbox so replies stay coherent.',
      },
      {
        title: 'Rollback plan',
        body: 'Static assets make this boring: point Pages at the previous build, post the note, keep the board data local.',
      },
      {
        title: 'Status page copy',
        body: 'A demo with no backend rarely breaks. Say that, and explain that saved boards live in the browser.',
      },
      {
        title: 'Partner briefing',
        body: 'Show the DOM fallback first, then the canvas path. The point is parity, not a Chrome-only trick.',
      },
      {
        title: 'Community post',
        body: 'Lead with the native-find demo. Ask people to try their own Ctrl/Cmd+F before reading the architecture notes.',
      },
    ],
    topics: [
      'the demo video',
      'the docs pass',
      'the onboarding tour',
      'launch-day posts',
      'the changelog',
      'analytics events',
      'the screenshot set',
      'the FAQ',
      'the founder note',
      'the invite gate',
      'the feedback form',
      'testimonials',
      'the roadmap page',
      'press embargo',
      'the launch retro',
      'the community AMA',
      'the beta cohort',
      'the referral loop',
      'the launch budget',
    ],
    moves: ['Draft', 'Pressure-test', 'Sequence', 'Cut', 'Review', 'Assign', 'Schedule', 'Tighten'],
  },
  {
    tag: 'RESEARCH',
    originX: 2050,
    originY: 0,
    count: 30,
    palette: ['sky', 'mint', 'cream', 'lilac'],
    base: [
      {
        title: 'Interview synthesis',
        body: 'Seven conversations, four repeated frustrations. The strongest signal was not speed; it was losing the thread between tools.',
      },
      {
        title: 'Five user segments',
        body: 'Makers, researchers, facilitators, planners, and lurkers. Only the first three asked for a board they could search.',
      },
      {
        title: 'Jobs to be done',
        body: 'When a project gets fuzzy, I want to spread the pieces out and still find the exact sentence later.',
      },
      {
        title: 'Competitive scan',
        body: 'Canvas boards win on space and lose on documents. DOM boards win on text and lose on scale. That gap is the demo.',
      },
      {
        title: 'Pricing signals',
        body: 'Nobody mentioned price in discovery. They mentioned trust, portability, and not wanting another subscription for a wall.',
      },
      {
        title: 'Onboarding friction',
        body: 'People tried to scroll before they tried to drag. Put a line about wheel behaviour where they look first.',
      },
      {
        title: 'The needle in the interviews',
        body: 'One participant described finding a lost decision as “the needle”. That phrase became the seed’s native-find test.',
      },
      {
        title: 'Quotes worth keeping',
        body: '“I do not need another canvas. I need the canvas to remember that this is a document.”',
      },
      {
        title: 'Assumptions to test',
        body: 'People will trust a board that behaves like a page. The canvas path must not feel like a different product.',
        checklist: ['Find works', 'Clicks land', 'Text selects', 'Screen reader reads'],
      },
      {
        title: 'Research repository',
        body: 'Raw notes stay in the shared drive. This wall holds the decisions, the quotes that changed them, and the open edges.',
      },
      {
        title: 'Recruiting screeners',
        body: 'Three questions: what do you use now, what gets lost, and what would make you close the tab immediately?',
      },
    ],
    topics: [
      'canvas performance',
      'find-in-page behaviour',
      'board hygiene',
      'first-run comprehension',
      'editing at low zoom',
      'checklist habits',
      'colour semantics',
      'return visits',
      'sharing instincts',
      'mobile panning',
      'keyboard shortcuts',
      'empty states',
      'card density',
      'offline expectations',
      'local saving',
      'the accessibility tree',
      'screen-reader flow',
      'text selection',
      'board naming',
    ],
    moves: ['Study', 'Measure', 'Synthesize', 'Test', 'Revisit', 'Map'],
  },
  {
    tag: 'DESIGN',
    originX: 4100,
    originY: 0,
    count: 28,
    palette: ['lilac', 'rose', 'butter', 'sky'],
    base: [
      {
        title: 'Studio wall direction',
        body: 'Warm paper, heavy ink, pastel notes, hard offset shadows. It should feel used, not styled for a landing page.',
      },
      {
        title: 'Paper and ink',
        body: 'Paper is the ground, cards are the objects, chrome is the label maker. Three materials, no fourth.',
      },
      {
        title: 'Card colour system',
        body: 'Seven pastels, each with the same ink contrast. Colour groups a thought; it never carries meaning alone.',
        checklist: ['Cream reads as note', 'Pastels stay legible', 'Selection is distinct'],
      },
      {
        title: 'Type on the wall',
        body: 'System sans for reading, mono for labels only. Titles slightly tighter than body; no display face for a tool.',
      },
      {
        title: 'The dot grid',
        body: 'Fine dots that move with the board. Two densities: every 20 world units, stronger every 100. Fade the minor layer when zoomed out.',
      },
      {
        title: 'Chrome layout',
        body: 'Brand and add at top-left, history and help at top-right, zoom at bottom-right, truth at bottom-left. The middle stays paper.',
      },
      {
        title: 'Selection ring',
        body: 'Ink plus a hot accent, inside the card bounds so the canvas snapshot cannot clip it. Visible at 60% zoom.',
      },
      {
        title: 'Welcome card',
        body: 'One card that explains the trick without a modal. It should be the first thing a visitor reads, not the loudest.',
      },
      {
        title: 'Empty paper',
        body: 'The space beyond the clusters is part of the product. Resist filling it with decorative frames or fake sections.',
      },
      {
        title: 'Icon language',
        body: 'Text glyphs and a few drawn marks. No icon library, no mixed stroke weights, no rounded-square sameness.',
      },
      {
        title: 'Help dialog',
        body: 'Shortcuts, browser support, and a plain sentence about the experimental canvas API. Close returns focus to the trigger.',
      },
    ],
    topics: [
      'card proportions',
      'tag treatment',
      'the zoom cluster',
      'the renderer badge',
      'the first-run hint',
      'focus rings',
      'canvas sharpness',
      'colour contrast',
      'mobile chrome',
      'checklist rhythm',
      'the drag strip',
      'toolbar hierarchy',
      'the fit animation',
      'cursor language',
      'paper texture',
      'the screenshot set',
      'the reset flow',
    ],
    moves: ['Sketch', 'Refine', 'Compare', 'Redline', 'Prototype', 'Ship'],
  },
  {
    tag: 'QUESTIONS',
    originX: 0,
    originY: 2700,
    count: 28,
    palette: ['peach', 'cream', 'mint', 'lilac'],
    base: [
      {
        title: 'What earns a card?',
        body: 'A thought that needs a place, not every passing idea. If it fits in a sentence and a half, it belongs here.',
      },
      {
        title: 'When does zoom feel wrong?',
        body: 'Below 70% body text stops being readable. That is the line where editing should ease the camera back in.',
      },
      {
        title: 'What should fit show?',
        body: 'The whole board, including the quiet streets. Fit is for orientation, not for working.',
      },
      {
        title: 'Is 216 the right number?',
        body: 'Enough to feel like a real project, small enough to fit. Keep the count fixed in the seed so tests can mean something.',
      },
      {
        title: 'Where should the needle live?',
        body: 'Somewhere off the opening screen. The native-find reveal is only convincing if the match starts out of view.',
        checklist: ['Off-screen at load', 'Present in both renderers', 'Easy to describe'],
      },
      {
        title: 'How loud is the chrome?',
        body: 'It should be findable without hunting and quiet enough that the cards own the first impression.',
      },
      {
        title: 'What breaks native find?',
        body: 'Culling cards, hiding them with content-visibility, or replacing text with aria labels. All three are forbidden.',
      },
      {
        title: 'How fast is fast enough?',
        body: 'Sixty frames per second while panning 216 cards at 2× DPR. Measure before adding clever culling.',
      },
      {
        title: 'What does saved mean?',
        body: 'Local, versioned, and honest. If storage is unavailable, the board still works and the status says otherwise.',
      },
      {
        title: 'Should tags be editable?',
        body: 'Not in v1. Tags are display metadata; the card title carries the meaning. Revisit after people ask twice.',
      },
      {
        title: 'What happens on a phone?',
        body: 'Single-finger pan, pinch zoom, floating chrome that gets out of the way. No bespoke mobile board.',
      },
    ],
    topics: [
      'the first five seconds',
      'cluster naming',
      'card z-order',
      'empty paper',
      'new-note placement',
      'duplicate offsets',
      'checklist deletion',
      'undo boundaries',
      'help copy',
      'renderer fallback',
      'canvas screenshots',
      'browser support',
      'performance budgets',
      'data export',
      'the reset flow',
      'offline mode',
      'touch gestures',
    ],
    moves: ['Decide', 'Park', 'Answer', 'Revisit', 'Ask about', 'Write down'],
  },
  {
    tag: 'BUILD',
    originX: 2050,
    originY: 2700,
    count: 28,
    palette: ['mint', 'sky', 'cream', 'butter'],
    base: [
      {
        title: 'Renderer contract',
        body: 'Mount, camera, sync, selection, invalidate, destroy. Both renderers implement the same surface so parity is structural.',
      },
      {
        title: 'Pure camera module',
        body: 'Screen and world conversion, zoom-to-pointer, fit, clamp. No DOM, no store, no excuses for untested coordinate math.',
      },
      {
        title: 'Seed invariants',
        body: '216 cards, deterministic layout, unique ids, finite coordinates, no overlaps. The tests read like a contract.',
      },
      {
        title: 'Paint coalescing',
        body: 'One animation frame per input burst, one paint request per frame. Input can outrun paint; it must not queue it.',
      },
      {
        title: 'Device-pixel sizing',
        body: 'Read devicePixelContentBoxSize, size the backing store, scale the context, and keep drawing in CSS pixels.',
      },
      {
        title: 'Resize observation',
        body: 'One observer for card sizes and one for the canvas. Card height changes schedule a repaint, not a re-layout of the app.',
      },
      {
        title: 'Canvas hit testing',
        body: 'The canvas draw call syncs geometry automatically. Do not hand-roll transforms over clickable controls.',
      },
      {
        title: 'DOM parity',
        body: 'The fallback uses the same card views and the same store. A missing feature is a bug, not a limitation.',
      },
      {
        title: 'Renderer badge',
        body: 'Show Canvas or DOM plus the card count. The badge is proof, not decoration.',
      },
      {
        title: 'URL overrides',
        body: '?render=dom and ?render=canvas. Forced canvas falls back quietly when the API is absent.',
      },
      {
        title: 'Failure path',
        body: 'If drawing throws, report it once, rebuild with the DOM renderer, and keep camera and selection intact.',
      },
    ],
    topics: [
      'wheel normalisation',
      'pointer capture',
      'zoom clamping',
      'fit bounds',
      'the initial camera',
      'card measurement',
      'focus survival',
      'selection sync',
      'canvas snapshots',
      'the accessibility tree',
      'native-find reveal',
      'the storage schema',
      'undo snapshots',
      'drag inertia',
      'touch pinch',
      'the build pipeline',
      'deployment',
    ],
    moves: ['Implement', 'Test', 'Profile', 'Harden', 'Document', 'Pair on'],
  },
  {
    tag: 'METRICS',
    originX: 4100,
    originY: 2700,
    count: 24,
    palette: ['sky', 'lilac', 'mint', 'cream'],
    base: [
      {
        title: 'North star',
        body: 'A board someone returns to and edits two days later. Novelty visits do not count.',
      },
      {
        title: 'Activation definition',
        body: 'Opened the demo, moved the camera, and edited or checked one thing. Three actions, one session.',
      },
      {
        title: 'Week-one retention',
        body: 'Of visitors who edit, how many come back within seven days? The number will be small; direction matters more.',
      },
      {
        title: 'Find usage',
        body: 'Native find is the headline. Count how often a find selection reveals a card that started off-screen.',
      },
      {
        title: 'Cards per board',
        body: 'Track the shape of real boards, not just the seeded one. Empty boards and 500-card hoards are different products.',
      },
      {
        title: 'Time to first edit',
        body: 'Target under twenty seconds. The first-run copy and the welcome card both compete for that budget.',
      },
      {
        title: 'Renderer split',
        body: 'Canvas share tells us how many people can see the primary path. DOM share is not a failure; it is the fallback working.',
      },
      {
        title: 'Paint budget',
        body: 'Record p50 and p95 paint time for a full-board pan. A generous 8 ms budget, not a hard per-frame gate.',
      },
      {
        title: 'Error budget',
        body: 'No uncaught console errors in either renderer. Canvas API failures must produce one clear status, not a broken wall.',
      },
      {
        title: 'Launch dashboard',
        body: 'Five numbers on one screen: visits, activation, find reveal, returning edits, renderer split. Nothing else.',
      },
    ],
    topics: [
      'pan distance',
      'zoom distribution',
      'fit presses',
      'add-note rate',
      'checklist completion',
      'return sessions',
      'canvas share',
      'DOM share',
      'FPS samples',
      'first paint',
      'card count',
      'session length',
      'native-find success',
      'reset usage',
    ],
    moves: ['Instrument', 'Baseline', 'Review', 'Set a target for', 'Cut', 'Track'],
  },
  {
    tag: 'OPS',
    originX: -1800,
    originY: 0,
    count: 24,
    palette: ['peach', 'butter', 'cream', 'rose'],
    base: [
      {
        title: 'Beta support rota',
        body: 'Two names per day, one shared inbox. The person on rota replies; everyone else keeps building.',
      },
      {
        title: 'Incident playbook',
        body: 'Confirm, contain, communicate, learn. For a static demo, most incidents are browser support or a bad deploy.',
      },
      {
        title: 'Status page',
        body: 'A static page is enough. Link the current build, the last deploy time, and the one known limitation.',
      },
      {
        title: 'Release checklist',
        body: 'Typecheck, lint, format, unit, both browser journeys, build. Then look at the deployed URL with fresh eyes.',
        checklist: ['All checks green', 'Screenshot updated', 'Pages URL verified'],
      },
      {
        title: 'Rollback drill',
        body: 'Practise once before launch. The drill is not done until the previous build is serving and the note is posted.',
      },
      {
        title: 'Privacy note',
        body: 'No accounts, no backend, no analytics by default. Board content stays in the browser unless the user exports it.',
      },
      {
        title: 'Terms stub',
        body: 'Plain language: a demo, no warranty, do not store secrets in a demo board. Link the source and the issue tracker.',
      },
      {
        title: 'Feedback triage',
        body: 'Tag every report: bug, confusion, or wish. Confusion is a design bug; wishes wait for the roadmap.',
      },
      {
        title: 'Community guidelines',
        body: 'Be specific, be kind, do not paste private board content into a public issue. Screenshots should use the seed.',
      },
      {
        title: 'Launch week calendar',
        body: 'Monday ship, Tuesday listen, Wednesday fix confusion, Thursday write the retro, Friday leave it alone.',
        checklist: ['Ship Monday', 'Office hours Tuesday', 'Retro Thursday'],
      },
    ],
    topics: [
      'the bug inbox',
      'office hours',
      'release notes',
      'uptime checks',
      'backup exports',
      'moderation',
      'email replies',
      'partner requests',
      'billing questions',
      'data deletion',
      'security reports',
      'accessibility reports',
      'the custom domain',
      'the analytics policy',
    ],
    moves: ['Set up', 'Own', 'Review', 'Automate', 'Write', 'Schedule'],
  },
  {
    tag: 'LATER',
    originX: -1800,
    originY: 2700,
    count: 22,
    palette: ['cream', 'lilac', 'peach', 'mint'],
    base: [
      {
        title: 'Rich text, maybe never',
        body: 'Bold and links would need a document model, sanitization, and an editor toolbar. It proves nothing new about the canvas.',
      },
      {
        title: 'Connectors sketch',
        body: 'Arrows between cards sound useful until every board becomes a diagram. Park it until three users ask.',
      },
      {
        title: 'Templates shelf',
        body: 'Launch plan, research synthesis, weekly review. Each template is just a seed variant, not a new feature.',
      },
      {
        title: 'Read-only links',
        body: 'Needs a backend or an encoded board in the URL. Both break the local-first promise for v1.',
      },
      {
        title: 'Card embeds',
        body: 'Iframes inside a canvas snapshot are a security boundary and a rendering hazard. Keep cards text and checklists.',
      },
      {
        title: 'Export to PNG',
        body: 'A screenshot of the viewport is easy; a useful export is a layout decision. Revisit after the board settles.',
      },
      {
        title: 'Command palette',
        body: 'The keyboard shortcuts already cover the common moves. A palette without commands is theatre.',
      },
      {
        title: 'Multiple boards',
        body: 'The store can hold one board today. Multiple boards means a board switcher, naming, and a new storage schema.',
      },
      {
        title: 'Collaboration cursors',
        body: 'Multiplayer needs a backend, presence, conflict handling, and a privacy story. A different product.',
      },
    ],
    topics: [
      'search highlights',
      'frames',
      'grouping',
      'comments',
      'reactions',
      'attachments',
      'audio notes',
      'calendar view',
      'version history',
      'saved views',
      'the colour picker',
      'the mobile layout pass',
      'a public API',
    ],
    moves: [
      'Park',
      'Revisit after launch',
      'Prototype later',
      'Do not build yet',
      'Note for v2',
      'Keep on the shelf',
    ],
  },
];

export const GENERATED_BODIES = [
  'Start with the smallest version that proves the point. Name an owner and a date before this leaves the wall.',
  'Write the decision down while the context is fresh. Link the source, then cut the sentence in half.',
  'Test it against the seeded board this week. Note what felt slow, not just what looked wrong.',
  'Pull this apart into one move we can ship and one question we can park for later.',
  'The useful detail is the constraint. Capture the limit, the owner, and the first symptom to watch.',
  'Keep this card small enough to scan at 70% zoom. If it needs a scroll, it needs a split.',
] as const;

export const GENERATED_CHECKLISTS: readonly (readonly string[])[] = [
  ['Owner named', 'Draft linked', 'Reviewed Friday'],
  ['One open question', 'One next step', 'Shared with the team'],
  ['Measure it', 'Write the decision', 'Set a revisit date'],
] as const;
