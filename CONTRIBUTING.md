# Contributing Guidelines

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/flexgigFE.git`
3. Create a feature branch: `git checkout -b feature/your-feature`
4. Install dependencies: `npm install`
5. Start development: `npm run dev`

## Code Style

We use ESLint and Prettier for code formatting.

### Before committing:

```bash
npm run lint:fix
npm run format
npm run type-check
```

## Git Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Commit with clear messages: `git commit -m "feat: add new feature"`
4. Push to your fork: `git push origin feature/your-feature`
5. Create a Pull Request

## Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting
- `refactor` - Code refactoring
- `test` - Adding tests
- `chore` - Maintenance

### Example:
```
feat(auth): add WebAuthn support

Added support for WebAuthn authentication as an alternative to passwords.

Closes #123
```

## Code Review Checklist

- [ ] Code follows style guide
- [ ] No TypeScript errors
- [ ] Changes are tested
- [ ] Documentation is updated
- [ ] No console.log statements in production code
- [ ] No hardcoded values (use constants)

## Adding New Features

### New Page
1. Create `src/pages/NewPage.tsx`
2. Add route to `src/App.tsx`
3. Add navigation link to `src/components/Navbar.tsx`

### New Component
1. Create `src/components/NewComponent.tsx`
2. Export from `src/components/index.ts`
3. Add PropTypes/TypeScript interface

### New API Endpoint
1. Add endpoint to `src/constants/config.ts`
2. Create service function in `src/services/`
3. Use in components via hooks or direct calls

### New Store
1. Create `src/store/newStore.ts` using Zustand
2. Export hook from store file
3. Use with `const store = useNewStore()`

## Testing

Run tests:
```bash
npm run test
```

Add tests for:
- New components
- New hooks
- New utilities
- API services

## Questions?

Open a GitHub issue or reach out to the maintainers.
