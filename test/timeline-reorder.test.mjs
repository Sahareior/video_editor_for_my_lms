import { projectReducer, normalize } from '../src/state/projectReducer.js';
import { resequenceScenes } from '../src/engine/timeline.js';

let pass = 0, fail = 0;
const ok = (n, c, e) => {
  if (c) {
    pass++;
    console.log('  \x1b[32m✓\x1b[0m ' + n);
  } else {
    fail++;
    console.log('  \x1b[31m✗\x1b[0m ' + n + (e ? '  → ' + e : ''));
  }
};
const R = (s, a) => projectReducer(s, a);

console.log('\n\x1b[1mCapCut Magnetic Timeline & Resequencing\x1b[0m');

// Test 1: Overlapping scenes repaired on normalize
const overlapping = normalize({
  scenes: [
    { name: 'HOOK', start: 0, end: 3.5, layers: [], texts: [] },
    { name: 'CHALLENGE', start: 3.5, end: 8.0, layers: [], texts: [] },
    { name: 'STEP 1', start: 8.0, end: 13.0, layers: [], texts: [] },
    { name: 'STEP 2', start: 8.8, end: 14.8, layers: [], texts: [] }, // User's bug: overlapped STEP 1!
    { name: 'SCENE 5', start: 17.0, end: 19.7, layers: [], texts: [] },
  ],
});

ok('normalize removes overlap and keeps scenes contiguous',
  overlapping.scenes[0].start === 0 && overlapping.scenes[0].end === 3.5 &&
  overlapping.scenes[1].start === 3.5 && overlapping.scenes[1].end === 8.0 &&
  overlapping.scenes[2].start === 8.0 && overlapping.scenes[2].end === 13.0 &&
  overlapping.scenes[3].start === 13.0 && overlapping.scenes[3].end === 19.0 && // STEP 2 sits flush after STEP 1!
  overlapping.scenes[4].start === 19.0 && overlapping.scenes[4].end === 21.7
);

// Test 2: Moving / reordering scene cards (CapCut drag and drop)
let state = overlapping;
const step2Id = state.scenes[3].id;
const step1Id = state.scenes[2].id;

// Move STEP 2 (from index 3) before STEP 1 (to index 2)
state = R(state, { type: 'scene/reorder', fromIndex: 3, toIndex: 2 });
ok('scene/reorder moves STEP 2 before STEP 1',
  state.scenes[2].name === 'STEP 2' && state.scenes[3].name === 'STEP 1');
ok('scene/reorder recalculates contiguous start and end times',
  state.scenes[2].start === 8.0 && state.scenes[2].end === 14.0 && // STEP 2 dur 6s: 8 to 14
  state.scenes[3].start === 14.0 && state.scenes[3].end === 19.0 && // STEP 1 dur 5s: 14 to 19
  state.scenes[4].start === 19.0 && state.scenes[4].end === 21.7 // SCENE 5 dur 2.7s: 19 to 21.7
);

// Test 3: Dragging to the very beginning (index 0)
state = R(state, { type: 'scene/reorder', fromIndex: 2, toIndex: 0 });
ok('reorder to index 0 puts STEP 2 at start at 0s',
  state.scenes[0].name === 'STEP 2' && state.scenes[0].start === 0 && state.scenes[0].end === 6.0);
ok('subsequent scenes ripple forward from STEP 2 end',
  state.scenes[1].name === 'HOOK' && state.scenes[1].start === 6.0 && state.scenes[1].end === 9.5);

// Test 4: Trimming / resizing (CapCut ripple trim)
// Resize STEP 2 duration from 6.0s to 4.0s
state = R(state, { type: 'scene/resize', id: step2Id, duration: 4.0 });
ok('scene/resize updates duration and ripples subsequent scenes',
  state.scenes[0].end === 4.0 &&
  state.scenes[1].start === 4.0 && state.scenes[1].end === 7.5);

// Test 5: Duplicate ripples subsequent scenes
const origLen = state.scenes.length;
state = R(state, { type: 'scene/duplicate', id: step2Id });
ok('duplicate inserts clone and ripples following scenes',
  state.scenes.length === origLen + 1 &&
  state.scenes[1].name === 'STEP 2 copy' &&
  state.scenes[1].start === 4.0 && state.scenes[1].end === 8.0 &&
  state.scenes[2].start === 8.0);

// Test 6: Delete ripples subsequent scenes left
state = R(state, { type: 'scene/delete', id: state.scenes[1].id });
ok('delete removes scene and ripples following scenes left',
  state.scenes.length === origLen &&
  state.scenes[1].name === 'HOOK' &&
  state.scenes[1].start === 4.0 && state.scenes[1].end === 7.5);

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' passed, ' + fail + ' failed\x1b[0m\n');
process.exit(fail ? 1 : 0);
