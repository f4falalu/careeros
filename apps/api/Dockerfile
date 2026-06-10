FROM node:20-alpine
WORKDIR /app

# System Chromium + its deps (used by Playwright for PDF generation)
RUN apk add --no-cache \
    curl \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Playwright to skip downloading a bundled browser binary — use ours instead
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package.json ./
RUN npm install
COPY . .
EXPOSE 8000
CMD ["npm", "run", "dev"]
