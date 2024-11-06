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

export default new Optimizer({
  async optimize({ contents, map, logger, options }) {
    const code = contents.toString();
    const ast = await getAST(code);
    assert.ok(ast, "ast is empty");

    const packageLockPath = path.join(options.projectRoot, "package-lock.json");
    if (!fs.existsSync(packageLockPath)) {
      // @ts-expect-error next-line
      throw new ThrowableDiagnostic({
        diagnostic: {
          message: `Could not find package-lock.json in project root (${options.projectRoot})`,
        },
      });
    }
    const packageLock = JSON.parse(fs.readFileSync(packageLockPath, "utf8"));
    assert.strictEqual(
      packageLock.lockfileVersion,
      3,
      "Unsupported lockfile version",
    );

    const replacements: {
      start: number;
      end: number;
      versionedPackageName: string;
    }[] = [];

    const currentPackageDependencies = packageLock.packages[""].dependencies;
    if (Object.keys(currentPackageDependencies).length === 0) {
      logger.verbose({ message: `No dependencies found in package-lock.json` });
      return { contents: code, map: map };
    }

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

        const { name: packageName } = parsedPackage;
        if (
          !isBuiltin(packageName) &&
          packageName in currentPackageDependencies
        ) {
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
