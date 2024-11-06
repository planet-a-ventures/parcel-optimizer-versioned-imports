import { Optimizer } from "@parcel/plugin";
import type { AST } from "@parcel/types";
import type { ImportDeclaration, Node, Program } from "acorn";
import { parse } from "acorn";
import MagicString from "magic-string";
import assert from "assert";
import fs from "fs";
import { isBuiltin } from "module";
import path from "path";
// @ts-expect-error next-line
import { parse as parsePackage } from "parse-package-name";
import ThrowableDiagnostic from "@parcel/diagnostic";

interface Opts {
  /**
   * Whether to ignore sub module imports,
   * e.g. `import { foo } from "foo/path/to/sub/module"`.
   */
  ignoreSubmoduleImports: boolean;
}

const currentAstVersion = "1.0.0";

function isImportDeclaration(node: Node): node is ImportDeclaration {
  return node.type === "ImportDeclaration";
}

async function getAST(code: string): Promise<AST> {
  const ast = parse(code, {
    sourceType: "module",
    ecmaVersion: 2020,
  });
  return {
    type: "acorn-ast",
    version: currentAstVersion,
    program: ast,
  };
}

const traverseAST = (node: Program, callback: (node: Node) => void) => {
  if (Array.isArray(node)) {
    node.forEach((child) => traverseAST(child, callback));
  } else if (node && typeof node === "object") {
    callback(node);
    Object.values(node).forEach((child) => traverseAST(child, callback));
  }
};

function getPackageLockContents(packageLockPath: string) {
  if (!fs.existsSync(packageLockPath)) {
    // @ts-expect-error next-line
    throw new ThrowableDiagnostic({
      diagnostic: {
        message: `Could not find ${packageLockPath}`,
      },
    });
  }
  const packageLock = JSON.parse(fs.readFileSync(packageLockPath, "utf8"));
  assert.strictEqual(
    packageLock.lockfileVersion,
    3,
    "Unsupported lockfile version",
  );
  return packageLock;
}

export default new Optimizer({
  async loadConfig({ config, options }) {
    const loadedConfig = await config.getConfig<Opts>(
      [".parcel-optimizer-versioned-importsrc"],
      {
        packageKey: "@planet-a/parcel-optimizer-versioned-imports",
      },
    );
    const ignoreSubmoduleImports =
      loadedConfig?.contents.ignoreSubmoduleImports ?? false;

    const packageLockPath = path.join(options.projectRoot, "package-lock.json");
    config.invalidateOnFileChange(packageLockPath);
    const packageLock = getPackageLockContents(packageLockPath);
    const currentPackageDependencies: Record<string, string> =
      packageLock.packages[""].dependencies;

    return { ignoreSubmoduleImports, currentPackageDependencies };
  },

  async optimize({ contents, map, logger, options, config }) {
    const { currentPackageDependencies } = config;
    if (Object.keys(currentPackageDependencies).length === 0) {
      logger.verbose({
        message: `No dependencies found in package-lock.json; Nothing to do.`,
      });
      return { contents, map };
    }

    const code = contents.toString();
    const ast = await getAST(code);
    assert.ok(ast, "ast is empty");

    const replacements: {
      start: number;
      end: number;
      versionedPackageName: string;
    }[] = [];

    traverseAST(ast.program, (node: Node) => {
      // we could support static requires here
      // if you find yourself to look through the code to add this feature,
      // see https://github.com/parcel-bundler/parcel/blob/f53f4503799a07e3a01452f5e53ead44c30ebc53/packages/dev/eslint-plugin/src/utils.js#L20-L28
      // for a starting point
      if (isImportDeclaration(node)) {
        if (!node.source.value || typeof node.source.value !== "string") {
          // an unnamed or dynamic import, skip
          logger.verbose({ message: `Skipping unnamed or dynamic import` });
          return;
        }

        const packageRef = node.source.value;
        const parsedPackage = parsePackage(packageRef);
        logger.verbose({
          message: `Parsed package: ${JSON.stringify(parsedPackage)}`,
        });
        if (parsedPackage.version !== "latest") {
          // already versioned, skip
          logger.verbose({
            message: `Package ${parsedPackage.name} is already versioned, skipping`,
          });
          return;
        }
        if (
          config.ignoreSubmoduleImports &&
          parsedPackage.path.trim().length > 0
        ) {
          logger.verbose({
            message: `Ignoring sub module import: ${packageRef}`,
          });
          return;
        }

        const { name: packageName } = parsedPackage;
        if (isBuiltin(packageName)) {
          logger.verbose({
            message: `Skipping built-in package '${packageName}'`,
          });
          return;
        }
        if (packageName in currentPackageDependencies) {
          logger.verbose({
            message: `Found package '${packageName}' in current dependencies`,
          });
          const version = currentPackageDependencies[packageName];
          logger.verbose({
            message: `Version for '${packageName}': ${version}`,
          });
          parsedPackage.version = version;
          const versionedPackageName = `${parsedPackage.name}@${parsedPackage.version}${parsedPackage.path}`;
          logger.verbose({
            message: `Versioned package name: ${versionedPackageName}`,
          });
          replacements.push({
            start: node.source.start,
            end: node.source.end,
            versionedPackageName,
          });
        } else {
          logger.verbose({
            message: `Could not find package '${packageName}' in current dependencies`,
          });
        }
      }
    });

    // sort descending so we can replace without having to adjust the indices
    replacements.sort((a, b) => b.start - a.start);

    const magicString = new MagicString(code);
    for (const { start, end, versionedPackageName } of replacements) {
      logger.verbose({
        message: `Replacing ${code.slice(start, end)} with ${versionedPackageName}`,
      });
      magicString.overwrite(start + 1, end - 1, versionedPackageName);
    }

    const modifiedCode = magicString.toString();
    map?.addVLQMap(magicString.generateMap({ hires: true }));

    return { contents: modifiedCode, map: map };
  },
});
