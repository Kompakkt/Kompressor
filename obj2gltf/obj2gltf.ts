/** Wrapper for obj2gltf */
import obj2gltfFunc from "obj2gltf";

declare function obj2gltfF(objPath: any, options: any): any;

declare namespace obj2gltfN {
  const defaults: {
    binary: boolean;
    checkTransparency: boolean;
    inputUpAxis: string;
    metallicRoughness: boolean;
    outputUpAxis: string;
    packOcclusion: boolean;
    secure: boolean;
    separate: boolean;
    separateTextures: boolean;
    specularGlossiness: boolean;
    unlit: boolean;
    windingOrderSanitization: boolean;
  };
}

export const obj2gltf = obj2gltfFunc as typeof obj2gltfF;
