FROM node:20-alpine AS build
WORKDIR /app

COPY frontend/package.json /app/
RUN yarn install

COPY frontend /app/
RUN yarn build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
