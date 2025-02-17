import Elysia, { t } from "elysia";
import { log } from "node:console";
import { mkdir, stat } from "node:fs/promises";
import { convertToGLB } from "./obj2gltf";

const exists = (path: string) =>
  stat(path)
    .then((stats) => stats.isFile() || stats.isDirectory())
    .catch(() => false);

type State = "QUEUED" | "PROCESSING" | "DONE" | "ERROR";

const processingMap = new Map<string, ProcessingEntry>();

class ProcessingEntry {
  id: string;
  type: "cloud" | "model";
  state: State = "QUEUED";
  #now = Date.now().toString();
  progress: number = 0;

  constructor(id: string, type: "cloud" | "model") {
    this.id = id;
    this.type = type;
  }

  static async queue(id: string, type: "cloud" | "model") {
    const entry = new ProcessingEntry(id, type);
    processingMap.set(id, entry);

    if (!(await exists(entry.inPath))) {
      throw "Not Found";
    }

    entry.start();
    return entry;
  }

  get inPath() {
    return `${basePath}/${this.type}/${this.id}/`;
  }

  get outPath() {
    return `${basePath}/${this.type}/${this.id}/out/`;
  }

  get logFile() {
    return `${basePath}/${this.type}/${this.id}/${this.id}_${this.#now}_log.txt`;
  }

  async #useSchwarzwald() {
    const { inPath, outPath, logFile } = this;

    // Find LAS or LAZ input file
    const glob = new Bun.Glob(`${inPath}/*.{las,laz}`);
    const files = await Array.fromAsync(glob.scan());

    if (files.length > 1) {
      throw new Error("Multiple input files found");
    }

    if (files.length <= 0) {
      throw new Error("No input file found");
    }

    const [inFile] = files;
    const mkdirResult = await mkdir(outPath, { recursive: true })
      .then(() => true)
      .catch(() => false);
    if (!mkdirResult) {
      throw new Error("Failed to create output directory");
    }

    const command = `stdbuf -oL Schwarzwald --tiler --cache-size 256MB --output-format ENTWINE_LAZ -i ${inFile} -o ${outPath} >> ${logFile} 2>&1`;
    const process = Bun.$`sh -c "${command}"`;
    let resolved = false;
    process.then(() => {
      resolved = true;
    });
    return new Promise<void>(async (resolve) => {
      const readProgress = async () => {
        try {
          const file = Bun.file(logFile);
          const content = await file.text();
          const progressLine = content
            .split("\n")
            .filter((line) => line.includes("] indexing:"))
            .at(-1)!;
          const [currentString, _, totalString] = progressLine
            .split(/\s+/)
            .slice(2, 5);
          const [current, total] = [currentString, totalString].map((v) => {
            v = v.replace("k", "").replace(".", "");
            if (v.includes("M")) {
              v = v.replace("M", "");
              return parseFloat(v) * 1000;
            }
            return parseFloat(v);
          });
          const progress = +((current / total) * 100).toFixed(2);
          this.progress = progress;
        } catch (_) {}
        setTimeout(() => {
          if (!resolved) {
            readProgress();
          } else {
            resolve();
          }
        }, 100);
      };
      readProgress();
    });
  }

  async #useObj2Glb() {
    const { inPath, outPath, logFile } = this;
    // Find OBJ input file
    const glob = new Bun.Glob(`${inPath}/*.obj`);
    const files = await Array.fromAsync(glob.scan());

    if (files.length > 1) {
      throw new Error("Multiple input files found");
    }

    if (files.length <= 0) {
      throw new Error("No input file found");
    }

    const [inFile] = files;
    const mkdirResult = await mkdir(outPath, { recursive: true })
      .then(() => true)
      .catch(() => false);
    if (!mkdirResult) {
      throw new Error("Failed to create output directory");
    }

    console.log(`Converting ${inFile} to GLB...`);
    return new Promise<void>(async (resolve) => {
      for await (const progress of convertToGLB(inFile)) {
        const cleanProgress = +(progress * 100).toFixed(2);
        this.progress = cleanProgress;
      }
      resolve();
    });
  }

  async start() {
    const { id, state, type } = this;
    if (state !== "QUEUED" || isAnyProcessing()) {
      return;
    }

    const promise = (() => {
      if (type === "cloud") {
        return this.#useSchwarzwald();
      } else if (type === "model") {
        return this.#useObj2Glb();
      }
      return Promise.reject(new Error("Invalid type"));
    })();

    promise
      .then(() => {
        console.log("Process finished", id);
        this.state = "DONE";
      })
      .catch((err) => {
        console.log("Process failed", id, err);
        this.state = "ERROR";
      });

    console.log("Processing started", id);
    this.state = "PROCESSING";
  }
}

const basePath = "/app/uploads/";

const isAnyProcessing = () =>
  [...processingMap.values()].some((entry) => entry.state === "PROCESSING");

const app = new Elysia()
  .get("/", () => ({ status: "OK" }))
  .get(
    "/process/:type/:id",
    async ({ params: { id, type }, error }) => {
      return ProcessingEntry.queue(id, type)
        .then(() => ({ status: "OK", message: "Queued", id }))
        .catch((error) => ({ status: "ERROR", message: error.toString() }));
    },
    {
      params: t.Object({
        id: t.String(),
        type: t.Enum({
          cloud: "cloud",
          model: "model",
        }),
      }),
    },
  )
  .get("/progress/:id", async ({ params: { id }, error }) => {
    const entry = processingMap.get(id);
    if (!entry) {
      return error("Not Found");
    }

    if (entry.state === "DONE") {
      return { progress: 100, finished: true, state: entry.state };
    }
    if (entry.state === "ERROR") {
      return {
        progress: -1,
        finished: false,
        state: entry.state,
        message: "Processing failed",
      };
    }
    if (entry.state === "QUEUED") {
      entry.start();
      return { progress: 0, finished: false, state: entry.state };
    }

    return {
      progress: entry.progress,
      finished: false,
      state: entry.state,
    };
  })
  .get("/queue", () => {
    return [...processingMap.values()].filter(
      (entry) => entry.state === "QUEUED" || entry.state === "PROCESSING",
    );
  });

app.listen({ port: 7999 });

const routeDocs = [
  ["/", "Healthcheck"],
  ["/process/:type/:id", "Queue processing for id"],
  ["/progress/:id", "Poll progress for id"],
  ["/queue", "Get queue status  "],
];

const maxPathLength = Math.max(...routeDocs.map(([path]) => path.length));
const routeDocString = routeDocs
  .map(([path, description]) => path.padEnd(maxPathLength) + "\t" + description)
  .join("\n");

console.log("Listening on port 7999");
console.log(routeDocString);
