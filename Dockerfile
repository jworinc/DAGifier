
FROM mcr.microsoft.com/playwright:v1.41.0-jammy

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Expose port (if we add a server later)
EXPOSE 3000

# Default command: just keep it alive or run help
# Users can override this to run specific dagifier commands
CMD ["node", "dist/cli.js", "--help"]
