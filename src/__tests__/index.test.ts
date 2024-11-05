import { Parcel, createWorkerFarm } from "@parcel/core";
import parcelFs from "@parcel/fs";
import { after, beforeEach, suite, test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rootPath = join(__dirname, "..", "..");
const fixtureRoot = join(rootPath, "src/__tests__/fixtures");

const { MemoryFS } = parcelFs;

suite("parcel-transformer-versioned-imports", async () => {
  const workerFarm = createWorkerFarm();
  let outputFS = new MemoryFS(workerFarm);

  const getParcelInstance = (projectDirName: string) => {
    const projectDir = join(fixtureRoot, projectDirName);
    return new Parcel({
      config: join(projectDir, ".parcelrc"),
      entries: [join(projectDir, "index.js")],
      outputFS,
      workerFarm,
      mode: "production",
    });
  };

  after(() => {
    workerFarm.end();
  });

  beforeEach(async () => {
    outputFS = new MemoryFS(workerFarm);
  });

  test("transforms assets", async (t) => {
    const parcel = getParcelInstance("project_1");
    const { bundleGraph } = await parcel.run();

    const output = await outputFS.readFile(
      bundleGraph.getBundles()[0].filePath,
      "utf8",
    );
    t.assert.snapshot(output);
  });
});
