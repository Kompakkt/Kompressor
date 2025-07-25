# Kompressor

ElysiaJS based server for pre-processing:
- OBJ files to GLB files using [obj2gltf](https://github.com/CesiumGS/obj2gltf) & [gltf-transform](https://github.com/donmccurdy/glTF-Transform)
- LAS/LAZ files using a [modified version](https://github.com/HeyItsBATMAN/schwarzwald) of [schwarzwald](https://github.com/igd-geo/schwarzwald)
- PLY/SPLAT/SPX files to SPZ files using [gsbox](https://github.com/gotoeasy/gsbox)
- IFC files to XKT files using [xeokit-convert](https://github.com/xeokit/xeokit-convert)

## Quick Start

Build the dockerfile, e.g.:
```sh
docker buildx build -t kompressor -f Dockerfile .
```

Run:
```sh
docker run -it --rm --name kompressor --publish 7999:7999 -v /path/to/files:/app/uploads kompressor:latest
```

## API

The server has the following endpoints:
```
/
Healthcheck. Returns { status: 'OK' } if the server is running

/process/:type/:id
Queue processing for files based on type (cloud, model, splat, ifc) and id.
Looks for files in "/app/uploads/:type/:id", processes them, and outputs processed files into "/app/uploads/:type/:id/out".

/progress/:id
Poll progress for id

/queue
Returns all entries that are either queued or processing.
```

**Type** is one of 'model', 'cloud', 'splat' or 'ifc'.

**Id** is the name of the directory containing the files to be processed.

## File Structure

The server inside the docker container expects the following file structure:

**/app/uploads/model** for directories containing OBJ files to be processed.

**/app/uploads/cloud** for directories containing LAS/LAZ files to be processed.

**/app/uploads/splat** for directories containing PLY/SPLAT/SPX files to be processed.

**/app/uploads/ifc** for directories containing IFC files to be processed.

Outputs will be placed into **/app/uploads/[type]/[id]/out**.
