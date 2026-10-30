FROM golang:1.25-alpine3.22 AS builder
RUN apk add --no-cache ca-certificates curl patch
WORKDIR /src
RUN curl -fsSL -o /tmp/gluetun.tar.gz https://codeload.github.com/passteque/gluetun/tar.gz/3d1e20c5551e9cae1f9d938dc7b7214a6987f27e \
    && echo '5f382f180780632afe57d9cba03978bc0524e469c8288f72e0f416a7749ac62c  /tmp/gluetun.tar.gz' | sha256sum -c - \
    && tar -xzf /tmp/gluetun.tar.gz --strip-components=1 -C /src
COPY publicip-recovery.patch /tmp/publicip-recovery.patch
RUN patch -p1 < /tmp/publicip-recovery.patch
RUN go test ./internal/publicip ./internal/publicip/api
RUN CGO_ENABLED=0 go build -trimpath -ldflags '-s -w -X main.version=v3.41.3-publicip-recovery.1 -X main.commit=3d1e20c5551e9cae1f9d938dc7b7214a6987f27e -X main.created=local-publicip-recovery' -o /out/gluetun-entrypoint ./cmd/gluetun

FROM qmcgaw/gluetun:v3.41.3@sha256:fa19cc76b2af13d57a8d3dc3066f2ada061b1c761b8aecf989b3877c0486e027
COPY --from=builder /out/gluetun-entrypoint /gluetun-entrypoint
LABEL org.opencontainers.image.version="v3.41.3-publicip-recovery.1"
