# AI Chatbot Project Guidelines

## Build Commands

- `pnpm dev`: Start development server with turbo
- `pnpm build`: Build production version
- `pnpm lint`: Run ESLint and Prettier checks
- `pnpm lint:fix`: Fix linting and formatting issues
- `pnpm test`: Run all Playwright tests
- `pnpm exec playwright test tests/chat.test.ts`: Run a single test file

## Database Commands

- `pnpm db:generate`: Generate database migrations
- `pnpm db:migrate`: Execute migrations

## Code Style

- **TypeScript**: Use `type` over `interface`, descriptive PascalCase types, document in separate files
- **Functions**: Arrow functions for callbacks, explicit typing, use async/await
- **Variables**: Use `const` by default, `camelCase` naming, prefix private members with `_`
- **Imports**: Group by external/internal, use named exports, avoid default exports
- **Error Handling**: Use typed errors and explicit Promise rejections with try/catch blocks
- **Components**: One component per file, use composition over inheritance
- **Formatting**: 2 space indentation, 80 character line limit, single quotes
- **Nullability**: Prefer `undefined` over `null`, use optional chaining (`?.`) and nullish coalescing (`??`)
