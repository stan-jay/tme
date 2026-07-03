# Contributing to Transaction Migration Engine

Thank you for your interest in contributing to Transaction Migration Engine (TME).

TME is an AI-assisted data migration platform for accounting, ERP, POS, and e-commerce systems. The project is growing, so contributions are welcome in code, documentation, tests, issue reporting, and architecture discussions.

## Project goal

Help businesses migrate records between systems such as:

- CSV and Excel
- WooCommerce
- Shopify
- Odoo
- QuickBooks Online
- Sage Accounting
- Xero
- Zoho Books
- ERPNext
- Custom ERP systems

The platform focuses on clean data import, field mapping, validation, migration history, audit logs, and safe data transfer.

## How to contribute

You can contribute by:

- Fixing bugs
- Improving documentation
- Creating tests
- Improving validation rules
- Building import/export connectors
- Improving the frontend dashboard
- Improving backend APIs
- Helping with architecture discussions

## Getting started

1. Fork the repository.
2. Clone your fork:

```bash
git clone git@github.com:YOUR_USERNAME/tme.git
cd tme
```

3. Create a new branch:

```bash
git checkout -b feature/your-feature-name
```

4. Install dependencies. For the backend:

```bash
cd backend
npm install
```

For the frontend:

```bash
cd frontend
npm install
```

5. Copy example environment files if present:

```bash
cp .env.example .env
```

6. Start development servers as documented in the repository README.

## Commit message style

Use clear commit messages. Good examples:

```
feat: add CSV upload endpoint
fix: correct invoice validation rule
docs: update setup instructions
refactor: improve migration job service
test: add product import validation tests
```

## Pull request process

Before opening a pull request:

1. Make sure your code runs locally.
2. Check that you did not commit sensitive files.
3. Make sure your changes are focused.
4. Add a clear pull request description.
5. Link the issue you are solving if applicable.

## Code of conduct

Be respectful and constructive. We welcome people who are learning and building in good faith.

## License

By contributing to this project, you agree that your contributions may be included under the license used by this repository.
