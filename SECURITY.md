# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Zenify, please **do not** open a public GitHub issue. Instead, please email **hackerstudent29@gmail.com** with:

1. **Description** of the vulnerability
2. **Steps to reproduce** (if applicable)
3. **Potential impact** (severity: low, medium, high, critical)
4. **Suggested fix** (if you have one)

We will respond within **48 hours** and work with you to resolve the issue before public disclosure.

---

## Security Practices

### 🔐 Data & Privacy
- **Local-first by default**: User music files and preferences are stored locally, never sent to servers unless explicitly shared
- **No tracking**: Zenify does not track user behavior, listening history, or personal data beyond what's necessary for the app to function
- **Open source**: All code is publicly auditable; no hidden data collection

### 🛡️ Authentication
- JWT tokens with expiration for session management
- Passwords hashed with bcrypt (if applicable)
- HTTPS enforced for all external API calls

### 📦 Dependencies
- Regular `npm audit` checks for known vulnerabilities
- Automated Dependabot updates (coming soon)
- Pinned versions for production stability

### 🎵 Audio Content
- **iTunes CDN**: Official, licensed audio streams
- **YouTube**: Official audio channels only (verified)
- **Local files**: User responsibility for copyright compliance

### 🔄 API Security
- Rate limiting on all public endpoints
- CORS properly configured (whitelist-based)
- SQL injection prevention (Prisma ORM handles parameterization)
- Input validation on all endpoints

---

## Known Limitations

⚠️ **What Zenify is NOT:**
- A way to bypass DRM-protected content
- A tool for unauthorized music redistribution
- Anonymous music streaming (user IP is logged for rate limiting)

✅ **What Zenify DOES:**
- Stream from legitimate, legal sources (iTunes, YouTube)
- Support local file playback (user's responsibility)
- Provide privacy-respecting open-source music player

---

## Supported Versions

| Version | Status | Security Updates |
| :--- | :--- | :--- |
| 2.5.x | ✅ Current | Yes |
| 2.4.x | ⚠️ Maintenance | Critical only |
| 2.3.x | ❌ Unsupported | No |
| < 2.3 | ❌ Unsupported | No |

---

## Security Checklist (For Developers)

Before deploying, ensure:

- [ ] All dependencies updated: `npm audit` returns 0 vulnerabilities
- [ ] Secrets not committed: `.env` files in `.gitignore`
- [ ] API keys rotated (if exposed)
- [ ] Rate limiting enabled on backend
- [ ] CORS whitelist contains only trusted domains
- [ ] HTTPS enforced in production
- [ ] SQL queries use parameterized statements (Prisma)
- [ ] Input validation on all endpoints
- [ ] Error messages don't leak sensitive info

---

## Contact

For security concerns, contact: **hackerstudent29@gmail.com**

For non-security bug reports, use [GitHub Issues](https://github.com/hackerstudent29/Zenify/issues).

