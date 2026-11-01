# 🤝 Contributing to Zenify

Thank you for your interest in contributing to Zenify! This guide will help you get started.

---

## Getting Started

### 1. Fork the Repository

Click the "Fork" button on GitHub to create your own copy of Zenify.

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/Zenify.git
cd Zenify
```

### 2. Add Upstream Remote

Keep your fork synced with the main repository:

```bash
git remote add upstream https://github.com/hackerstudent29/Zenify.git
```

---

## Development Setup

### Prerequisites

- **Node.js**: v18.x or higher
- **npm**: v9.x or higher
- **Git**: Latest version
- **Docker**: (Optional)
- **PostgreSQL**: v14+ (if running backend)

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Set up database
npm run prisma:migrate

# Run dev server
npm run dev
```

Backend runs on: `http://localhost:3001`

---

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Run dev server
npm run dev
```

Frontend runs on: `http://localhost:5173`

---

## Making Changes

### Create a Feature Branch

Use descriptive branch names:

```bash
git checkout -b feature/add-new-audio-effect
git checkout -b fix/lyrics-sync-timing-issue
git checkout -b docs/update-contributing-guide
```

### Commit Conventions

We follow Conventional Commits format:

```
<type>(<scope>): <subject>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Build process, dependencies

**Examples**:
```bash
git commit -m "feat(audio-engine): add 8D audio effect"
git commit -m "fix(lyrics): resolve sync timing issue"
git commit -m "docs: update installation guide"
```

---

## Contribution Types

### 🐛 Bug Fixes

1. Search existing issues
2. Create an issue if needed
3. Link your PR to the issue
4. Test thoroughly

### ✨ Feature Additions

1. Check ROADMAP.md
2. Open a discussion with maintainers
3. Create an issue
4. Implement according to specifications

### 📚 Documentation

Documentation improvements always welcome:
- Fix typos
- Add examples
- Update outdated information
- Improve diagrams

### 🌍 Translations

Help Zenify reach more people:
- Add translations in `frontend/src/locales/`
- Follow existing translation structure
- Test the UI in target language

---

## Submitting Changes

### 1. Keep Your Fork Updated

```bash
git fetch upstream
git rebase upstream/main
```

### 2. Push Your Changes

```bash
git push origin feature/your-feature-name
```

### 3. Create a Pull Request

- Fill out the PR template completely
- Provide context and reasoning
- Link related issues

---

## PR Guidelines

### PR Title Format

```
[TYPE] Short description (50 chars max)

Examples:
- [FEATURE] Add crossfade effect
- [FIX] Resolve lyrics sync timing
- [DOCS] Expand installation guide
```

### PR Checklist

- [ ] I've tested my changes locally
- [ ] I've added tests for new features
- [ ] I've updated documentation
- [ ] I've followed code style guidelines
- [ ] No breaking changes

---

## Testing

### Run Tests

```bash
# Frontend
cd frontend
npm run test

# Backend
cd backend
npm run test
```

---

## Resources

- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [ROADMAP.md](ROADMAP.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [SECURITY.md](SECURITY.md)

---

## Getting Help

- **Discord**: [Join our server](https://discord.gg/zenify)
- **Discussions**: [GitHub Discussions](https://github.com/hackerstudent29/Zenify/discussions)
- **Issues**: [GitHub Issues](https://github.com/hackerstudent29/Zenify/issues)

---

## Recognition

Contributors are recognized in:
- [CHANGELOG.md](CHANGELOG.md)
- [README.md](README.md)
- GitHub Releases

---

Thank you for contributing to Zenify! 🙏

**Ready to contribute?** Check out [good first issues](https://github.com/hackerstudent29/Zenify/labels/good%20first%20issue)
