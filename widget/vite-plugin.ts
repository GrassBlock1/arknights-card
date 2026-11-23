import { build } from 'vite';
import type { Plugin } from 'vite';
import { resolve } from 'node:path';

const moduleId = 'virtual:card-widget-source';
const resolvedId = `\0${moduleId}`;

export function cardWidget(): Plugin {
  let root: string;
  let mode: string;
  let bundle: Promise<{ code: string; files: string[] }> | undefined;
  let dependencies = new Set<string>();

  async function source() {
    const result = await build({
      configFile: false,
      root,
      mode,
      publicDir: false,
      logLevel: 'silent',
      build: {
        write: false,
        emptyOutDir: false,
        target: 'es2022',
        lib: {
          entry: resolve(root, 'widget/index.ts'),
          formats: ['es'],
          fileName: () => 'card-widget.js',
        },
        rollupOptions: { output: { inlineDynamicImports: true } },
      },
    });
    if ('on' in result) throw new Error('Expected a widget ESM build, not a watcher');
    const outputs = Array.isArray(result) ? result : [result];
    const chunks = outputs.flatMap(output => output.output).filter(chunk => chunk.type === 'chunk');
    if (chunks.length !== 1 || chunks[0]!.imports.length || chunks[0]!.dynamicImports.length) {
      throw new Error('The widget must be a self-contained ESM bundle');
    }
    const chunk = chunks[0]!;
    const files = chunk.moduleIds.filter(id => !id.startsWith('\0'));
    dependencies = new Set(files);
    return { code: chunk.code, files };
  }

  return {
    name: 'card-widget',
    sharedDuringBuild: true,
    applyToEnvironment: environment => environment.name === 'nitro',
    configResolved(config) {
      root = config.root;
      mode = config.mode;
    },
    resolveId(id) {
      if (id === moduleId) return resolvedId;
      return null;
    },
    async load(id) {
      if (id !== resolvedId) return null;
      bundle ??= source().catch(error => {
        bundle = undefined;
        throw error;
      });
      const result = await bundle;
      for (const file of result.files) this.addWatchFile(file);
      return `export default ${JSON.stringify(result.code)};`;
    },
    watchChange(id) {
      if (dependencies.has(id)) bundle = undefined;
    },
    hotUpdate({ file, modules, timestamp }) {
      if (!dependencies.has(file)) return;
      bundle = undefined;
      const module = this.environment.moduleGraph.getModuleById(resolvedId);
      if (!module) return;
      this.environment.moduleGraph.invalidateModule(module, new Set(), timestamp, true);
      return modules.includes(module) ? modules : [...modules, module];
    },
  };
}
