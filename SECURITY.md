# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.x     | ✅ Yes             |
| 1.x     | ⚠️ Critical only   |
| < 1.0   | ❌ No              |

## Reporting a Vulnerability

**DO NOT** open a public GitHub issue for security vulnerabilities.

Instead:

1. Email security details to: [maintainer email]
2. Include:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if available)

3. Allow 48 hours for initial response
4. Do not disclose publicly until patched

## Security Best Practices

### For Users

- Keep dependencies updated: `npm update`
- Use HTTPS for all connections
- Never share your API keys
- Enable 2FA on your account

### For Developers

- Never commit secrets to git
- Use environment variables for sensitive data
- Validate all user input
- Use HTTPS for API calls
- Sanitize user-generated content
- Follow OWASP guidelines

## Security Features

✅ TypeScript for type safety
✅ No backend dependencies in frontend
✅ Axios interceptors for auth
✅ Protected routes
✅ CORS configuration
✅ Security headers
✅ Input validation
✅ Error handling

## Dependencies

All dependencies are regularly audited:

```bash
npm audit
npm audit fix  # Fix vulnerabilities automatically
```

## Compliance

- OWASP Top 10 guidelines
- Data protection regulations
- Secure communication
- Authentication best practices

## Changes Log

### [2.0.0] Security Improvements
- Removed backend dependencies from frontend
- Added TypeScript for type safety
- Improved error handling
- Added security headers
- Updated all dependencies to latest versions
