import {defineConfig} from 'vitest/config'; import {resolve} from 'node:path';
export default defineConfig({resolve:{alias:{'@mentis/core':resolve(__dirname,'packages/core/src/index.ts')}}});
