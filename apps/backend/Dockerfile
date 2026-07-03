FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /usr/src/app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared/package.json packages/shared/
RUN npm ci

COPY --chown=node:node . .
RUN npx prisma generate --schema=apps/backend/prisma/schema.prisma
RUN npm --workspace @tme/backend run build
RUN chown -R node:node /usr/src/app
RUN mkdir -p uploads && chown -R node:node uploads

USER node
EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma && npm --workspace @tme/backend run start"]
