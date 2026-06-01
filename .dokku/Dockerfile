# Dedicated Dokku production image.
# This mirrors the production `twenty` target from
# `packages/twenty-docker/twenty/Dockerfile` and keeps the Procfile inside the
# resulting image so Dokku can run both `web` and `worker` process types.

FROM node:24-alpine AS common-deps

WORKDIR /app

COPY ./package.json ./yarn.lock ./.yarnrc.yml ./tsconfig.base.json ./nx.json /app/
COPY ./.yarn/releases /app/.yarn/releases
COPY ./.yarn/patches /app/.yarn/patches

COPY ./packages/twenty-emails/package.json /app/packages/twenty-emails/
COPY ./packages/twenty-server/package.json /app/packages/twenty-server/
COPY ./packages/twenty-server/patches /app/packages/twenty-server/patches
COPY ./packages/twenty-ui/package.json /app/packages/twenty-ui/
COPY ./packages/twenty-shared/package.json /app/packages/twenty-shared/
COPY ./packages/twenty-front/package.json /app/packages/twenty-front/
COPY ./packages/twenty-front-component-renderer/package.json /app/packages/twenty-front-component-renderer/
COPY ./packages/twenty-sdk/package.json /app/packages/twenty-sdk/
COPY ./packages/twenty-client-sdk/package.json /app/packages/twenty-client-sdk/

RUN yarn && yarn cache clean && npx nx reset

FROM common-deps AS twenty-server-build

COPY ./packages/twenty-emails /app/packages/twenty-emails
COPY ./packages/twenty-shared /app/packages/twenty-shared
COPY ./packages/twenty-ui /app/packages/twenty-ui
COPY ./packages/twenty-sdk /app/packages/twenty-sdk
COPY ./packages/twenty-client-sdk /app/packages/twenty-client-sdk
COPY ./packages/twenty-server /app/packages/twenty-server

RUN npx nx run twenty-server:lingui:extract && \
    npx nx run twenty-server:lingui:compile && \
    npx nx run twenty-emails:lingui:extract && \
    npx nx run twenty-emails:lingui:compile

RUN npx nx run twenty-server:build

RUN find /app/packages/twenty-server/dist -name '*.d.ts' -delete \
 && rm -rf /app/packages/twenty-server/dist/packages/twenty-server/test

RUN yarn workspaces focus --production twenty-emails twenty-shared twenty-sdk twenty-client-sdk twenty-server

FROM common-deps AS twenty-front-build

ARG REACT_APP_SERVER_BASE_URL

COPY ./.dokku /app/.dokku
COPY ./packages/twenty-front /app/packages/twenty-front
COPY ./packages/twenty-front-component-renderer /app/packages/twenty-front-component-renderer
COPY ./packages/twenty-ui /app/packages/twenty-ui
COPY ./packages/twenty-shared /app/packages/twenty-shared
COPY ./packages/twenty-sdk /app/packages/twenty-sdk
COPY ./packages/twenty-client-sdk /app/packages/twenty-client-sdk

RUN npx nx run twenty-front:lingui:extract && \
    npx nx run twenty-front:lingui:compile

RUN if [ -d /app/.dokku/frontend-build ]; then \
      rm -rf /app/packages/twenty-front/build && \
      cp -R /app/.dokku/frontend-build /app/packages/twenty-front/build && \
      echo "Using pre-built frontend from .dokku/frontend-build"; \
    elif [ -d /app/packages/twenty-front/build ]; then \
      echo "Using pre-built frontend from host"; \
    else \
      NODE_OPTIONS="--max-old-space-size=8192" npx nx build twenty-front; \
    fi

FROM node:24-alpine

RUN apk add --no-cache curl jq postgresql-client

COPY ./packages/twenty-docker/twenty/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
WORKDIR /app/packages/twenty-server

ARG REACT_APP_SERVER_BASE_URL
ENV REACT_APP_SERVER_BASE_URL=$REACT_APP_SERVER_BASE_URL

ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION

COPY --chown=1000 --from=twenty-server-build /app/package.json /app/yarn.lock /app/.yarnrc.yml /app/
COPY --chown=1000 --from=twenty-server-build /app/tsconfig.base.json /app/nx.json /app/
COPY --chown=1000 --from=twenty-server-build /app/.yarn /app/.yarn
COPY --chown=1000 --from=twenty-server-build /app/node_modules /app/node_modules

COPY --chown=1000 --from=twenty-server-build /app/packages/twenty-server/package.json /app/packages/twenty-server/
COPY --chown=1000 --from=twenty-server-build /app/packages/twenty-server/dist /app/packages/twenty-server/dist
COPY --chown=1000 --from=twenty-server-build /app/packages/twenty-server/patches /app/packages/twenty-server/patches

COPY --chown=1000 --from=twenty-server-build /app/packages/twenty-shared/package.json /app/packages/twenty-shared/
COPY --chown=1000 --from=twenty-server-build /app/packages/twenty-shared/dist /app/packages/twenty-shared/dist
COPY --chown=1000 --from=twenty-server-build /app/packages/twenty-emails/package.json /app/packages/twenty-emails/
COPY --chown=1000 --from=twenty-server-build /app/packages/twenty-emails/dist /app/packages/twenty-emails/dist
COPY --chown=1000 --from=twenty-server-build /app/packages/twenty-sdk/package.json /app/packages/twenty-sdk/
COPY --chown=1000 --from=twenty-server-build /app/packages/twenty-client-sdk/package.json /app/packages/twenty-client-sdk/
COPY --chown=1000 --from=twenty-server-build /app/packages/twenty-client-sdk/dist /app/packages/twenty-client-sdk/dist
COPY --chown=1000 --from=twenty-server-build /app/packages/twenty-ui/package.json /app/packages/twenty-ui/
COPY --chown=1000 --from=twenty-server-build /app/packages/twenty-front/package.json /app/packages/twenty-front/

COPY --chown=1000 --from=twenty-front-build /app/packages/twenty-front/build /app/packages/twenty-server/dist/front
COPY --chown=1000 ./Procfile /app/Procfile

RUN mkdir -p /app/.local-storage /app/packages/twenty-server/.local-storage && \
    chown 1000:1000 /app/.local-storage /app/packages/twenty-server/.local-storage

USER 1000

CMD ["node", "dist/main"]
ENTRYPOINT ["/app/entrypoint.sh"]
