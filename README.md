# Parcel Optimizer for versioned imports

Transforms code looking like this:

```ts
import { bar } from "foo";
```

with `package-lock.json` defining version `1.2.3` for `foo` into:

```ts
import { bar } from "foo@1.2.3";
```

as needed for [Pipedream](https://pipedream.com/docs/code/nodejs#pinning-package-versions) for example.

## Caveats

- I added rudimentary sourcemap support, but as [Pipedream](https://pipedream.com) does not currently support source maps, it is untested. If you need working sourcemap support for this optimizer -> Contributions welcome.
- Only works for `ImportDeclaration` nodes, not commonjs imports. Contributions welcome.
- Currently only supports npm-based projects that have a `package-lock.json` file, as this is used to determine the embedded version. It should be simple to support other packagers and their dependency graph definitions -> Contributions welcome (starting point could be [this package](https://github.com/snyk/nodejs-lockfile-parser)).

## How to use

```json
{
  "extends": "@parcel/config-default",
  "optimizers": {
    "*.{js,mjs,jsm,jsx,es6,cjs,ts,tsx,mts,cts}": [
      "...",
      "@planet-a/parcel-optimizer-versioned-imports"
    ]
  }
}
```

### Options

- `ignoreSubmoduleImports`: if set to `true`, import with submodule paths will not be versioned, e.g. `import "fs-extra/esm"` will be left alone.

You can create a `.parcel-optimizer-versioned-importsrc` config file or put it into the respective `package.json` section, e.g.:

```json
  "@planet-a/parcel-optimizer-versioned-imports": {
    "ignoreSubmoduleImports": true
  }
```

## Why is this not a `Transformer` plugin?

Transformers require that import declarations can be resolved after transformation, as other transformers may need/want to transform the code further. Changing an import into a non-standard import (in the node world, not the Deno world) like `package@version` means subsequent resolution fails. Optimizers are run at the end of the pipeline and are this one is meant to be the very last one that does code transformations with introspection.
