# Development Setup

## Prerequisites

- **Node.js:** 16.x or higher
- **npm:** 7.x or higher (or yarn)
- **Git:** Latest version

## Step 1: Clone Repository

```bash
git clone https://github.com/maltexade/flexgigFE.git
cd flexgigFE
git checkout feature/typescript-react-migration
```

## Step 2: Install Dependencies

```bash
npm install
```

## Step 3: Setup Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:
```env
VITE_BACKEND_URL=https://api.flexgig.com.ng
VITE_APP_NAME=FlexGig
VITE_APP_DESCRIPTION=Cheap Data Plug
VITE_ENABLE_WEBAUTHN=true
VITE_ENABLE_GOOGLE_AUTH=true
```

## Step 4: Start Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Available Commands

```bash
# Development
npm run dev              # Start dev server
npm run dev -- --port 3000  # Custom port

# Building
npm run build            # Production build
npm run preview          # Preview production build

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues
npm run type-check       # Check TypeScript types
npm run format           # Format code with Prettier

# Testing (when added)
npm run test             # Run tests
npm run test:watch       # Watch mode
```

## Project Structure

```
flexgigFE/
├── src/
│   ├── components/       # Reusable UI components
│   ├── pages/            # Page components
│   ├── hooks/            # Custom React hooks
│   ├── services/         # API services
│   ├── store/            # Zustand stores
│   ├── types/            # TypeScript types
│   ├── utils/            # Utility functions
│   ├── constants/        # Constants
│   ├── styles/           # Global styles
│   ├── App.tsx           # Main app component
│   └── main.tsx          # Entry point
├── index.html            # HTML template
├── vite.config.ts        # Vite configuration
├── tailwind.config.ts    # Tailwind configuration
├── tsconfig.json         # TypeScript configuration
├── package.json          # Dependencies
├── .env.example          # Environment template
├── .eslintrc.cjs         # ESLint config
├── .prettierrc           # Prettier config
├── README.md             # Project documentation
├── MIGRATION_GUIDE.md    # Migration from old codebase
├── CONTRIBUTING.md       # Contribution guidelines
└── CHANGELOG.md          # Version history
```

## Debugging

### Using Chrome DevTools

1. Open [http://localhost:5173](http://localhost:5173)
2. Press `F12` to open DevTools
3. Go to Sources tab
4. Set breakpoints in your code

### Using VS Code Debugger

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Launch Chrome",
      "url": "http://localhost:5173",
      "webRoot": "${workspaceFolder}"
    }
  ]
}
```

Then press `F5` to start debugging.

## Common Issues

### Issue: Module not found

**Solution:**
```bash
rm -rf node_modules package-lock.json
npm install
```

### Issue: Port already in use

**Solution:**
```bash
npm run dev -- --port 3000
```

### Issue: TypeScript errors

**Solution:**
```bash
npm run type-check
# Fix errors shown in output
```

### Issue: Hot reload not working

**Solution:** Make sure you're editing files in `src/` directory. Vite only watches `src/`.

## Performance Tips

1. Use `useCallback` for expensive operations
2. Use `useMemo` to memoize values
3. Lazy load components when possible
4. Check bundle size: `npm run build && npm run preview`
5. Use DevTools profiler to identify bottlenecks

## Next Steps

- Read the [README.md](./README.md) for full documentation
- Check [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for migration details
- Review existing components as examples
- Join the team for code reviews

## Need Help?

- Check the documentation
- Search existing GitHub issues
- Create a new GitHub issue
- Contact team members
