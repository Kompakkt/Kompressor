FROM docker.io/oven/bun:debian AS lastools-builder

## Prepare LAStools ##
WORKDIR /opt/
RUN apt-get update && apt-get -y install git build-essential curl unzip cmake libjpeg62 libpng-dev libtiff-dev libjpeg-dev libz-dev libproj-dev liblzma-dev libjbig-dev libzstd-dev libgeotiff-dev libwebp-dev liblzma-dev libsqlite3-dev && \
    git clone https://github.com/LAStools/LAStools.git && \
    cd LAStools && \
    cmake -DCMAKE_BUILD_TYPE=Release . && cmake --build . --parallel $(nproc) && \
    apt-get remove -y build-essential cmake git && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

FROM lastools-builder AS gsbox-builder

## Prepare gsbox ##
RUN curl -L -o gsbox-amd64-linux-v4.5.2.zip https://github.com/user-attachments/files/23879981/gsbox-amd64-linux-v4.5.2.zip && \
    unzip gsbox-amd64-linux-v4.5.2.zip -d /usr/local/bin/ && \
    rm gsbox-amd64-linux-v4.5.2.zip && \
    chmod +x /usr/local/bin/gsbox && \
    gsbox --version && \
    apt-get remove -y curl unzip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

## Prepare Processing Server ##
FROM docker.io/oven/bun:debian

RUN apt-get update && apt-get -y install \
    libjpeg62 libpng16-16 libtiff6 libz1 \
    libproj25 liblzma5 libjbig0 libzstd1 \
    libgeotiff5 libwebp7 libsqlite3-0 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

COPY --from=gsbox-builder /opt/LAStools /opt/LAStools
COPY --from=gsbox-builder /usr/local/bin/gsbox /usr/local/bin/gsbox

ENV PATH="/opt/LAStools/bin64:${PATH}"

WORKDIR /app
COPY bun.lock /app/bun.lock
COPY package.json /app/package.json
RUN bun install --production && bun pm cache rm

COPY . /app

EXPOSE 7999
ENTRYPOINT []
CMD ["bun", "run", "--watch", "index.ts"]
