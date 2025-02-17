import obj2gltf from "obj2gltf";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  center,
  dedup,
  draco,
  flatten,
  instance,
  join,
  palette,
  prune,
  resample,
  sparse,
  textureCompress,
  weld,
} from "@gltf-transform/functions";
import sharp from "sharp";
import draco3d from "draco3dgltf";

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(), // Optional.
    "draco3d.encoder": await draco3d.createEncoderModule(), // Optional.
  });

export const convertToGLB = async (path: string) => {
  console.log(`Converting ${path}`);

  console.time("obj2gltf");
  const glbBuffer = await obj2gltf(path, { binary: true });
  console.timeEnd("obj2gltf");

  console.time("gltf-transform readBinary");
  const document = await io.readBinary(new Uint8Array(glbBuffer));
  console.timeEnd("gltf-transform readBinary");

  console.time("gltf-transform center");
  await document.transform(center());
  console.timeEnd("gltf-transform center");

  console.time("gltf-transform dedup");
  await document.transform(dedup());
  console.timeEnd("gltf-transform dedup");

  console.time("gltf-transform instance");
  await document.transform(instance());
  console.timeEnd("gltf-transform instance");

  console.time("gltf-transform palette");
  await document.transform(palette());
  console.timeEnd("gltf-transform palette");

  console.time("gltf-transform flatten");
  await document.transform(flatten());
  console.timeEnd("gltf-transform flatten");

  console.time("gltf-transform join");
  await document.transform(join());
  console.timeEnd("gltf-transform join");

  console.time("gltf-transform weld");
  await document.transform(weld());
  console.timeEnd("gltf-transform weld");

  console.time("gltf-transform resample");
  await document.transform(resample());
  console.timeEnd("gltf-transform resample");

  console.time("gltf-transform prune");
  await document.transform(prune());
  console.timeEnd("gltf-transform prune");

  console.time("gltf-transform sparse");
  await document.transform(sparse());
  console.timeEnd("gltf-transform sparse");

  console.time("gltf-transform textureCompress");
  await document.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      // WebP supports up to 16383x16383
      resize: [16383, 16383],
      nearLossless: true,
      effort: 100,
      limitInputPixels: false,
    }),
  );
  console.timeEnd("gltf-transform textureCompress");

  console.time("gltf-transform draco");
  await document.transform(draco());
  console.timeEnd("gltf-transform draco");

  console.time("gltf-transform writeBinary");
  const compressedGlb = await io.writeBinary(document);
  console.timeEnd("gltf-transform writeBinary");

  await Bun.write(path.replace(".obj", ".compressed.glb"), compressedGlb);
};
