FROM node:18.0.0-alpine3.14 as builder
LABEL maintainer="Digital Services LLC <digitalandservices@gmail.com>"

RUN set -eux; \
    apk add --no-cache --virtual .build-deps \
      libpng-dev \
      autoconf \
      automake \
      build-base \
      git \
      libtool \
      nasm

RUN set -eux; \
	apk add --no-cache libjpeg libjpeg-turbo-utils

COPY package.json /opt/app/package.json
WORKDIR /opt/app

RUN yarn install --production

COPY . /opt/app

RUN NODE_OPTIONS=--openssl-legacy-provider npm run build

FROM alpine:3.14
LABEL maintainer="George Kutsurua <george@nuclearo.com>"

RUN set -eux; \
    apk add --no-cache nginx

COPY --from=builder /opt/app/build /var/www/html
COPY etc/nginx.conf /etc/nginx/nginx.conf

ENTRYPOINT ["nginx"]
CMD ["-c", "/etc/nginx/nginx.conf"]

EXPOSE 8000