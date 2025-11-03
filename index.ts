import Elysia, { t } from "elysia";
import { mkdir, stat } from "node:fs/promises";
import { convertToGLB } from "./obj2gltf";
import { basename, extname, join } from "node:path";
import { convert2xkt, XKT_INFO } from "@xeokit/xeokit-convert";
import WebIFC from "web-ifc";
import packageJson from "./package.json" assert { type: "json" };

const exists = (path: string) =>
  stat(path)
    .then((stats) => stats.isFile() || stats.isDirectory())
    .catch(() => false);

type State = "QUEUED" | "PROCESSING" | "DONE" | "ERROR";

enum MediaType {
  "cloud" = "cloud",
  "model" = "model",
  "splat" = "splat",
  "ifc" = "ifc",
}

const processingMap = new Map<string, ProcessingEntry>();

class ProcessingEntry {
  id: string;
  type: MediaType;
  state: State = "QUEUED";
  #now = Date.now().toString();
  progress: number = 0;

  constructor(id: string, type: MediaType) {
    this.id = id;
    this.type = type;
  }

  static async queue(id: string, type: MediaType) {
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

  async #useLasCopc() {
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

    const outFile = join(
      outPath,
      basename(inFile).replaceAll(/\.(las|laz)$/gi, "") + ".copc.laz",
    );

    const command = `stdbuf -oL lascopcindex64 -i "${inFile}" -o "${outFile}" -verbose >> ${logFile} 2>&1`;
    const process = Bun.$`sh -c "${command}"`.catch(() => {});
    let resolved = false;
    process.then(() => {
      resolved = true;
    });
    return new Promise<void>(async (resolve) => {
      const readProgress = async () => {
        const file = Bun.file(logFile);
        const content = await file.text().catch(() => undefined);
        if (content) {
          const lines = content.split("\n");
          const errorLine = lines.find((line) => line.includes("ERROR"));
          if (errorLine) {
            console.log("[LAS2COPC ERROR]", errorLine);
            this.state = "ERROR";
            return resolve();
          }

          try {
            const progressLine = lines
              .filter((line) => line.includes("] Processed"))
              .at(-1);
            if (progressLine) {
              const percentageString =
                progressLine
                  .split(/\s+/)
                  .at(0)
                  ?.replaceAll(/[\[\]%]/g, "") || "0";
              const percentage = parseFloat(percentageString);
              this.progress = percentage;
            }
          } catch (_) {}
        }
        setTimeout(() => {
          if (!resolved) {
            readProgress();
          } else {
            resolve();
          }
        }, 500);
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

  async #useGsbox() {
    const { inPath, outPath, logFile } = this;

    const glob = new Bun.Glob(`${inPath}/*.{ply,splat,spx}`);
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

    const inFileExt = extname(inFile);
    const inFileName = basename(inFile, inFileExt);
    const command = `gsbox ${inFileExt.slice(1)}2spz -rx 180 -i ${inFile} -o ${join(outPath, `${inFileName}.spz`)}`;
    console.log(`Converting ${inFile} to SPZ...`, command);
    const process = Bun.$`sh -c "${command}"`;
    return process;
  }

  async #useXeokitConvert() {
    const { inPath, outPath, logFile } = this;

    const glob = new Bun.Glob(`${inPath}/*.ifc`);
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

    const inFileExt = extname(inFile);
    const inFileName = basename(inFile, inFileExt);

    return convert2xkt({
      WebIFC,
      source: inFile,
      output: join(outPath, `${inFileName}.v${XKT_INFO.xktVersion}.xkt`),
      log: (msg: unknown) => console.log(msg),
    });
  }

  async start() {
    const { id, state, type } = this;
    if (state !== "QUEUED" || isAnyProcessing()) {
      return;
    }

    const promise = (() => {
      switch (type) {
        case "cloud": {
          return this.#useLasCopc();
        }
        case "splat": {
          return this.#useGsbox();
        }
        case "model": {
          return this.#useObj2Glb();
        }
        case "ifc": {
          return this.#useXeokitConvert();
        }
        default: {
          return Promise.reject(new Error("Invalid type"));
        }
      }
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
    async ({ params: { id, type }, status }) => {
      return ProcessingEntry.queue(id, type)
        .then(() => ({ status: "OK", message: "Queued", id }))
        .catch((error) => ({ status: "ERROR", message: error.toString() }));
    },
    { params: t.Object({ id: t.String(), type: t.Enum(MediaType) }) },
  )
  .get(
    "/progress/:id",
    async ({ params: { id }, status }) => {
      const entry = processingMap.get(id);
      if (!entry) {
        return status("Not Found");
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
    },
    { params: t.Object({ id: t.String() }) },
  )
  .get("/queue", () => {
    return [...processingMap.values()].filter(
      (entry) => entry.state === "QUEUED" || entry.state === "PROCESSING",
    );
  })
  .get("/force-quit", () => {
    process.exit(1);
  });

app.listen({ port: 7999 });

const routeDocs: Record<string, string[]> = {
  "/": ["Healthcheck. Returns { status: 'OK' } if the server is running"],
  "/process/:type/:id": [
    `Queue processing for files based on type (${Object.values(MediaType).join(", ")}) and id.`,
    `Looks for files in "/app/uploads/:type/:id", processes them, and outputs processed files into "/app/uploads/:type/:id/out".`,
  ],
  "/progress/:id": ["Poll progress for id"],
  "/queue": ["Returns all entries that are either queued or processing."],
};

const routeDocString = Object.entries(routeDocs)
  .map(
    ([path, descriptions]) =>
      `\x1B[1m${path}\x1B[22m\n` + descriptions.join("\n"),
  )
  .join("\n\n");

console.log("Listening on port 7999\n");
console.log(`Kompressor Server v${packageJson.version}`);
console.log(routeDocString);
