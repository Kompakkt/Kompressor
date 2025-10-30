FROM ghcr.io/igd-geo/schwarzwald:latest

# Schwarzwald dependencies
RUN apt-get update && apt-get -y install unzip curl cmake sqlite3 libboost-system-dev libboost-iostreams-dev libboost-program-options-dev

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
RUN mv ~/.bun/bin/bun /usr/local/bin/bun

WORKDIR /app

## Prepare Schwarzwald ##
RUN mkdir -p /usr/lib/x86_64-linux-gnu/
RUN ln -s /pointcloud-tiler/Schwarzwald/build/Release/Schwarzwald /usr/local/bin/Schwarzwald

# Execute for testing
RUN /usr/local/bin/Schwarzwald

## Prepare gsbox ##
RUN curl -L -o gsbox-amd64-linux-v4.1.1.zip https://github.com/user-attachments/files/22536246/gsbox-amd64-linux-v4.1.1.zip && \
    unzip gsbox-amd64-linux-v4.1.1.zip -d /usr/local/bin/ && \
    rm gsbox-amd64-linux-v4.1.1.zip && \
    chmod +x /usr/local/bin/gsbox && \
    gsbox --version

## Prepare Processing Server ##
COPY bun.lock /app/bun.lock
COPY package.json /app/package.json
RUN bun install

COPY . /app

EXPOSE 7999
ENTRYPOINT []
CMD ["bun", "run", "--watch", "index.ts"]
