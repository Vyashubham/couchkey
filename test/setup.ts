// Legacy CommonJS modules under src/ `require()` TypeScript modules.
// Node's native require can't load .ts, so register tsx's CJS hook for
// the test run. Remove once the legacy .js modules are gone (ROADMAP M2).
import { register } from 'tsx/cjs/api';

register();
