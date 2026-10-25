# The Linux packages (.deb, .rpm, AppImage) built on any machine with Docker, for when the release
# workflow's Linux runner is not to hand. Ubuntu 22.04, as the workflow uses: what is built here
# links against the WebKitGTK and glibc that machine has, which most distributions released since
# carry too.
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git build-essential file pkg-config \
    libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev libssl-dev patchelf rpm xdg-utils \
    libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev gstreamer1.0-plugins-good gstreamer1.0-libav \
  && rm -rf /var/lib/apt/lists/*

# Node 24 and the pnpm the repository names.
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt-get install -y nodejs \
  && npm install -g pnpm@9.15.9 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"
# The AppImage tool is itself an AppImage, and a container has no FUSE to mount it with.
ENV APPIMAGE_EXTRACT_AND_RUN=1

WORKDIR /src
