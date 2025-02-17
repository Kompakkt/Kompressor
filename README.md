# Kompressor

ElysiaJS based server for pre-processing:
- OBJ files to GLB files using [obj2gltf](https://github.com/CesiumGS/obj2gltf) & [gltf-transform](https://github.com/donmccurdy/glTF-Transform)
- LAS/LAZ files using a [modified version](https://github.com/HeyItsBATMAN/schwarzwald) of [schwarzwald](https://github.com/igd-geo/schwarzwald)

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
| Endpoint | Description |
|----------|-------------|
| / | Healthcheck |
| /process/:type/:id | Queue processing for id |
| /progress/:id | Poll progress for id |
| /queue | Get queue status |

**Type** is one of 'model' or 'cloud'.

**Id** is the name of the directory containing the files to be processed.

## File Structure

The server inside the docker container expects the following file structure:

**/app/uploads/model** for directories containing OBJ files to be processed.

**/app/uploads/cloud** for directories containing LAS/LAZ files to be processed.

Outputs will be placed into **/app/uploads/[type]/[id]/out**.
