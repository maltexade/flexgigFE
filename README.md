# FlexGig Frontend - TypeScript + React + Vite Migration

This is a modern, secure, and performant rewrite of the FlexGig frontend application.

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Fast build tool and dev server
- **React Router v6** - Client-side routing
- **Tailwind CSS** - Utility-first CSS framework
- **Zustand** - Lightweight state management
- **Axios** - HTTP client
- **SimpleWebAuthn** - WebAuthn support

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Layout.tsx
│   ├── Navbar.tsx
│   ├── ProtectedRoute.tsx
│   ├── Modal.tsx
│   ├── Button.tsx
│   ├── Alert.tsx
│   ├── Spinner.tsx
│   └── index.ts
├── pages/              # Page components
│   ├── Home.tsx
│   ├── Dashboard.tsx
│   ├── Profile.tsx
│   ├── NotFound.tsx
│   └── index.ts
├── hooks/              # Custom React hooks
│   ├── useAuth.ts
│   ├── useForm.ts
│   ├── useModal.ts
│   ├── useAsync.ts
│   ├── useProtectedRoute.ts
│   ├── useTransaction.ts
│   ├── useReferral.ts
│   └── index.ts
├── services/           # API services
│   ├── api.ts          # Axios instance
│   ├── auth.ts
│   ├── user.ts
│   ├── referral.ts
│   └── transaction.ts
├── store/              # Zustand stores
│   ├── authStore.ts
│   └── userStore.ts
├── types/              # TypeScript types
│   ├── auth.ts
│   ├── api.ts
│   ├── user.ts
│   └── transaction.ts
├── utils/              # Utility functions
│   ├── formatters.ts
│   ├── validators.ts
│   ├── errors.ts
│   ├── helpers.ts
│   └── constants.ts
├── constants/          # Constants
│   ├── config.ts
│   └── messages.ts
├── styles/             # Global styles
│   └── globals.css
├── App.tsx             # Main app component
└── main.tsx            # Entry point
```

## Getting Started

### Prerequisites

- Node.js 16+
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Environment Variables

Create a `.env` file in the root directory:

```env
VITE_BACKEND_URL=https://api.flexgig.com.ng
VITE_APP_NAME=FlexGig
VITE_APP_DESCRIPTION=Cheap Data Plug
VITE_ENABLE_WEBAUTHN=true
VITE_ENABLE_GOOGLE_AUTH=true
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run type-check` - Check TypeScript types
- `npm run format` - Format code with Prettier

## Key Features

### ✅ Type Safety
- Full TypeScript support
- Type-safe API responses
- Strict null checks

### ✅ State Management
- Zustand for lightweight state management
- Separation of concerns (auth, user stores)

### ✅ Security
- Protected routes
- Secure API client with credential handling
- CORS and security headers configured
- No sensitive data in localStorage

### ✅ Performance
- Code splitting with Vite
- Optimized bundle size
- Lazy loading of routes (can be added)
- Minified production build

### ✅ Developer Experience
- ESLint + Prettier for code quality
- Clear folder structure
- Reusable components and hooks
- Comprehensive error handling

## Migration from Old Codebase

### What Changed

**Before (Vanilla JS)**
- Plain HTML + CSS + JavaScript
- No module system
- Manual DOM manipulation
- No type safety
- Backend dependencies mixed in

**After (React + TypeScript)**
- Component-based architecture
- Type-safe with TypeScript
- Declarative UI with React
- Proper separation of concerns
- Optimized build process

### Key Differences

1. **Authentication**
   - Old: Manual session checking
   - New: `useAuth()` hook + Zustand store

2. **Routing**
   - Old: Navigo router
   - New: React Router v6

3. **State Management**
   - Old: Global variables + DOM state
   - New: Zustand stores

4. **API Calls**
   - Old: Raw axios calls scattered
   - New: Centralized services + hooks

5. **Styling**
   - Old: Tailwind + plain CSS
   - New: Tailwind CSS (improved)

## Testing

To add tests:

```bash
npm install -D vitest @testing-library/react
```

Create test files:
```
src/__tests__/
├── components/
├── hooks/
├── services/
└── utils/
```

## Deployment

The build output is in the `dist/` folder. Deploy it to any static hosting service:

- Vercel
- Netlify
- GitHub Pages
- AWS S3 + CloudFront

## Troubleshooting

### Port already in use

```bash
npm run dev -- --port 3000
```

### Clear cache

```bash
rm -rf node_modules package-lock.json
npm install
```

## License

ISC

## Support

For issues and questions, please open a GitHub issue.
