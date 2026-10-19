// Direct Node strip-types pure check: resolve local .js source specifiers to .ts.
// No transpiler, native package import, filesystem API, child process or network.
import { registerHooks } from 'node:module';
const root = new URL('../', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('.js') && context.parentURL?.startsWith(root)) {
      const url = new URL(specifier, context.parentURL);
      if (url.href.startsWith(root + 'src/')) return nextResolve(url.href.slice(0, -3) + '.ts', context);
    }
    return nextResolve(specifier, context);
  },
});
