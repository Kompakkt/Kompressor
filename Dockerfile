FROM ghcr.io/heyitsbatman/schwarzwald:latest

RUN apt-get update && apt-get -y install unzip curl cmake sqlite3 libboost-system-dev libboost-iostreams-dev libboost-program-options-dev
RUN curl -fsSL https://bun.sh/install | bash
RUN mv ~/.bun/bin/bun /usr/local/bin/bun

WORKDIR /app

## Prepare Schwarzwald ##
RUN mkdir -p /usr/lib/x86_64-linux-gnu/
RUN ln -s /pointcloud-tiler/Schwarzwald/build/Release/Schwarzwald /usr/local/bin/Schwarzwald

# Execute for testing
RUN /usr/local/bin/Schwarzwald

## Prepare Processing Server ##
COPY bun.lock /app/bun.lock
COPY package.json /app/package.json
RUN bun install

COPY . /app

EXPOSE 7999
ENTRYPOINT []
CMD ["bun", "run", "--watch", "index.ts"]
